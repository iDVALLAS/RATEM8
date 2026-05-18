import type { Metadata } from "next";
import { Fraunces, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT"],
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

export const metadata: Metadata = {
  title: "RateM8 — Loan intelligence. Free for the people.",
  description:
    "AI-powered mortgage rate shopping. Every loan closed by Jason Shapiro, NMLS-licensed in Washington, Arizona, California, and Texas.",
  metadataBase: new URL("https://ratem8.com"),
  openGraph: {
    title: "RateM8 — Loan intelligence. Free for the people.",
    description:
      "AI-powered mortgage rate shopping. Every loan closed by one licensed loan officer.",
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
