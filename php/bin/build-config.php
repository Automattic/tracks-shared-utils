<?php
/**
 * Regenerates php/generated/url-sanitization.php from shared/url-sanitization.json,
 * so PHP loads the config through opcache instead of parsing JSON on every request.
 *
 * Run with `composer build:config` after editing the JSON.
 */

$root   = dirname( __DIR__, 2 );
$source = $root . '/shared/url-sanitization.json';
$target = $root . '/php/generated/url-sanitization.php';

$data = json_decode( (string) file_get_contents( $source ), true );
if ( ! is_array( $data ) ) {
	fwrite( STDERR, "Could not parse $source\n" );
	exit( 1 );
}

/**
 * Like var_export(), but with stable, WordPress-style formatting on every PHP version.
 *
 * @param mixed $value
 */
function export_value( $value, int $indent ): string {
	if ( ! is_array( $value ) ) {
		return var_export( $value, true );
	}
	if ( array() === $value ) {
		return 'array()';
	}
	$is_list = array_keys( $value ) === range( 0, count( $value ) - 1 );
	$pad     = str_repeat( "\t", $indent + 1 );
	$lines   = array();
	foreach ( $value as $key => $item ) {
		$lines[] = $pad . ( $is_list ? '' : var_export( $key, true ) . ' => ' ) . export_value( $item, $indent + 1 ) . ',';
	}
	return "array(\n" . implode( "\n", $lines ) . "\n" . str_repeat( "\t", $indent ) . ')';
}

$php = "<?php\n"
	. "// Generated from shared/url-sanitization.json by `composer build:config`. Do not edit.\n\n"
	. 'return ' . export_value( $data, 0 ) . ";\n";

file_put_contents( $target, $php );
echo "Wrote $target\n";
