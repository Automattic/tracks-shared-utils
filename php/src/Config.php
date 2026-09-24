<?php

namespace Automattic\TracksSharedUtils;

/**
 * Lazily loads shared/url-sanitization.json.
 *
 * @internal Use the functions in functions.php instead.
 */
final class Config {
	/** @var array|null */
	private static $data = null;

	/**
	 * @return array{allowedParams: array{exact: string[], prefixes: string[]}, urlProps: string[], limits: array{maxDepth: int, maxDecodes: int}}
	 */
	public static function get(): array {
		if ( null === self::$data ) {
			$path = __DIR__ . '/../../shared/url-sanitization.json';
			$data = json_decode( (string) file_get_contents( $path ), true );
			if ( ! is_array( $data ) ) {
				throw new \RuntimeException( 'Could not load ' . $path );
			}
			self::$data = $data;
		}
		return self::$data;
	}
}
