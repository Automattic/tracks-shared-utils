<?php

namespace Automattic\TracksSharedUtils\Tests;

use Automattic\TracksSharedUtils\Config;
use PHPUnit\Framework\TestCase;
use function Automattic\TracksSharedUtils\allowed_params;
use function Automattic\TracksSharedUtils\sanitize_url;
use function Automattic\TracksSharedUtils\url_props;

final class SanitizeUrlTest extends TestCase {
	private static function load_json( string $file ): array {
		return json_decode( (string) file_get_contents( __DIR__ . '/../../shared/' . $file ), true );
	}

	public static function shared_cases(): array {
		$cases = array();
		foreach ( self::load_json( 'test-cases.json' ) as $case ) {
			$cases[ $case['description'] ] = array( $case['input'], $case['expected'] );
		}
		return $cases;
	}

	/**
	 * @dataProvider shared_cases
	 */
	public function test_shared_case( string $input, string $expected ) {
		$this->assertSame( $expected, sanitize_url( $input ) );
	}

	/**
	 * JSON can't hold invalid UTF-8, so these can't be shared cases. The JS
	 * equivalent (lone surrogates) is tested in sanitize-url.test.ts.
	 */
	public function test_drops_a_url_shaped_value_with_invalid_utf8() {
		$this->assertSame(
			'https://wordpress.com/?tab=a',
			sanitize_url( "https://wordpress.com/?redirect_to=https://example.com/\xFF&tab=a" )
		);
		$this->assertSame(
			'https://wordpress.com/?tab=a',
			sanitize_url( "https://wordpress.com/?redirect_to=https%3A%2F%2Fexample.com%2F%3Ftab%3D\xFF&tab=a" )
		);
	}

	public function test_keeps_a_non_url_value_with_invalid_utf8_verbatim() {
		$this->assertSame(
			"https://wordpress.com/?ref=a\xFFb",
			sanitize_url( "https://wordpress.com/?ref=a\xFFb" )
		);
	}

	public function test_generated_config_matches_the_shared_json() {
		$this->assertSame( self::load_json( 'url-sanitization.json' ), Config::get() );
	}

	public function test_exports_the_shared_allowlist() {
		$this->assertSame( self::load_json( 'url-sanitization.json' )['allowedParams'], allowed_params() );
	}

	public function test_exports_the_shared_url_props() {
		$this->assertSame( self::load_json( 'url-sanitization.json' )['urlProps'], url_props() );
	}
}
