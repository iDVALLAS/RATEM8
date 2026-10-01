import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // /mlo/pricing uploads the source screenshot or PDF (max 5 MB) with each
  // manual snapshot. Server actions default to a 1 MB body.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: true }];
  },
};

export default nextConfig;
