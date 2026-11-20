import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { openFlow } from "@/lib/mail/flow";
import { requestOrigin } from "@/lib/mail/origin";
import { connectThanks } from "@/lib/cards/service";

export const dynamic = "force-dynamic";
const CARDS_COOKIE = "lm8_cc_cards";

/** GET /api/cc/cards/callback — Thanks.io sends the person back here (D53). */
export async function GET(req: NextRequest) {
  const origin = requestOrigin(req.headers);
  const q = new URL(req.url).searchParams;
  const back = (ok: boolean, line: string) => {
    const res = NextResponse.redirect(new URL(`/mlo/cards?f=${encodeURIComponent(encodeFlash({ ok, lines: [line] }))}`, origin));
    res.cookies.set(CARDS_COOKIE, "", { path: "/api/cc/cards", maxAge: 0 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.redirect(new URL("/sign-in", origin));
  if (q.get("error")) return back(false, q.get("error") === "access_denied" ? "Nothing was connected: the permission wasn't given." : "The connection didn't finish. Try again.");
  const flow = openFlow(req.cookies.get(CARDS_COOKIE)?.value, "thanksio", q.get("state"), u.id);
  const code = q.get("code");
  if (!flow || !code) return back(false, "That connection link expired or was opened in a different browser. Start again from this page.");
  const r = await connectThanks(u, code, origin);
  return r.ok ? back(true, "Thanks.io is connected. Cards you send are paid from your Thanks.io account.") : back(false, r.error);
}
