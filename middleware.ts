import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CHOICE_COOKIE, PROPERTY_COOKIE, ROUTE_HEADER, encodeRoute, resolveRoute } from "@/lib/routing";
import { mloRoutingOn } from "@/lib/config";
import { isStealthPublic } from "@/lib/public-paths";
import { TESTER_COOKIE, openWhileLocked, siteLockOn, validTesterCookie } from "@/lib/site-lock";

/**
 * LoanM8 stealth-launch middleware — v9.1 (cookie-aware version).
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

/**
 * v15 (Patch B): state-based MLO routing, resolved here once per request
 * and handed to the app as a request header (ids only; the layout re-reads
 * every fact from the registry). Order: the borrower's explicit choice →
 * the property state they gave us → Vercel's IP region → nothing (ask).
 * The IP region is used in-request only and never stored. Any copy of the
 * header sent by the client is dropped. Routing off → no header. On when
 * MLO_ROUTING=true, or by default on Vercel previews (mloRoutingOn).
 */
function routedHeaders(request: NextRequest): Headers {
  const h = new Headers(request.headers);
  h.delete(ROUTE_HEADER);
  if (mloRoutingOn(process.env.MLO_ROUTING, process.env.VERCEL_ENV)) {
    const route = resolveRoute({
      chosenMloId: request.cookies.get(CHOICE_COOKIE)?.value ?? null,
      propertyState: request.cookies.get(PROPERTY_COOKIE)?.value ?? null,
      ipCountry: request.headers.get("x-vercel-ip-country"),
      ipRegion: request.headers.get("x-vercel-ip-country-region"),
    });
    h.set(ROUTE_HEADER, encodeRoute(route));
  }
  return h;
}

function passThrough(request: NextRequest): NextResponse {
  return NextResponse.next({ request: { headers: routedHeaders(request) } });
}

/** C5: one list (lib/public-paths.ts) shared with robots.txt and sitemap.xml. */
function isPublic(pathname: string): boolean {
  return isStealthPublic(pathname);
}

/** Length-independent string comparison (edge runtime has no timingSafeEqual). */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * /mlo/* is the loan officer admin (lenders, playbook, manual pricing
 * snapshots). HTTP Basic auth against MLO_ADMIN_USER / MLO_ADMIN_PASSWORD
 * (server-side env only). Unset credentials → the area does not exist (404).
 * Checked before the stealth gate, so stealth never exposes it. A stand-in
 * for real accounts, which do not exist in this repo yet.
 */
function adminGate(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (pathname !== "/mlo" && !pathname.startsWith("/mlo/")) return null;
  const user = process.env.MLO_ADMIN_USER;
  const pass = process.env.MLO_ADMIN_PASSWORD;
  const basicOn = process.env.MLO_BASIC_AUTH !== "false" && !!user && !!pass;
  const accountsOn = !!process.env.MLO_OWNER_EMAIL;
  // D1: a Command Center session cookie gets a first pass here; app/mlo/layout.tsx
  // and every action check it properly against the database.
  if (accountsOn && request.cookies.get("lm8_cc_session")?.value && request.nextUrl.searchParams.get("basic") !== "1") {
    const res = passThrough(request);
    res.headers.set("x-robots-tag", "noindex, nofollow");
    res.headers.set("cache-control", "no-store");
    return res;
  }
  if (!basicOn && !accountsOn) return new NextResponse("Not found", { status: 404 });
  const header = request.headers.get("authorization") ?? "";
  if (!basicOn) return signInRedirect(request);
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(":");
      if (i > 0 && safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass)) {
        const res = passThrough(request);
        res.headers.set("x-robots-tag", "noindex, nofollow");
        res.headers.set("cache-control", "no-store");
        return res;
      }
    } catch {
      /* fall through to 401 */
    }
  }
  // D1: with accounts on, people go to the email sign-in; "?basic=1" still asks for the shared login.
  if (accountsOn && !header && request.nextUrl.searchParams.get("basic") !== "1") return signInRedirect(request);
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="LoanM8 MLO admin", charset="UTF-8"' } });
}

function signInRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url, 307);
}

export async function middleware(request: NextRequest) {
  const gated = adminGate(request);
  if (gated) return gated;

  const { pathname } = request.nextUrl;
  const tester = await validTesterCookie(request.cookies.get(TESTER_COOKIE)?.value);

  // C22: the pre-launch lock (lib/site-lock.ts). Without the tester password,
  // pages send you to the password page and API calls are refused.
  if (siteLockOn() && !tester && !openWhileLocked(pathname)) {
    if (pathname.startsWith("/api/")) {
      return new NextResponse(JSON.stringify({ ok: false, error: "LoanM8 is locked for testing. Enter the tester password at /demo." }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/demo";
    url.search = "";
    return NextResponse.redirect(url, 307);
  }

  const stealthMode = process.env.NEXT_PUBLIC_STEALTH_MODE !== "false";

  // Stealth off → site is fully public. Middleware no-ops.
  if (!stealthMode) return passThrough(request);

  // Public paths are always allowed (homepage, demo route, assets, robots, etc.)
  if (isPublic(pathname)) return passThrough(request);

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
  // C22: the cookie's value is now checked against the current password
  // (it used to be enough for the cookie to exist).
  if (tester) return passThrough(request);

  // No cookie, not a public path → redirect to coming-soon
  const url = request.nextUrl.clone();
  url.pathname = "/";
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data).*)"],
};
