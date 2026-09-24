# Tracks URL sanitization spec

This package gives every Tracks surface one allowlist and one algorithm for sanitizing URLs before they are recorded. It ships as two ports that must behave identically:

- **JS/TypeScript:** `@automattic/tracks-shared-utils` (npm)
- **PHP 7.2+:** `automattic/tracks-shared-utils` (Composer)

Both ports read their data from [`shared/url-sanitization.json`](shared/url-sanitization.json) and must pass every case in [`shared/test-cases.json`](shared/test-cases.json). If this document and the test cases disagree, fix whichever one is wrong. Neither port may diverge from them.

## Shared data

`shared/url-sanitization.json` contains:

| Key | Meaning |
| --- | --- |
| `allowedParams.exact` | Query param names that are kept. |
| `allowedParams.prefixes` | A param whose name starts with one of these is kept (e.g. `utm_`). |
| `urlProps` | Tracks event props whose values are URLs and should be passed through `sanitizeUrl` by consumers (`_dl`, `_dr`, `_via_ref`, `_via_url`). |
| `limits.maxDepth` | How many layers of nested URLs are allowed (3). |
| `limits.maxDecodes` | Safety cap on repeated decoding of a single value (10). |

Names are stored in their conventional case for readability. Matching is case-insensitive (see below).

## Public API

| | JS | PHP |
| --- | --- | --- |
| Sanitize a URL | `sanitizeUrl( url: string ): string` | `sanitize_url( string $url ): string` |
| Allowlist | `ALLOWED_PARAMS` (`{ exact, prefixes }`) | `allowed_params(): array` (`[ 'exact' => …, 'prefixes' => … ]`) |
| URL props | `URL_PROPS` | `url_props(): array` |

PHP functions live in the `Automattic\TracksSharedUtils` namespace. PHP exposes the lists as functions rather than constants so the JSON file is only read when it's first needed, not every time Composer loads the package.

`sanitizeUrl` takes an absolute URL string. It returns the same URL with disallowed query params removed, URL-valued params sanitized recursively, and the fragment removed. It never throws for string input.

Consumers sanitize Tracks props themselves by calling `sanitizeUrl` on each prop named in `URL_PROPS` that has a string value. The package does not ship a props helper.

The namespace matters: a global `sanitize_url()` would collide with the WordPress core function of the same name.

## Algorithm

The algorithm works on the raw string. It does **not** use `new URL()`, `parse_url()`, `parse_str()`, `URLSearchParams` or `http_build_query()`. Those APIs normalize differently in JS and PHP, so using them would make the ports drift apart. Everything outside the query string is copied through byte-for-byte, including scheme, host, port and path. Nothing is normalized.

### `sanitizeAtDepth( url, depth )`

The public `sanitizeUrl( url )` is `sanitizeAtDepth( url, 0 )`.

