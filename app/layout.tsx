import type { Metadata } from "next";
import { Fraunces, Geist, JetBrains_Mono } from "next/font/google";
import { ANCHOR_LO, STATE_LIST_LONG } from "@/lib/licensing";
import { copy } from "@/lib/copy";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
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
      className={`${fraunces.variable} ${geist.variable} ${jetbrains.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
