import { describe, expect, it } from 'vitest';
import config from '../../shared/url-sanitization.json';
import cases from '../../shared/test-cases.json';
import { ALLOWED_PARAMS, URL_PROPS, sanitizeUrl } from '../src';

describe( 'sanitizeUrl (shared cases)', () => {
	it.each( cases )( '$description', ( { input, expected } ) => {
		expect( sanitizeUrl( input ) ).toBe( expected );
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
