const DEV_BASE_URL = "http://localhost:3000";
const BUILD_FALLBACK_URL = "https://localhost";

// Next.js sets NEXT_PHASE during `next build`; npm also exposes the lifecycle
// event name. Both let the build complete before the canonical URL is known.
const isBuildPhase = () =>
	process.env.NEXT_PHASE === "phase-production-build" ||
	["build", "postbuild"].includes(process.env.npm_lifecycle_event ?? "");

export const getBaseUrl = () => {
	const baseUrl = process.env.BASE_URL?.trim();

	if (baseUrl) {
		return baseUrl;
	}

	if (process.env.NODE_ENV !== "production") {
		return DEV_BASE_URL;
	}

	if (isBuildPhase()) {
		return BUILD_FALLBACK_URL;
	}

	throw new Error("Missing BASE_URL. Set BASE_URL in production.");
};
