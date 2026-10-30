import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CHOICE_COOKIE, PROPERTY_COOKIE, ROUTE_HEADER, encodeRoute, resolveRoute } from "@/lib/routing";
import { mloRoutingOn } from "@/lib/config";

/**
 * LoanM8 middleware (L3: the site is public; the stealth gate is gone).
 *
 *  - /mlo/* is the loan officer admin: HTTP Basic auth (adminGate).
 *  - /demo (retired in L3) redirects to /chat?preview=1, the tester path;
 *    /sample-brief redirects to /rate-strategy-brief.
 *  - Every request gets the visitor's MLO route header (routedHeaders).
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
 * A stand-in for real accounts (L5).
 */
function adminGate(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (pathname !== "/mlo" && !pathname.startsWith("/mlo/")) return null;
  const user = process.env.MLO_ADMIN_USER;
  const pass = process.env.MLO_ADMIN_PASSWORD;
  if (!user || !pass) return new NextResponse("Not found", { status: 404 });
  const header = request.headers.get("authorization") ?? "";
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
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="LoanM8 MLO admin", charset="UTF-8"' } });
}

export function middleware(request: NextRequest) {
  const gated = adminGate(request);
  if (gated) return gated;

  // L3: the tester tool moved to /chat?preview=1.
  const { pathname } = request.nextUrl;
  if (pathname === "/demo" || pathname.startsWith("/demo/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "?preview=1";
    return NextResponse.redirect(url, 308);
  }

  // L3: the brief moved off the "sample" URL.
  if (pathname === "/sample-brief") {
    const url = request.nextUrl.clone();
    url.pathname = "/rate-strategy-brief";
    return NextResponse.redirect(url, 308);
  }

  return passThrough(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data).*)"],
};
