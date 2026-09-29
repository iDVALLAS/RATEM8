import type { Metadata, Viewport } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { Analytics } from "@vercel/analytics/next";
import { CONFIG, STATE_NAMES_LINE } from "@/lib/config";
import { copy } from "@/lib/copy";
import { themeBootScript } from "@/lib/theme";
import { organizationJsonLd, personJsonLd } from "@/lib/jsonld";
import JsonLd from "@/components/JsonLd";
import ReferralTracker from "@/components/ReferralTracker";
import "./globals.css";

/**
 * Fonts — LOCKED: Fraunces (display), Geist (body/UI), JetBrains Mono
 * (labels/data). All self-hosted through next/font (Google fonts are
 * downloaded at build time and served from /_next/static).
 *
 * Fraunces loads normal + italic so the accent-word treatment
 * (italic serif in M8 Green) is real italic, not synthesized.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  style: ["normal", "italic"],
  weight: "variable",
});

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${fraunces.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        {/* No-flash theme boot: reads the saved theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <JsonLd data={[organizationJsonLd(), ...personJsonLd()]} />
      </head>
      <body>
        {children}
        {/* Vercel Analytics only. No third-party trackers, no cookies set by us. */}
        <Analytics />
        <ReferralTracker />
      </body>
    </html>
  );
}
