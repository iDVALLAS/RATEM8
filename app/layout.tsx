import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { Analytics } from "@vercel/analytics/next";
import { CONFIG, STATE_NAMES_LINE } from "@/lib/config";
import { copy } from "@/lib/copy";
import { themeBootScript } from "@/lib/theme";
import { organizationJsonLd } from "@/lib/jsonld";
import JsonLd from "@/components/JsonLd";
import { MloProvider } from "@/components/mlo/MloContext";
import { routeContext } from "@/lib/route-context";
import ReferralTracker from "@/components/ReferralTracker";
import "./globals.css";

/**
 * Fonts — Geist (headlines, body, UI) + JetBrains Mono (labels/data).
 * The site brief locked Fraunces for display; the owner chose the sans
 * headline treatment (light Geist, gradient accent words) after a
 * side-by-side, so Fraunces is no longer downloaded. `--font-fraunces`
 * is aliased to Geist in globals.css for any remaining reference.
 */
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500"],
  // Labels only; not on the LCP path. Skip the preload so the display and
  // body fonts get the bandwidth first on slow connections.
  preload: false,
});

const siteTitle = `${CONFIG.brandName} — ${copy.brand.tagline}`;
const siteDescription = `AI-powered mortgage rate shopping. Every loan closed by one licensed loan officer. Licensed in ${STATE_NAMES_LINE}. No lead-selling, no trigger leads, no spam.`;

export const metadata: Metadata = {
  title: {
    default: siteTitle,
    template: `%s — ${CONFIG.brandName}`,
  },
  description: siteDescription,
  metadataBase: new URL(CONFIG.siteUrl),
  applicationName: CONFIG.brandName,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: CONFIG.siteUrl,
    siteName: CONFIG.brandName,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#050B08",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // MLO_ROUTING off → NO_MLO without reading headers, so pages stay static.
  const mloValue = await routeContext();
  return (
    <html lang="en" className={`${GeistSans.variable} ${jetbrains.variable}`} data-type="sans" suppressHydrationWarning>
      <head>
        {/* No-flash theme boot: reads the saved theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {/* Person JSON-LD (MLO name + NMLS) lives on /disclosures only (v14, Edit 6). */}
        <JsonLd data={organizationJsonLd()} />
      </head>
      <body>
        {/* MloContext: resolved per request by middleware (v15) when MLO_ROUTING is on; generic otherwise. */}
        <MloProvider value={mloValue}>{children}</MloProvider>
        {/* Vercel Analytics only. No third-party trackers, no cookies set by us. */}
        <Analytics />
        <ReferralTracker />
      </body>
    </html>
  );
}