1. **Remove the fragment:** cut `url` at the first `#`.
2. **Split off the query:** split at the first `?` into `base` and `query`. If there is no `?`, return `base`.
3. **Split the query into segments** on `&`. Drop empty segments.
4. **For each segment, in order:**
   1. Split at the first `=` into `rawName` and `rawValue`. If there is no `=`, the segment has no value.
   2. **Match the name.** Decode `rawName` once (see [Decoding](#decoding)), or use it raw if decoding fails. ASCII-lowercase it. The param is allowed if that string equals an ASCII-lowercased `exact` entry or starts with an ASCII-lowercased `prefixes` entry. If it's not allowed, drop the segment.
   3. If the segment has no value, or the value is empty, keep the segment exactly as written (`flags`, `ref=`).
   4. Otherwise run [`sanitizeValue( rawValue, depth )`](#sanitizevalue-rawvalue-depth-). If it returns *drop*, drop the segment. Otherwise output `rawName=<result>`. `rawName` is always kept exactly as written.
5. Join the kept segments with `&`. If any were kept, return `base + "?" + joined`. Otherwise return `base`, with no trailing `?`.

### `sanitizeValue( rawValue, depth )`

1. Build the decode chain: `v0 = rawValue`, and `v(i+1) = decode( vi )`. Stop when decoding fails, or after `maxDecodes` decodes. Also stop after a decode that returns its input unchanged, but still append that unchanged result to the chain. This way an already-unencoded value like `https://a.com/` still counts as `v1`.
2. If the chain stopped because it hit `maxDecodes` while the value was **still changing** (decoding `v(maxDecodes)` would succeed and return a different string), return *drop*.
3. Find the smallest `k >= 1` such that `vk` is [URL-shaped](#url-shaped).
   - If there is such a `k` and `depth + k <= maxDepth`, return `encode( sanitizeAtDepth( vk, depth + k ) )`.
   - If there is such a `k` and `depth + k > maxDepth`, return *drop*.
4. If no decoded value is URL-shaped:
   - If `v1` doesn't exist (the raw value can't be decoded) and `v0` is URL-shaped, return *drop*. This covers an unencoded URL with a malformed `%` in it, which can't be safely parsed.
   - Otherwise return `rawValue` unchanged.

Every decode counts as one layer toward `maxDepth`. A properly encoded chain of nested URLs therefore sits at depths 1, 2 and 3. A double-encoded URL at the top level is already at depth 2.

Values that are not URLs are passed through without any change. Values that are URLs are re-encoded exactly once, so double-encoded input comes out single-encoded and the output may not match the input byte-for-byte. The original proposal accepts this.

### URL-shaped

A decoded value is URL-shaped if either:

- it matches `^[A-Za-z][A-Za-z0-9+.-]*://`, meaning it has a scheme followed by `://` (this includes `android-app://` etc.), or
- it starts with `/` and contains `?`. This covers relative URLs with a query and protocol-relative `//host/?…`.

A relative path with no query (`/wp-admin/`) is not URL-shaped. It is kept as-is because there is nothing to sanitize.

### Decoding

`decode( s )` follows `application/x-www-form-urlencoded` rules:

1. Replace every `+` with a space.
2. Percent-decode every `%XX` into a byte, then interpret the bytes as UTF-8.
3. **Decoding fails** if `s` contains a `%` not followed by two hex digits, or if the resulting bytes are not valid UTF-8.

Port notes:
- **JS:** `decodeURIComponent( s.replace( /\+/g, ' ' ) )`, catching `URIError` as a failure.
- **PHP:** fail on `/%(?![0-9A-Fa-f]{2})/`. Otherwise use `urldecode( $s )` and fail if `preg_match( '//u', $result )` is not `1`.

### Encoding

`encode( s )` UTF-8 encodes `s` and percent-encodes every byte except the RFC 3986 unreserved characters `A–Z a–z 0–9 - _ . ~`, using uppercase hex. Spaces become `%20`, not `+`.

- **PHP:** `rawurlencode( $s )`.
- **JS:** `encodeURIComponent( s )`, then additionally encode `!'()*`.

### Case-insensitive matching

Lowercasing is **ASCII only** (`A–Z` → `a–z`). Before PHP 8.2, `strtolower()` depends on the locale, so the PHP port should use `strtr( $s, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz' )`.

## Known limitations (accepted)

- Non-URL values of allowed params are passed through verbatim, even if they contain an encoded `&notAllowed=…`. Values of allowed params are assumed to be safe to record.
- A value that decodes cleanly at first but fails to decode at a later layer is kept as-is unless an earlier layer was already URL-shaped.
- Top-level input that isn't an absolute URL still goes through the same string algorithm. It is not rejected, but it is not a supported input.

## Test cases

`shared/test-cases.json` is an array of `{ "description", "input", "expected" }` objects, where `expected === sanitizeUrl( input )`. Each port's test suite loads this file and runs every case. Any change in behavior starts as a change to this file.

## Repo layout

```
shared/                   # single source of truth (data + test cases)
js/                       # TypeScript package, published to npm
php/src/, php/tests/      # PHP port
composer.json             # at the repo root, so Packagist can read it; autoloads php/src
```

**Versioning:** a git tag (`vX.Y.Z`) is the one shared version. Composer takes its version from the tag, and `js/package.json`'s `version` is bumped to match in the same release.

**Shared data in the JS build:** the npm package can't reference `../shared` once it's published. Instead, the JS source imports `shared/url-sanitization.json` directly, and `tsup` inlines it into the build output. The PHP port reads the file straight from the repo, which is what Composer installs.

## JS module format

The JS package ships both ESM and CJS, built with `tsup` and wired up through the `exports` map, along with TypeScript type declarations. This keeps older Node and Jest setups in consumers working.
