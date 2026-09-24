import { describe, expect, it } from 'vitest';
import { ALLOWED_PARAMS, sanitizeUrl } from '../src';
import { fuzzInputs } from './fuzz-inputs.mjs';

// No @types/node in this package; only process.env is needed here.
declare const process: { env: Record< string, string | undefined > };

// Override for a longer local run, e.g. `FUZZ_COUNT=200000 FUZZ_SEED=7 npm test`.
const inputs = fuzzInputs( Number( process.env.FUZZ_COUNT ?? 5000 ), Number( process.env.FUZZ_SEED ?? 1 ) );

const lower = ( s: string ) => s.replace( /[A-Z]/g, ( c ) => c.toLowerCase() );

function decode( s: string ): string | null {
	try {
		return decodeURIComponent( s.replace( /\+/g, ' ' ) );
	} catch {
		return null;
	}
}

function isAllowed( rawName: string ): boolean {
	const name = lower( decode( rawName ) ?? rawName );
	return (
		ALLOWED_PARAMS.exact.some( ( n ) => lower( n ) === name ) ||
		ALLOWED_PARAMS.prefixes.some( ( p ) => name.startsWith( lower( p ) ) )
	);
}

const AUTHORITY_START = /^(?:[A-Za-z][A-Za-z0-9+.-]*:)?\/\//;
const USERINFO = /^(?:[A-Za-z][A-Za-z0-9+.-]*:)?\/\/[^/]*@/;

/**
 * Everything in `url` that should have been removed: userinfo, and param names
 * that aren't allowlisted, at the top level and in URLs nested in values.
 */
function leaks( url: string ): string[] {
	const found: string[] = [];
	const q = url.indexOf( '?' );
	if ( USERINFO.test( q === -1 ? url : url.slice( 0, q ) ) ) {
		found.push( `userinfo in ${ url }` );
	}
	if ( q === -1 ) {
		return found;
	}
	for ( const segment of url.slice( q + 1 ).split( '&' ) ) {
		const eq = segment.indexOf( '=' );
		const name = eq === -1 ? segment : segment.slice( 0, eq );
		if ( segment !== '' && ! isAllowed( name ) ) {
			found.push( name );
		}
		// Follow the value down through each layer of encoding into any nested URL.
		let layer = eq === -1 ? '' : segment.slice( eq + 1 );
		for ( let i = 0; i < 10; i++ ) {
			const next = decode( layer );
			if ( next === null || next === layer ) {
				break;
			}
			if ( next.includes( '?' ) || AUTHORITY_START.test( next ) ) {
				found.push( ...leaks( next ) );
				if ( next.includes( '?' ) ) {
					break;
				}
			}
			layer = next;
		}
	}
	return found;
}

// Long runs from FUZZ_COUNT can take a while.
describe( 'sanitizeUrl (properties over fuzzed input)', { timeout: 600_000 }, () => {
	it( 'never throws', () => {
		for ( const input of inputs ) {
			expect( () => sanitizeUrl( input ), input ).not.toThrow();
		}
	} );

	it( 'is idempotent', () => {
		for ( const input of inputs ) {
			const once = sanitizeUrl( input );
			expect( sanitizeUrl( once ), input ).toBe( once );
		}
	} );

	it( 'never outputs a fragment', () => {
		for ( const input of inputs ) {
			expect( sanitizeUrl( input ), input ).not.toContain( '#' );
		}
	} );

	it( 'never outputs userinfo or a disallowed param name at any nesting level', () => {
		for ( const input of inputs ) {
			expect( leaks( sanitizeUrl( input ) ), input ).toEqual( [] );
		}
	} );
} );
