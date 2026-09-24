<?php

namespace Automattic\TracksSharedUtils;

/**
 * Implements the algorithm in SPEC.md. The JS port must stay in lockstep, so
 * this deliberately works on raw strings rather than parse_url() / parse_str(),
 * which normalize differently from the browser's URL APIs.
 *
 * @internal Use sanitize_url() instead.
 */
final class Sanitizer {
	/** @var array<string, true>|null Lowercased exact names. */
	private static $exact_names = null;

	/** @var string[] Lowercased prefixes. */
	private static $prefixes = array();

	/** @var int */
	private static $max_depth = 0;

	/** @var int */
	private static $max_decodes = 0;

	public static function sanitize_url( string $url ): string {
		self::init();
		return self::sanitize_at_depth( $url, 0 );
	}

	private static function init(): void {
		if ( null !== self::$exact_names ) {
			return;
		}
		$config            = Config::get();
		self::$exact_names = array_fill_keys(
			array_map( array( self::class, 'ascii_lowercase' ), $config['allowedParams']['exact'] ),
			true
		);
		self::$prefixes    = array_map( array( self::class, 'ascii_lowercase' ), $config['allowedParams']['prefixes'] );
		self::$max_depth   = (int) $config['limits']['maxDepth'];
		self::$max_decodes = (int) $config['limits']['maxDecodes'];
	}

	/**
	 * strtolower() is locale-dependent before PHP 8.2.
	 */
	private static function ascii_lowercase( string $s ): string {
		return strtr( $s, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz' );
	}

	/**
	 * Form-urlencoded decode. Returns null on a malformed `%` or invalid UTF-8,
	 * matching JS decodeURIComponent() throwing.
	 *
	 * @return string|null
	 */
	private static function decode( string $s ) {
		if ( preg_match( '/%(?![0-9A-Fa-f]{2})/', $s ) ) {
			return null;
		}
		$decoded = urldecode( $s );
		return 1 === preg_match( '//u', $decoded ) ? $decoded : null;
	}

	private static function is_url_shaped( string $s ): bool {
		return 1 === preg_match( '#^[A-Za-z][A-Za-z0-9+.-]*://#', $s )
			|| ( '/' === substr( $s, 0, 1 ) && false !== strpos( $s, '?' ) );
	}

	private static function is_allowed_name( string $raw_name ): bool {
		$decoded = self::decode( $raw_name );
		$name    = self::ascii_lowercase( null === $decoded ? $raw_name : $decoded );
		if ( isset( self::$exact_names[ $name ] ) ) {
			return true;
		}
		foreach ( self::$prefixes as $prefix ) {
			if ( 0 === strpos( $name, $prefix ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @return string|null The value to output, or null to drop the param.
	 */
	private static function sanitize_value( string $raw_value, int $depth ) {
		// $chain[ $i ] is the value after $i decodes.
		$chain = array( $raw_value );
		while ( count( $chain ) - 1 < self::$max_decodes ) {
			$last = $chain[ count( $chain ) - 1 ];
			$next = self::decode( $last );
			if ( null === $next ) {
				break;
			}
			$chain[] = $next;
			if ( $next === $last ) {
				break;
			}
		}

		// Still changing after the decode cap: too deeply encoded to reason about.
		if ( count( $chain ) - 1 === self::$max_decodes ) {
			$last = $chain[ self::$max_decodes ];
			$next = self::decode( $last );
			if ( null !== $next && $next !== $last ) {
				return null;
			}
		}

		$count = count( $chain );
		for ( $k = 1; $k < $count; $k++ ) {
			if ( self::is_url_shaped( $chain[ $k ] ) ) {
				return $depth + $k <= self::$max_depth
					? rawurlencode( self::sanitize_at_depth( $chain[ $k ], $depth + $k ) )
					: null;
			}
		}

		// An unencoded URL we can't decode can't be safely parsed.
		if ( 1 === $count && self::is_url_shaped( $raw_value ) ) {
			return null;
		}

		return $raw_value;
	}

	private static function sanitize_at_depth( string $url, int $depth ): string {
		$hash             = strpos( $url, '#' );
		$without_fragment = false === $hash ? $url : substr( $url, 0, $hash );

		$q = strpos( $without_fragment, '?' );
		if ( false === $q ) {
			return $without_fragment;
		}
		$base = substr( $without_fragment, 0, $q );

		$kept = array();
		foreach ( explode( '&', (string) substr( $without_fragment, $q + 1 ) ) as $segment ) {
			if ( '' === $segment ) {
				continue;
			}

			$eq       = strpos( $segment, '=' );
			$raw_name = false === $eq ? $segment : substr( $segment, 0, $eq );
			if ( ! self::is_allowed_name( $raw_name ) ) {
				continue;
			}

			$raw_value = false === $eq ? '' : (string) substr( $segment, $eq + 1 );
			if ( '' === $raw_value ) {
				$kept[] = $segment;
				continue;
			}

			$value = self::sanitize_value( $raw_value, $depth );
			if ( null !== $value ) {
				$kept[] = $raw_name . '=' . $value;
			}
		}

		return $kept ? $base . '?' . implode( '&', $kept ) : $base;
	}
}
