import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable static optimization for client-heavy app
  // This prevents "self is not defined" errors during build
  experimental: {
    // Disable static page generation
    turbopack: {
      // Set workspace root to silence lockfile warning
      root: '/Users/bumsuklee/git/20251110/bscode/frontend',
    },
  },
  // For development tools with heavy client-side dependencies
  reactStrictMode: false,
};

export default nextConfig;
