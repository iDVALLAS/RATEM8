import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { FLOW_COOKIE, openFlow } from "@/lib/mail/flow";
import { requestOrigin } from "@/lib/mail/origin";
import { connectMailbox } from "@/lib/mail/service";

export const dynamic = "force-dynamic";

/** GET /api/cc/mail/callback/[provider] — Google or Microsoft sends the person back here (D52). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = requestOrigin(req.headers);
  const q = new URL(req.url).searchParams;
  const back = (ok: boolean, line: string) => {
    const res = NextResponse.redirect(new URL(`/mlo/email?f=${encodeURIComponent(encodeFlash({ ok, lines: [line] }))}`, origin));
    res.cookies.set(FLOW_COOKIE, "", { path: "/api/cc/mail", maxAge: 0 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
  const u = await currentUser().catch(() => null);
  if (!u) return NextResponse.redirect(new URL("/sign-in", origin));
  if (provider !== "google" && provider !== "microsoft") return back(false, "That connection isn't one Command Center knows.");
  if (q.get("error")) return back(false, q.get("error") === "access_denied" ? "Nothing was connected: the permission wasn't given." : "The connection didn't finish. Try again.");
  const flow = openFlow(req.cookies.get(FLOW_COOKIE)?.value, provider, q.get("state"), u.id);
  const code = q.get("code");
  if (!flow || !code) return back(false, "That connection link expired or was opened in a different browser. Start again from this page.");
  const r = await connectMailbox(u, provider, code, flow.verifier, origin);
  return r.ok ? back(true, `Connected. Emails to clients now go from ${r.email}.`) : back(false, r.error);
}
