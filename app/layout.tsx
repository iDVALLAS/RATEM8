import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import { ANCHOR_LO, STATE_LIST_LONG } from "@/lib/licensing";
import { copy } from "@/lib/copy";
import "./globals.css";

/**
 * Exo — the new primary typeface for RateM8.
 * Geometric sans-serif. Used for headlines, body, and UI.
 *
 * Files live in /public/fonts/. Loaded via next/font/local for
 * automatic font optimization (preload, subset, no FOUT).
 */
const exo = localFont({
  src: [
    { path: "../public/fonts/Exo-Thin.otf", weight: "100", style: "normal" },
    { path: "../public/fonts/Exo-ThinItalic.otf", weight: "100", style: "italic" },
    { path: "../public/fonts/Exo-ExtraLight.otf", weight: "200", style: "normal" },
    { path: "../public/fonts/Exo-ExtraLightItalic.otf", weight: "200", style: "italic" },
    { path: "../public/fonts/Exo-Light.otf", weight: "300", style: "normal" },
    { path: "../public/fonts/Exo-LightItalic.otf", weight: "300", style: "italic" },
    { path: "../public/fonts/Exo-Regular.otf", weight: "400", style: "normal" },
    { path: "../public/fonts/Exo-Italic.otf", weight: "400", style: "italic" },
    { path: "../public/fonts/Exo-Medium.otf", weight: "500", style: "normal" },
    { path: "../public/fonts/Exo-MediumItalic.otf", weight: "500", style: "italic" },
    { path: "../public/fonts/Exo-SemiBold.otf", weight: "600", style: "normal" },
    { path: "../public/fonts/Exo-SemiBoldItalic.otf", weight: "600", style: "italic" },
    { path: "../public/fonts/Exo-Bold.otf", weight: "700", style: "normal" },
    { path: "../public/fonts/Exo-BoldItalic.otf", weight: "700", style: "italic" },
    { path: "../public/fonts/Exo-ExtraBold.otf", weight: "800", style: "normal" },
    { path: "../public/fonts/Exo-ExtraBoldItalic.otf", weight: "800", style: "italic" },
    { path: "../public/fonts/Exo-Black.otf", weight: "900", style: "normal" },
    { path: "../public/fonts/Exo-BlackItalic.otf", weight: "900", style: "italic" },
  ],
  variable: "--font-exo",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Helvetica Neue", "Arial", "sans-serif"],
});

/**
 * Fraunces — used only for the hero tagline ("Loan intelligence.")
 * per the v7 design. Bold serif, no italic, no wonky stylistic sets.
 * Limited to weights 600/700 to keep the bundle small.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  style: ["normal"],
  weight: ["600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const siteTitle = `RateM8 — ${copy.brand.tagline}`;
const siteDescription = `AI-powered mortgage rate shopping. Every loan closed by ${ANCHOR_LO.name}, NMLS-licensed in ${STATE_LIST_LONG}.`;

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  metadataBase: new URL("https://ratem8.com"),
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "https://ratem8.com",
    siteName: "RateM8",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${exo.variable} ${fraunces.variable} ${jetbrains.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
