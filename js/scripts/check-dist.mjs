/**
 * Runs the shared cases against the built ESM and CJS bundles, to catch
 * problems in the build (inlined config, exports map) that tests on src miss.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as esm from '../dist/index.js';

const cjs = createRequire( import.meta.url )( '../dist/index.cjs' );
const cases = JSON.parse( readFileSync( new URL( '../../shared/test-cases.json', import.meta.url ), 'utf8' ) );

let failures = 0;
for ( const [ format, mod ] of [ [ 'esm', esm ], [ 'cjs', cjs ] ] ) {
	if ( ! Array.isArray( mod.URL_PROPS ) || ! Array.isArray( mod.ALLOWED_PARAMS?.exact ) ) {
		console.error( `${ format }: missing exported constants` );
		failures++;
	}
	for ( const { description, input, expected } of cases ) {
		const actual = mod.sanitizeUrl( input );
		if ( actual !== expected ) {
			console.error( `${ format }: ${ description }\n  expected ${ expected }\n  actual   ${ actual }` );
			failures++;
		}
	}
}

if ( failures > 0 ) {
	process.exit( 1 );
}
console.log( `dist OK: ${ cases.length } shared cases pass in ESM and CJS` );
