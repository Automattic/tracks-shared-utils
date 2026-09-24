/**
 * Seeded random URLs that exercise the sanitizer's edge cases. Shared by the
 * property tests and the JS/PHP parity check, so every input must be valid
 * UTF-8 (no lone surrogates) for PHP to read it as JSON.
 *
 * URLs are built from real structure (nested URLs in param values, encoded
 * 0–3 times) mixed with tokens that break it (stray `%`, `?`, `#`, `@`, …).
 */

const NOISE = [
	'https://', '//', '/', '?', '&', '=', '#', ';', '@', ' ', '+',
	'%', '%25', '%2525', '%3A', '%3a', '%2F', '%2f', '%3F', '%3f', '%253F', '%26', '%3D', '%23', '%2B', '%20', '%00', '%40',
	'%zz', '%E0%A4', '%ED%A0%80', '%C0%AF', '%F4%90%80%80', '%C3%A9', '%E2%84%AA',
	'https%3A%2F%2F', '%2F%2F', 'https%253A%252F%252F', 'name%40', 'name%3Aextra%40',
	'x', 'example.com', 'é', '😀', '!', '*', "'", '(', ')',
];

const NAMES = [ 'tab', 'TAB', 'T%41B', 'ref', 'redirect_to', 'next', 'utm_x', 'UTM_x', 'extra', 'notAllowed', 'x' ];

const PREFIXES = [ 'https://', 'android-app://', '//', '/', '', 'example.com/', ' https://', 'https:/' ];

const USERINFO = [ '', '', 'name@', 'name:extra@', 'name@extra@' ];

/**
 * @param {number} count
 * @param {number} [seed]
 * @returns {string[]}
 */
export function fuzzInputs( count, seed = 1 ) {
	// mulberry32
	let state = seed >>> 0;
	const random = () => {
		state = ( state + 0x6d2b79f5 ) >>> 0;
		let t = state;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
	const pick = ( list ) => list[ Math.floor( random() * list.length ) ];
	const noise = ( max ) => {
		let s = '';
		const length = Math.floor( random() * ( max + 1 ) );
		for ( let i = 0; i < length; i++ ) {
			s += pick( NOISE );
		}
		return s;
	};
	const encode = ( s ) => encodeURIComponent( s ).replace( /[!'()*]/g, ( c ) => '%' + c.charCodeAt( 0 ).toString( 16 ).toUpperCase() );

	/** A URL with a random authority, path, query and fragment, nesting up to `depth` more URLs. */
	const url = ( depth ) => {
		const prefix = pick( PREFIXES );
		let s = prefix + ( prefix.includes( '//' ) ? pick( USERINFO ) + 'example.com' : '' ) + '/' + noise( 2 );
		const params = Math.floor( random() * 4 );
		for ( let i = 0; i < params; i++ ) {
			s += ( i === 0 ? '?' : pick( [ '&', '&', '&', ';', '&&' ] ) ) + pick( NAMES );
			if ( random() < 0.9 ) {
				s += '=' + value( depth );
			}
		}
		if ( random() < 0.2 ) {
			s += '#' + noise( 3 );
		}
		return s;
	};

	/** A param value: noise, or a nested URL encoded 0–3 times. */
	const value = ( depth ) => {
		if ( depth <= 0 || random() < 0.5 ) {
			return noise( 4 );
		}
		let nested = url( depth - 1 );
		const times = Math.floor( random() * 4 );
		for ( let i = 0; i < times; i++ ) {
			nested = encode( nested );
		}
		return random() < 0.2 ? nested + noise( 2 ) : nested;
	};

	const inputs = [];
	for ( let i = 0; i < count; i++ ) {
		inputs.push( random() < 0.2 ? 'https://wordpress.com/?' + noise( 30 ) : url( 4 ) );
	}
	return inputs;
}
