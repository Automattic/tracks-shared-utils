import { describe, expect, it } from 'vitest';
import config from '../../shared/url-sanitization.json';
import cases from '../../shared/test-cases.json';
import { ALLOWED_PARAMS, URL_PROPS, sanitizeUrl } from '../src';

describe( 'sanitizeUrl (shared cases)', () => {
	it.each( cases )( '$description', ( { input, expected } ) => {
		expect( sanitizeUrl( input ) ).toBe( expected );
	} );
} );

// JSON can't hold a lone surrogate, so this can't be a shared case. The PHP
// equivalent (invalid UTF-8) is tested in SanitizeUrlTest.php.
describe( 'sanitizeUrl (lone surrogates)', () => {
	it( 'drops a URL-shaped value containing a lone surrogate instead of throwing', () => {
		expect( sanitizeUrl( 'https://wordpress.com/?redirect_to=https://example.com/\uD800&tab=a' ) ).toBe(
			'https://wordpress.com/?tab=a'
		);
		expect( sanitizeUrl( 'https://wordpress.com/?redirect_to=https%3A%2F%2Fexample.com%2F%3Ftab%3D\uDC00&tab=a' ) ).toBe(
			'https://wordpress.com/?tab=a'
		);
	} );

	it( 'keeps a non-URL value containing a lone surrogate verbatim', () => {
		expect( sanitizeUrl( 'https://wordpress.com/?ref=a\uDC00b' ) ).toBe( 'https://wordpress.com/?ref=a\uDC00b' );
	} );

	it( 'keeps a well-formed surrogate pair', () => {
		expect( sanitizeUrl( 'https://wordpress.com/?redirect_to=https://example.com/\u{1F600}?extra=1' ) ).toBe(
			'https://wordpress.com/?redirect_to=https%3A%2F%2Fexample.com%2F%F0%9F%98%80'
		);
	} );
} );

describe( 'constants', () => {
	it( 'exports the shared allowlist', () => {
		expect( ALLOWED_PARAMS ).toEqual( config.allowedParams );
	} );

	it( 'exports the shared URL props', () => {
		expect( URL_PROPS ).toEqual( config.urlProps );
	} );

	it( 'cannot be mutated by consumers', () => {
		expect( Object.isFrozen( ALLOWED_PARAMS ) ).toBe( true );
		expect( Object.isFrozen( ALLOWED_PARAMS.exact ) ).toBe( true );
		expect( Object.isFrozen( ALLOWED_PARAMS.prefixes ) ).toBe( true );
		expect( Object.isFrozen( URL_PROPS ) ).toBe( true );
	} );
} );
