/**
 * Implements the algorithm in SPEC.md. The PHP port must stay in lockstep, so
 * this deliberately works on raw strings rather than `URL` / `URLSearchParams`,
 * which normalize differently from PHP's URL functions.
 */
import { ALLOWED_PARAMS, MAX_DECODES, MAX_DEPTH } from './config';

const DROP = null;

const asciiLowercase = ( s: string ): string =>
	s.replace( /[A-Z]/g, ( c ) => c.toLowerCase() );

const exactNames = new Set( ALLOWED_PARAMS.exact.map( asciiLowercase ) );
const prefixes = ALLOWED_PARAMS.prefixes.map( asciiLowercase );

// A UTF-16 surrogate without its pair. encodeURIComponent() throws on these.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// The start of a URL with an authority: `scheme://` or protocol-relative `//`.
const AUTHORITY_START = /^(?:[A-Za-z][A-Za-z0-9+.-]*:)?\/\//;

// An authority's userinfo: everything up to its last `@`, including a
// percent-encoded `@` (`%40`, `%2540`, …) left by double encoding.
const USERINFO = /^[\s\S]*(?:@|%(?:25)*40)/i;

// A `?` percent-encoded one or more times (`%3F`, `%253F`, …).
const ENCODED_QUESTION_MARK = /%(?:25)*3F/i;

/**
 * Form-urlencoded decode. Returns null on a malformed `%`, invalid UTF-8, or a
 * lone surrogate (the JS equivalent of invalid UTF-8 input in PHP).
 */
function decode( s: string ): string | null {
	if ( LONE_SURROGATE.test( s ) ) {
		return null;
	}
	try {
		return decodeURIComponent( s.replace( /\+/g, ' ' ) );
	} catch {
		return null;
	}
}

/** RFC 3986 encode, matching PHP's `rawurlencode()`. */
function encode( s: string ): string {
	return encodeURIComponent( s ).replace(
		/[!'()*]/g,
		( c ) => '%' + c.charCodeAt( 0 ).toString( 16 ).toUpperCase()
	);
}

function isUrlShaped( s: string ): boolean {
	return AUTHORITY_START.test( s ) || s.indexOf( '?' ) !== -1;
}

/** Removes `userinfo@` from the authority of a URL's base (the part before any `?`). */
function stripUserinfo( base: string ): string {
	const match = AUTHORITY_START.exec( base );
	if ( match === null ) {
		return base;
	}
	const start = match[ 0 ].length;
	const slash = base.indexOf( '/', start );
	const userinfo = USERINFO.exec( slash === -1 ? base.slice( start ) : base.slice( start, slash ) );
	return userinfo === null ? base : base.slice( 0, start ) + base.slice( start + userinfo[ 0 ].length );
}

function isAllowedName( rawName: string ): boolean {
	const decoded = decode( rawName );
	const name = asciiLowercase( decoded === null ? rawName : decoded );
	return exactNames.has( name ) || prefixes.some( ( p ) => name.indexOf( p ) === 0 );
}

/**
 * @param minK The first layer that may be treated as a URL. Rechecks pass 2 to
 *             skip the layer they already sanitized.
 */
function sanitizeValue( rawValue: string, depth: number, minK = 1 ): string | typeof DROP {
	// Decode one layer at a time. `next` is the value after `k` decodes.
	let layer = rawValue;
	for ( let k = 1; ; k++ ) {
		const next = decode( layer );
		if ( next === null ) {
			// Decoding stopped early, so a query may be hidden in what's left.
			return isUrlShaped( layer ) || ENCODED_QUESTION_MARK.test( layer ) ? DROP : rawValue;
		}
		if ( k > MAX_DECODES ) {
			// Still changing after the decode cap: too deeply encoded to reason about.
			return next === layer ? rawValue : DROP;
		}
		if ( k >= minK && isUrlShaped( next ) ) {
			if ( depth + k > MAX_DEPTH ) {
				return DROP;
			}
			const sanitized = sanitizeAtDepth( next, depth + k );
			// With no `?` left, a query may still be hidden under more encoding
			// (`a%3Fextra%3D1`, `https://a.com/%3Fextra%3D1`). Check the layers below.
			const recheck =
				sanitized.indexOf( '?' ) === -1 &&
				( ! isUrlShaped( sanitized ) || ENCODED_QUESTION_MARK.test( sanitized ) );
			return recheck ? sanitizeValue( encode( sanitized ), depth + k - 1, 2 ) : encode( sanitized );
		}
		if ( next === layer ) {
			return rawValue;
		}
		layer = next;
	}
}

function sanitizeAtDepth( url: string, depth: number ): string {
	const hash = url.indexOf( '#' );
	const withoutFragment = hash === -1 ? url : url.slice( 0, hash );

	const q = withoutFragment.indexOf( '?' );
	if ( q === -1 ) {
		return stripUserinfo( withoutFragment );
	}
	const base = stripUserinfo( withoutFragment.slice( 0, q ) );

	const kept: string[] = [];
	for ( const segment of withoutFragment.slice( q + 1 ).split( '&' ) ) {
		if ( segment === '' ) {
			continue;
		}

		const eq = segment.indexOf( '=' );
		const rawName = eq === -1 ? segment : segment.slice( 0, eq );
		if ( ! isAllowedName( rawName ) ) {
			continue;
		}

		const rawValue = eq === -1 ? '' : segment.slice( eq + 1 );
		if ( rawValue === '' ) {
			kept.push( segment );
			continue;
		}

		const value = sanitizeValue( rawValue, depth );
		if ( value !== DROP ) {
			kept.push( rawName + '=' + value );
		}
	}

	return kept.length > 0 ? base + '?' + kept.join( '&' ) : base;
}

/**
 * Removes query params that aren't allowlisted, recursively sanitizes URLs
 * nested in param values, and strips userinfo and fragments.
 *
 * @param url An absolute URL.
 * @returns The sanitized URL.
 */
export function sanitizeUrl( url: string ): string {
	return sanitizeAtDepth( url, 0 );
}
