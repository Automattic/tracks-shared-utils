/**
 * Writes fuzzed inputs and the built JS port's output for each one, for
 * `composer parity:check` to compare against the PHP port.
 *
 * Writes one JSON object per line, so the PHP side can stream it.
 *
 * Usage: node scripts/parity-generate.mjs <out.jsonl> [count] [seed]
 */
import { createWriteStream } from 'node:fs';
import { sanitizeUrl } from '../dist/index.js';
import { fuzzInputs } from '../test/fuzz-inputs.mjs';

const [ out, count = '50000', seed = '1' ] = process.argv.slice( 2 );
if ( ! out ) {
	console.error( 'Usage: node scripts/parity-generate.mjs <out.jsonl> [count] [seed]' );
	process.exit( 1 );
}

const inputs = fuzzInputs( Number( count ), Number( seed ) );
const stream = createWriteStream( out );
for ( const input of inputs ) {
	stream.write( JSON.stringify( { input, expected: sanitizeUrl( input ) } ) + '\n' );
}
stream.end( () => console.log( `Wrote ${ inputs.length } cases to ${ out }` ) );
