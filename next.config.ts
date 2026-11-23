import path from "node:path";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
// C2 / L1: a production build fails while config/licensing.ts holds TBD, VERIFY or XXXX.
import { checkLicensing } from "./scripts/check-licensing.mjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // C5: put <title> and the meta description in <head> for every visitor,
  // not streamed into the body for dynamic pages like /chat (crawlers and
  // Lighthouse read <head>).
  htmlLimitedBots: /.*/,
  // /mlo/pricing uploads the source screenshot or PDF (max 5 MB) with each
  // manual snapshot. Server actions default to a 1 MB body.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // D89.2: add React's upstream hydration replay fix to the browser copy of
  // React that Next.js bundles (the cause of the rare React #418 on Command
  // Center pages). See scripts/react-replay-fix.cjs.
  webpack(config) {
    config.module.rules.push({
      test: /[\\/]next[\\/]dist[\\/]compiled[\\/]react-dom[\\/]cjs[\\/]react-dom-client\.(?:production|development)\.js$/,
      use: [{ loader: path.join(process.cwd(), "scripts", "react-replay-fix.cjs") }],
    });
    return config;
  },
  async redirects() {
    return [
      { source: "/favicon.ico", destination: "/icon.svg", permanent: true },
      // D33: short, bookmarkable addresses for loan officers; /mlo sends each to the right sign-in.
      { source: "/login", destination: "/mlo", permanent: false },
      { source: "/mlo-login", destination: "/mlo", permanent: false },
    ];
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD || process.env.NODE_ENV === "production") checkLicensing(process.cwd());
  return nextConfig;
}
