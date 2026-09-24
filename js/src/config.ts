// The shared data file is inlined into the build by tsup, so the published
// package doesn't depend on files outside `dist/`.
import config from '../../shared/url-sanitization.json';

export interface AllowedParams {
	/** Param names that are kept. Matched case-insensitively. */
	readonly exact: readonly string[];
	/** Param names starting with one of these are kept. Matched case-insensitively. */
	readonly prefixes: readonly string[];
}

export const ALLOWED_PARAMS: AllowedParams = Object.freeze( {
	exact: Object.freeze( [ ...config.allowedParams.exact ] ),
	prefixes: Object.freeze( [ ...config.allowedParams.prefixes ] ),
} );

/** Tracks props whose values are URLs and should be passed through `sanitizeUrl`. */
export const URL_PROPS: readonly string[] = Object.freeze( [ ...config.urlProps ] );

export const MAX_DEPTH: number = config.limits.maxDepth;
export const MAX_DECODES: number = config.limits.maxDecodes;
