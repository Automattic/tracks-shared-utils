# Tracks URL sanitization spec

This package gives every Tracks surface one allowlist and one algorithm for sanitizing URLs before they are recorded. It ships as two ports that must behave identically:

- **JS/TypeScript:** `@automattic/tracks-shared-utils` (npm)
- **PHP 7.2+:** `automattic/tracks-shared-utils` (Composer)

Both ports take their data from [`shared/url-sanitization.json`](shared/url-sanitization.json) (PHP through a generated copy, see [Repo layout](#repo-layout)) and must pass every case in [`shared/test-cases.json`](shared/test-cases.json). If this document and the test cases disagree, fix whichever one is wrong. Neither port may diverge from them.

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

PHP functions live in the `Automattic\TracksSharedUtils` namespace. PHP exposes the lists as functions rather than constants so the generated config is only loaded when it's first needed, not every time Composer loads the package.

`sanitizeUrl` takes an absolute URL string. It returns the same URL with disallowed query params removed, URL-valued params sanitized recursively, and the fragment removed. It never throws for string input.

**Scope:** query params, fragments and userinfo (`name:extra@` before the host) are sanitized, at the top level and in nested URLs. The scheme, host, port and path are copied through unchanged.

Consumers sanitize Tracks props themselves by calling `sanitizeUrl` on each prop named in `URL_PROPS` that has a string value. The package does not ship a props helper.

The namespace matters: a global `sanitize_url()` would collide with the WordPress core function of the same name.

## Algorithm

The algorithm works on the raw string. It does **not** use `new URL()`, `parse_url()`, `parse_str()`, `URLSearchParams` or `http_build_query()`. Those APIs normalize differently in JS and PHP, so using them would make the ports drift apart. Apart from removing userinfo, everything outside the query string is copied through byte-for-byte, including scheme, host, port and path. Nothing is normalized.

### `sanitizeAtDepth( url, depth )`

The public `sanitizeUrl( url )` is `sanitizeAtDepth( url, 0 )`.

1. **Remove the fragment:** cut `url` at the first `#`.
2. **Split off the query:** split at the first `?` into `base` and `query`. [Remove userinfo](#userinfo) from `base`. If there is no `?`, return `base`.
3. **Split the query into segments** on `&`. Drop empty segments.
4. **For each segment, in order:**
   1. Split at the first `=` into `rawName` and `rawValue`. If there is no `=`, the segment has no value.
   2. **Match the name.** Decode `rawName` once (see [Decoding](#decoding)), or use it raw if decoding fails. ASCII-lowercase it. The param is allowed if that string equals an ASCII-lowercased `exact` entry or starts with an ASCII-lowercased `prefixes` entry. If it's not allowed, drop the segment.
   3. If the segment has no value, or the value is empty, keep the segment exactly as written (`flags`, `ref=`).
   4. Otherwise run [`sanitizeValue( rawValue, depth )`](#sanitizevalue-rawvalue-depth-mink-). If it returns *drop*, drop the segment. Otherwise output `rawName=<result>`. `rawName` is always kept exactly as written.
5. Join the kept segments with `&`. If any were kept, return `base + "?" + joined`. Otherwise return `base`, with no trailing `?`.

### `sanitizeValue( rawValue, depth, minK )`

Sanitizes one param value. The value may be a URL under any number of layers of percent-encoding, so it is decoded one layer at a time and each layer is checked as soon as it's decoded. The result is either a string to output or *drop*.

When in doubt, it fails closed: if a query might be hidden in the value and can't be sanitized, the value is dropped.

`minK` is 1 except in the [recheck](#rechecking-for-a-hidden-query) below.

#### Layers

Start from `v0 = rawValue`. For `k = 1, 2, …`, let `vk = decode( v(k-1) )`, so `vk` is the value after `k` decodes. Run these checks in order. The first one that applies decides the result. If none applies, go on to the next `k`.

1. **Decoding fails.** Nothing below `v(k-1)` can be seen, so a query may be hidden there. If `v(k-1)` is URL-shaped or contains a percent-encoded `?` at any depth (matches `/%(25)*3F/i`), return *drop*. Otherwise return `rawValue` unchanged. This covers an unencoded URL with a malformed `%` in it, and an encoded URL whose query is hidden behind a malformed `%`.
2. **`k > maxDecodes`.** If `vk` differs from `v(k-1)`, the value is too deeply encoded to reason about: return *drop*. Otherwise return `rawValue` unchanged.
3. **`k >= minK` and `vk` is [URL-shaped](#url-shaped).** A URL was found at depth `depth + k`:
   1. If `depth + k > maxDepth`, return *drop*.
   2. Let `sanitized = sanitizeAtDepth( vk, depth + k )`.
   3. If `sanitized` [needs a recheck](#rechecking-for-a-hidden-query), return `sanitizeValue( encode( sanitized ), depth + k - 1, 2 )`.
   4. Otherwise return `encode( sanitized )`.
4. **`vk` equals `v(k-1)`.** The value is fully decoded and no layer was URL-shaped: return `rawValue` unchanged.

Because each layer is checked as soon as it's decoded, a URL-shaped layer is sanitized even if the layers below it are malformed or keep changing past `maxDecodes`. `v1` is checked even when it's unchanged from `v0`, so an unencoded value like `https://a.com/?extra=1` is found at `k = 1`, before check 4 can end the loop.

#### Rechecking for a hidden query

`sanitizeAtDepth` only acts on a literal `?`. Once it has run, another query may still be hidden one or more encoding layers further down. `sanitized` needs a recheck when:

- it contains no literal `?`, and
- it is not URL-shaped, or it contains a percent-encoded `?` (`/%(25)*3F/i`).

For example:

- `vk = a%3Fextra%3D1?notAllowed=1` is URL-shaped only because of its `?`. Sanitizing it gives `a%3Fextra%3D1`, which is no longer URL-shaped but decodes to `a?extra=1`.
- `vk = https://a.com/%3Fextra%3D1` has no literal `?`, so sanitizing leaves it as it is. Its encoded `?` decodes to `https://a.com/?extra=1`.

The recheck is `sanitizeValue( encode( sanitized ), depth + k - 1, 2 )`. Each argument has a job:

- `encode( sanitized )` wraps `sanitized` in one layer, so the recursive call's `v1` is `sanitized` itself.
- `minK = 2` skips checking `v1`, which was just sanitized, and starts at `v2`, the first layer below `sanitized`.
- `depth + k - 1` makes up for the extra layer: `v1` lands at depth `depth + k`, the same as `sanitized`, and `v2` at `depth + k + 1`.

Each recheck goes at least one layer deeper, so the `maxDepth` check ends it within `maxDepth` layers.

#### Output

Values that are not URLs are passed through without any change. Values that are URLs are re-encoded exactly once, however many layers the input had, so double-encoded input comes out single-encoded and the output may not match the input byte-for-byte. The original proposal accepts this.

Every decode counts as one layer toward `maxDepth`. A properly encoded chain of nested URLs therefore sits at depths 1, 2 and 3. A double-encoded URL at the top level is already at depth 2.

`sanitizeUrl` is idempotent: sanitizing its output returns the output unchanged.

| `rawValue` at depth 0 | Output |
| --- | --- |
| `hello%20world` | `hello%20world` (not a URL, unchanged) |
| `https%3A%2F%2Fa.com%2F%3Fextra%3D1%26utm_source%3Dz` | `https%3A%2F%2Fa.com%2F%3Futm_source%3Dz` |
| `https%253A%252F%252Fa.com%252F%253Fextra%253D1` | `https%3A%2F%2Fa.com%2F` (found at depth 2, re-encoded once) |
| `https%3A%2F%2Fa.com%2F%253Fextra%253D1` | `https%3A%2F%2Fa.com%2F` (found by the recheck) |
| `a%253Fextra%253D1%3FnotAllowed%3D1` | `a` (found by the recheck) |

### URL-shaped

A decoded value is URL-shaped if either:

- it has an authority: it matches `^([A-Za-z][A-Za-z0-9+.-]*:)?//`, meaning a scheme followed by `://` (including `android-app://` etc.) or a protocol-relative `//`, or
- it contains `?` anywhere.

The `?` rule fails closed. Anything that might have a query is sanitized, even if it isn't a well-formed URL: `example.com/?…`, `checkout?…`, ` https://…` with leading whitespace, `https:/…` with one slash, or plain text like `what?`. Text after the `?` is dropped unless it's an allowlisted param.

A value with no `?` and no authority (`/wp-admin/`, `mailto:…`) is not URL-shaped. It is kept as-is because it has no query or userinfo to sanitize.

### Userinfo

Only a `base` with an authority (see [URL-shaped](#url-shaped)) has userinfo. The authority runs from after the `//` to the first `/`, or to the end of `base`. If the authority contains `@`, or a percent-encoded `@` at any depth (`/%(25)*40/i`, left by double encoding), remove everything in it up to and including the last one.

- `https://name:extra@wordpress.com/` → `https://wordpress.com/`
- `//name@extra@wordpress.com/` → `//wordpress.com/` (the last `@` wins, as in browsers)
- `https://name%40wordpress.com/` → `https://wordpress.com/`

An `@` in the path or query (`/name@example.com?ref=a@b`) is left alone. So is one in a value with no authority, such as `name@example.com/checkout`, where it's ambiguous whether `name@` is userinfo or part of a path.

Port notes: match the authority's userinfo with `/^[\s\S]*(?:@|%(?:25)*40)/i` (JS) or `/^.*(?:@|%(?:25)*40)/is` (PHP). The greedy match ends at the last delimiter.

### Decoding

`decode( s )` follows `application/x-www-form-urlencoded` rules:

1. Replace every `+` with a space.
2. Percent-decode every `%XX` into a byte, then interpret the bytes as UTF-8.
3. **Decoding fails** if `s` contains a `%` not followed by two hex digits, or if the resulting bytes are not valid UTF-8. Invalid UTF-8 in `s` itself therefore also fails.

Port notes:
- **JS:** fail if `s` contains a lone UTF-16 surrogate, the JS equivalent of invalid UTF-8 input. `encodeURIComponent()` would otherwise throw on it later. Otherwise `decodeURIComponent( s.replace( /\+/g, ' ' ) )`, catching `URIError` as a failure.
- **PHP:** fail on `/%(?![0-9A-Fa-f]{2})/`. Otherwise use `urldecode( $s )` and fail if `preg_match( '//u', $result )` is not `1`.

### Encoding

`encode( s )` UTF-8 encodes `s` and percent-encodes every byte except the RFC 3986 unreserved characters `A–Z a–z 0–9 - _ . ~`, using uppercase hex. Spaces become `%20`, not `+`.

- **PHP:** `rawurlencode( $s )`.
- **JS:** `encodeURIComponent( s )`, then additionally encode `!'()*`.

### Case-insensitive matching

Lowercasing is **ASCII only** (`A–Z` → `a–z`). Before PHP 8.2, `strtolower()` depends on the locale, so the PHP port should use `strtr( $s, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz' )`.

## Known limitations (accepted)

- Non-URL values of allowed params are passed through verbatim, even if they contain an encoded `&notAllowed=…`. Values of allowed params are assumed to be safe to record.
- `;` is not a param separator, so `tab=a;extra=1` is kept.
- Host and path are out of scope (see **Scope** above), so values in path segments are kept.
- Top-level input that isn't an absolute URL still goes through the same string algorithm. It is not rejected, but it is not a supported input.

## Test cases

`shared/test-cases.json` is an array of `{ "description", "input", "expected" }` objects, where `expected === sanitizeUrl( input )`. Each port's test suite loads this file and runs every case. Any change in behavior starts as a change to this file.

Some inputs can't be written in JSON, such as lone surrogates in JS and invalid UTF-8 in PHP. Each port tests these in its own suite.

Beyond the shared cases:

- **Properties (JS):** on seeded fuzzed input, `sanitizeUrl` never throws, is idempotent, never outputs a fragment, and never outputs userinfo or a disallowed param name at any nesting level. The run is 5,000 inputs by default. Set `FUZZ_COUNT` and `FUZZ_SEED` for a longer one.
- **Parity (CI):** the built JS port runs over 100,000 fuzzed inputs, and the PHP port must give byte-identical output for each (`npm run parity:generate`, then `composer parity:check`).
- **Build (JS):** the shared cases also run against the built ESM and CJS bundles (`npm run check:dist`).

## Repo layout

```
shared/                   # single source of truth (data + test cases)
js/                       # TypeScript package, published to npm
php/src/, php/tests/      # PHP port
php/generated/            # PHP copy of shared/url-sanitization.json (generated, committed)
php/bin/                  # dev scripts: config generator, parity check
composer.json             # at the repo root, so Packagist can read it; autoloads php/src
```

**Versioning:** a git tag (`vX.Y.Z`) is the one shared version. Composer takes its version from the tag, and `js/package.json`'s `version` is bumped to match in the same release.

**Shared data in the builds:** the npm package can't reference `../shared` once it's published. Instead, the JS source imports `shared/url-sanitization.json` directly, and `tsup` inlines it into the build output. The PHP port loads `php/generated/url-sanitization.php`, which `composer build:config` generates from the JSON. It's a plain PHP array, so opcache caches it and nothing parses JSON at runtime. The generated file is committed, and CI fails if it's out of date. `shared/` is left out of the Composer archive.

## JS module format

The JS package ships both ESM and CJS, built with `tsup` and wired up through the `exports` map, along with TypeScript type declarations. This keeps older Node and Jest setups in consumers working.
