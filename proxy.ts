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

export function proxy(request: NextRequest) {
	const pathname = request.nextUrl.pathname;
	if (pathname.startsWith("/api/") && pathname !== "/api/webhook/github" && request.method !== "GET") {
		const originHeader = request.headers.get("Origin");
		const hostHeaders = [
			request.headers.get("Host"),
			request.headers.get("x-forwarded-host"),
			request.nextUrl.host,
		];
		if (!originHeader || !isAllowedOrigin(originHeader, hostHeaders)) {
			return new NextResponse(null, {
				status: 403
			});
		}
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
