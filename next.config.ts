import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // /mlo/pricing uploads the source screenshot or PDF (max 5 MB) with each
  // manual snapshot. Server actions default to a 1 MB body.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  /**
   * L3: security headers on every response. HTTPS is forced by Vercel
   * (http → https); HSTS tells browsers to stay on HTTPS for two years,
   * subdomains included. No "preload" yet: that is a hard-to-undo listing
   * the owner decides on. The microphone stays allowed for this site only
   * (M8 voice); camera and location are off.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
        ],
      },
    ];
  },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: true }];
  },
};

export default nextConfig;
