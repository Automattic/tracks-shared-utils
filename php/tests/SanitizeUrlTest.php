<?php

namespace Automattic\TracksSharedUtils\Tests;

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

	public function test_exports_the_shared_allowlist() {
		$this->assertSame( self::load_json( 'url-sanitization.json' )['allowedParams'], allowed_params() );
	}

	public function test_exports_the_shared_url_props() {
		$this->assertSame( self::load_json( 'url-sanitization.json' )['urlProps'], url_props() );
	}
}
