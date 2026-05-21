import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * RateM8 stealth-launch middleware.
 *
 * Per v9 spec: only /demo (and its assets/API needs) is publicly
 * accessible. Everything else redirects to the coming-soon homepage.
 *
 * The homepage itself ("/") IS allowed — it renders the coming-soon page.
 * The /demo route is allowed but gated by password (handled inside the page).
 *
 * To take the site live later (when M8 is real and the marketing pages
 * are polished), set NEXT_PUBLIC_STEALTH_MODE=false in Vercel env. The
 * middleware no-ops and the full site becomes accessible.
 *
 * Routes always public (regardless of stealth):
 *   /                       coming-soon page
 *   /demo, /demo/*          the password-gated demo
 *   /api/*                  API routes (chat-question, demo-auth, etc.)
 *   /_next/*, /favicon.*    Next.js assets
 *   /robots.txt             SEO control
 *   /fonts/*                font files
 *
 * Routes hidden in stealth mode (redirect to /):
 *   /agents, /about, /purchase, /refinance, /home-equity,
 *   /loan-types, /tools, /rates, /contact, /privacy
 */

const PUBLIC_PATHS = [
  "/",
  "/demo",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/favicon.png",
];

const PUBLIC_PREFIXES = [
  "/demo/",
  "/api/",
  "/_next/",
  "/fonts/",
  "/audio/",
  "/images/",
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  const stealthMode = process.env.NEXT_PUBLIC_STEALTH_MODE !== "false";

  // If stealth is off, let everything through. This is the "we've launched" state.
  if (!stealthMode) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Allow whitelisted routes through unmodified.
  if (isPublic(pathname)) return NextResponse.next();

  // Everything else: redirect to the coming-soon homepage.
  // Use 307 (temporary) not 301 — we want search engines to re-check after launch.
  const url = request.nextUrl.clone();
  url.pathname = "/";
  return NextResponse.redirect(url, 307);
}

// Match all routes except Next.js internals (those are filtered in `isPublic` too,
// but excluding them here saves middleware invocations).
export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data).*)"],
};
