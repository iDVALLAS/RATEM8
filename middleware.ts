import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * RateM8 stealth-launch middleware — v9.1 (cookie-aware version).
 *
 * Behavior:
 *  - Anonymous visitors (no demo auth cookie): only / and /demo are
 *    reachable. Every other URL redirects to the coming-soon homepage.
 *  - Authenticated visitors (has demo auth cookie): full site is open.
 *    They can browse /, /demo, /agents, /about, /chat, every subpage,
 *    everything. The cookie is their all-access pass.
 *
 * The cookie check here is shallow — we only check that the cookie
 * EXISTS. The deep hash check (does this cookie's value match the
 * current DEMO_PASSWORD's hash?) still happens inside /demo/page.tsx
 * before the chat content renders. So a stale cookie can browse the
 * marketing pages but can't see the chat without re-entering the
 * password. This is intentional — marketing pages aren't sensitive,
 * the chat experience is.
 *
 * To take the whole site fully public, set NEXT_PUBLIC_STEALTH_MODE=false.
 * The middleware no-ops and everyone sees everything.
 *
 * Change vs v9:
 *  - Added authentication check before the redirect block
 *  - If demo cookie is present, let the request through to ANY page
 *  - Anonymous behavior is identical to v9
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

  // Stealth off → site is fully public. Middleware no-ops.
  if (!stealthMode) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Public paths are always allowed (homepage, demo route, assets, robots, etc.)
  if (isPublic(pathname)) return NextResponse.next();

  // ─── v9.1 NEW: cookie-aware all-access for authenticated testers ───
  //
  // If they have the demo auth cookie, they've proved they have the
  // password at some point in the last 30 days. Let them browse anything.
  //
  // This is a SHALLOW check — we don't validate the cookie value against
  // the current password hash here. That would require computing SHA-256
  // on every request, which adds latency. The deep validation happens
  // inside /demo/page.tsx before the chat content renders. So:
  //
  //   - Anonymous visitor → marketing pages blocked, demo password-gated
  //   - Authenticated visitor → marketing pages open, demo accessible
  //   - Stale cookie visitor → marketing pages open (low risk),
  //     demo prompts for password again (chat still gated)
  const authCookie = request.cookies.get("ratem8_demo_auth");
  if (authCookie?.value) {
    return NextResponse.next();
  }

  // No cookie, not a public path → redirect to coming-soon
  const url = request.nextUrl.clone();
  url.pathname = "/";
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data).*)"],
};
