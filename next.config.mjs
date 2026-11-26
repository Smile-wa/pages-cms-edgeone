/** @type {import('next').NextConfig} */
const nextConfig = {
  // EdgeOne handles compression/caching at the edge; don't leak the framework.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "private-user-images.githubusercontent.com" },
    ],
  },
  experimental: {
    // Trim icon/date helper bundles that are imported widely across the UI.
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
};

export default nextConfig;
