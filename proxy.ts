import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isAllowedOrigin(originHeader: string, hostHeaders: (string | null)[]): boolean {
	try {
		const originHost = new URL(originHeader).host.toLowerCase();
		return hostHeaders.some((value) => {
			const host = value?.split(",")[0]?.trim().toLowerCase();
			return Boolean(host && host === originHost);
		});
	} catch {
		return false;
	}
}

// EdgeOne may strip or rewrite Origin/Host on the way to the function. Accept
// any browser-provided same-site signal instead of requiring Origin alone.
// Better Auth performs its own CSRF validation for /api/auth/*, so those
// routes are intentionally left to it.
function isSameSiteRequest(request: NextRequest): boolean {
	const hosts = [
		request.headers.get("Host"),
		request.headers.get("x-forwarded-host"),
		request.nextUrl.host,
	];

	const origin = request.headers.get("Origin");
	if (origin) return isAllowedOrigin(origin, hosts);

	const referer = request.headers.get("Referer");
	if (referer) return isAllowedOrigin(referer, hosts);

	const fetchSite = request.headers.get("Sec-Fetch-Site");
	return fetchSite === "same-origin" || fetchSite === "none";
}

export function proxy(request: NextRequest) {
	const pathname = request.nextUrl.pathname;
	const isAuthRoute = pathname.startsWith("/api/auth/");
	if (
		pathname.startsWith("/api/") &&
		pathname !== "/api/webhook/github" &&
		!isAuthRoute &&
		request.method !== "GET" &&
		!isSameSiteRequest(request)
	) {
		return new NextResponse(null, {
			status: 403
		});
	}

	const requestHeaders = new Headers(request.headers);
	const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
	requestHeaders.set("x-return-to", returnTo);

	return NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});
}

export const config = {
	// Static assets never need the CSRF check or x-return-to header.
	// Skipping them avoids an extra edge-function hop on every asset request.
	matcher: "/((?!_next/static|_next/image|favicon.ico|icon.svg|images/|assets/).*)"
}
