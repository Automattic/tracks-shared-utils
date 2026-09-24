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

/** Form-urlencoded decode. Returns null on a malformed `%` or invalid UTF-8. */
function decode( s: string ): string | null {
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
	return (
		/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test( s ) ||
		( s.charAt( 0 ) === '/' && s.indexOf( '?' ) !== -1 )
	);
}

function isAllowedName( rawName: string ): boolean {
	const decoded = decode( rawName );
	const name = asciiLowercase( decoded === null ? rawName : decoded );
	return exactNames.has( name ) || prefixes.some( ( p ) => name.indexOf( p ) === 0 );
}

function sanitizeValue( rawValue: string, depth: number ): string | typeof DROP {
	// chain[ i ] is the value after i decodes.
	const chain = [ rawValue ];
	while ( chain.length - 1 < MAX_DECODES ) {
		const last = chain[ chain.length - 1 ];
		const next = decode( last );
		if ( next === null ) {
			break;
		}
		chain.push( next );
		if ( next === last ) {
			break;
		}
	}

	// Still changing after the decode cap: too deeply encoded to reason about.
	if ( chain.length - 1 === MAX_DECODES ) {
		const last = chain[ MAX_DECODES ];
		const next = decode( last );
		if ( next !== null && next !== last ) {
			return DROP;
		}
	}

	for ( let k = 1; k < chain.length; k++ ) {
		if ( isUrlShaped( chain[ k ] ) ) {
			return depth + k <= MAX_DEPTH ? encode( sanitizeAtDepth( chain[ k ], depth + k ) ) : DROP;
		}
	}

	// An unencoded URL we can't decode can't be safely parsed.
	if ( chain.length === 1 && isUrlShaped( rawValue ) ) {
		return DROP;
	}

	return rawValue;
}

function sanitizeAtDepth( url: string, depth: number ): string {
	const hash = url.indexOf( '#' );
	const withoutFragment = hash === -1 ? url : url.slice( 0, hash );

	const q = withoutFragment.indexOf( '?' );
	if ( q === -1 ) {
		return withoutFragment;
	}
	const base = withoutFragment.slice( 0, q );

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
 * nested in param values, and strips fragments.
 *
 * @param url An absolute URL.
 * @returns The sanitized URL.
 */
export function sanitizeUrl( url: string ): string {
	return sanitizeAtDepth( url, 0 );
}
