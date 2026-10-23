import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:8787";

const nextConfig: NextConfig = {
  transpilePackages: ["@foa/core"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
