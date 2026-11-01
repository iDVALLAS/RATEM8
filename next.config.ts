import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
// C2 / L1: a production build fails while config/licensing.ts holds TBD, VERIFY or XXXX.
import { checkLicensing } from "./scripts/check-licensing.mjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // /mlo/pricing uploads the source screenshot or PDF (max 5 MB) with each
  // manual snapshot. Server actions default to a 1 MB body.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: true }];
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD || process.env.NODE_ENV === "production") checkLicensing(process.cwd());
  return nextConfig;
}
