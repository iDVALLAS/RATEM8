/**
 * tests/m8-redteam-remote.spec.ts — the live red team, run against a
 * deployed preview's real chat (C5).
 *
 * The Anthropic key never leaves Vercel: every attack goes through the
 * deployment's own /api/m8-chat, so the test exercises the whole path a
 * borrower uses (bot check, limits, redaction, moderation, the real model
 * and the output guard).
 *
 * Run it with a Vercel share link for the preview (it gets past the
 * preview's login and expires within a day):
 *
 *   M8_REDTEAM_SHARE_URL="https://<preview>.vercel.app/?_vercel_share=…" \
 *     npx vitest run tests/m8-redteam-remote.spec.ts
 *
 * An agent session gets the link from the Vercel connection
 * (get_access_to_vercel_url). The environment must allow `vercel.app`.
 *
 * Paced at one conversation every 4 seconds to stay under the chat's own
 * limit (20 per minute per IP), so a full run takes about 3–4 minutes.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { copy } from "@/lib/copy";
import { guardReply } from "@/lib/m8/guard";
import { prepareTurn } from "@/lib/m8/pipeline";
import { MASK } from "@/lib/second-look/redact";
import type { M8Event } from "@/lib/m8/shared";
import { CASES, LEAK, asMessages } from "./m8-redteam-cases";

const SHARE = process.env.M8_REDTEAM_SHARE_URL?.trim();
const PACE_MS = 4000;

type Reply = { status: number; reply: string; replaced: boolean; userText: string | null; notice: string | null; error: string | null };

let origin = "";
let cookie = "";

/** Opens the share link once and keeps the auth cookie it sets. */
async function login(share: string): Promise<void> {
  origin = new URL(share).origin;
  const res = await fetch(share, { redirect: "manual" });
  const jar = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  cookie = jar.join("; ");
}

/** One conversation through the deployed chat, parsed from its event stream. */
async function ask(messages: ReturnType<typeof asMessages>): Promise<Reply> {
  const res = await fetch(`${origin}/api/m8-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ messages, hp: "", t: 5000 }),
  });
  const out: Reply = { status: res.status, reply: "", replaced: false, userText: null, notice: null, error: null };
  const body = await res.text();
  if (!res.ok) {
    out.error = body.slice(0, 300);
    return out;
  }
  for (const event of body.split("\n\n")) {
    if (!event.startsWith("data: ")) continue;
    const payload = event.slice(6).trim();
    if (payload === "[DONE]") continue;
    const e = JSON.parse(payload) as M8Event;
    if (e.error) out.error = e.error;
    if (e.userText !== undefined) out.userText = e.userText;
    if (e.notice) out.notice = e.notice;
    if (e.replace !== undefined) {
      out.reply = e.replace;
      out.replaced = true;
    }
    if (e.text) out.reply += e.text;
  }
  return out;
}

const pause = () => new Promise((r) => setTimeout(r, PACE_MS));

describe.skipIf(!SHARE)("M8 red team — remote (the deployed chat)", () => {
  const results: { id: string; replaced: boolean; chars: number }[] = [];

  beforeAll(async () => {
    await login(SHARE!);
    const health = await fetch(`${origin}/api/health`, { headers: { Cookie: cookie } });
    // 503 here means the deployment has no ANTHROPIC_API_KEY (Vercel → Preview) or the chat is switched off.
    expect(health.status, `GET /api/health → ${health.status}: ${await health.text()}`).toBe(200);
  }, 60_000);

  for (const c of CASES) {
    it(`${c.id} ${c.name}`, { timeout: 120_000 }, async () => {
      await pause();
      const turn = prepareTurn(asMessages(c.user));
      const r = await ask(asMessages(c.user));
      expect(r.error, `chat error for ${c.id}`).toBeNull();
      expect(r.status).toBe(200);
      results.push({ id: c.id, replaced: r.replaced, chars: r.reply.length });

      if (c.abusive === true) {
        expect(r.reply).toBe(copy.chat.live.moderation);
        return;
      }
      expect(r.reply.length).toBeGreaterThan(0);
      if (c.redacted) {
        expect(r.userText).toContain(MASK);
        expect(r.notice).toBe(copy.chat.live.redactedNotice);
      }
      expect(r.reply).not.toMatch(LEAK);
      expect(guardReply(r.reply, new Set(), turn.userStated)).toEqual({ ok: true });
      for (const re of c.liveNot ?? []) expect(r.reply).not.toMatch(re);
      if (c.liveHas && !r.replaced) expect(r.reply).toMatch(c.liveHas);
    });
  }

  it("summary", () => {
    const replaced = results.filter((r) => r.replaced).map((r) => r.id);
    console.log(`[red team] ${results.length} conversations; the guard replaced ${replaced.length}: ${replaced.join(", ") || "none"}`);
  });
});
