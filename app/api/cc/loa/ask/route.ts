import { currentUser } from "@/lib/accounts/auth";
import { incr } from "@/lib/m8/kv";
import { askLoa, type Turn } from "@/lib/loa/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** POST /api/cc/loa/ask {question, loanId?, lender?, history?} — a question for your LOA (D62). */
export async function POST(req: Request) {
  const u = await currentUser().catch(() => null);
  if (!u) return json(401, { ok: false, error: "Sign in first." });
  if ((await incr(`cc:loa:ask:${u.id}:${Math.floor(Date.now() / 60_000)}`, 90)) > 12) return json(429, { ok: false, error: "That's a lot of questions in a minute. Give it a moment." });
  const b = (await req.json().catch(() => null)) as { question?: unknown; loanId?: unknown; lender?: unknown; history?: unknown } | null;
  const history: Turn[] = Array.isArray(b?.history) ? (b!.history as unknown[]).flatMap((t) => (t && typeof t === "object" && ((t as Turn).role === "user" || (t as Turn).role === "assistant") && typeof (t as Turn).text === "string" ? [{ role: (t as Turn).role, text: (t as Turn).text }] : [])) : [];
  const r = await askLoa(u, { question: String(b?.question ?? ""), loanId: typeof b?.loanId === "string" && b.loanId ? b.loanId : null, lender: typeof b?.lender === "string" && b.lender ? b.lender : null, history });
  return r.ok ? json(200, { ok: true, text: r.answer.text, sources: r.answer.sources }) : json(400, { ok: false, error: r.error });
}
