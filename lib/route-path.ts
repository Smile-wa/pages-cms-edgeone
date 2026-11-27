/**
 * Normalize a catch-all `[...path]` route param into the repository-relative
 * file path used by the app. EdgeOne may decode `%2F` before the request
 * reaches Next.js, so the same URL can arrive as either one encoded segment
 * or several decoded segments. Joining all segments handles both cases.
 */
export function resolvePathParam(value: string | string[] | undefined): string {
	if (!value) return "";
	const segments = Array.isArray(value) ? value : [value];
	return segments.map((segment) => decodeURIComponent(segment)).join("/");
}
