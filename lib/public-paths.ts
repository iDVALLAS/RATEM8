/**
 * lib/public-paths.ts — what anonymous visitors can reach while the site is
 * in stealth (C5). One list for middleware.ts (who gets through), robots.txt
 * (what crawlers may fetch) and sitemap.xml (what we ask them to index), so
 * the three can never disagree.
 */

/** Pages a person or crawler may read in stealth, and that we want indexed. */
export const STEALTH_PUBLIC_PAGES = [
  "/",
  // C1 (owner 2026-11-01): the live M8 chat is public even in stealth.
  "/chat",
  // Legally required pages (C2 licensing and the Texas complaint notice).
  "/licensing",
  "/licensing/texas",
  "/disclosures",
  "/privacy",
  "/terms",
  // AI-agent readiness.
  "/ai",
] as const;

/** Files and machine routes that are also public in stealth (not pages to index). */
export const STEALTH_PUBLIC_FILES = [
  "/demo",
  // D1: Command Center sign-in (not indexed; the page is noindex).
  "/sign-in",
  // D34: the code step after the emailed link.
  "/sign-in/code",
  // D47: the emailed link lands here; a button signs in.
  "/sign-in/link",
  // D45: loan officers sign themselves up (noindex).
  "/sign-up",
  "/sign-up/confirm",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/favicon.png",
  "/llms.txt",
  "/ai.md",
  "/principles.md",
  "/calculators/methodology.md",
] as const;

/** Path prefixes that are public in stealth. */
export const STEALTH_PUBLIC_PREFIXES = [
  "/demo/",
  "/api/",
  "/states/",
  "/_next/",
  "/fonts/",
  "/audio/",
  "/images/",
  // C1: loan officer headshots shown on the public chat.
  "/team/",
  // D26: each client's own page (a signed link).
  "/my/",
  // D55: a video message's watch page (an unguessable link per person, noindex).
  "/v/",
] as const;

const EXACT = new Set<string>([...STEALTH_PUBLIC_PAGES, ...STEALTH_PUBLIC_FILES]);

export function isStealthPublic(pathname: string): boolean {
  return EXACT.has(pathname) || STEALTH_PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/** True while the site is in stealth (anything but NEXT_PUBLIC_STEALTH_MODE="false"). */
export function stealthOn(): boolean {
  return process.env.NEXT_PUBLIC_STEALTH_MODE !== "false";
}
