<?php
/**
 * Checks that the PHP port gives the same output as the JS port for every case
 * written by js/scripts/parity-generate.mjs.
 *
 * Usage: composer parity:check -- <cases.jsonl>
 */

require dirname( __DIR__, 2 ) . '/vendor/autoload.php';

use function Automattic\TracksSharedUtils\sanitize_url;

$file = $argv[1] ?? null;
if ( null === $file ) {
	fwrite( STDERR, "Usage: composer parity:check -- <cases.jsonl>\n" );
	exit( 1 );
}

$handle = fopen( $file, 'r' );
if ( false === $handle ) {
	fwrite( STDERR, "Could not open $file\n" );
	exit( 1 );
}

$total    = 0;
$failures = 0;
while ( false !== ( $line = fgets( $handle ) ) ) {
	$case = json_decode( $line, true );
	if ( ! is_array( $case ) ) {
		fwrite( STDERR, 'Could not parse line ' . ( $total + 1 ) . " of $file\n" );
		exit( 1 );
	}
	++$total;
	$actual = sanitize_url( $case['input'] );
	if ( $actual !== $case['expected'] ) {
		if ( ++$failures <= 10 ) {
			echo "input    {$case['input']}\nJS       {$case['expected']}\nPHP      $actual\n\n";
		}
	}
}

if ( $failures > 0 ) {
	echo "$failures of $total cases differ between JS and PHP\n";
	exit( 1 );
}
echo "Parity OK: $total cases match\n";
