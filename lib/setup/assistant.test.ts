import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { resetMemoryCounters } from "@/lib/m8/kv";
import { ASKS_PER_HOUR, askSetup, keepKnownLinks, maskSecrets, setupFacts, type SetupCall } from "./assistant";

const ORIGIN = "https://ratem-8-git-claude-pensive-noe-7bb29c-teams-projects-1f863c25.vercel.app";
const owner: User = { id: "u_owner", email: "owner@example.com", name: "Pat Owner", role: "owner", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const lo: User = { id: "u_lo", email: "lo@example.com", name: "Lee Officer", role: "lo", mloId: "mlo-002", status: "active", createdAt: "", createdBy: "" };
const saved = { ...process.env };

beforeEach(async () => {
  const s = new MemoryAccountStore();
  setAccountStoreForTests(s);
  resetMemoryCounters();
  for (const u of [owner, lo]) await s.putUser(u);
});
afterEach(() => {
  process.env = { ...saved };
  setAccountStoreForTests(null);
});

describe("Setup assistant (D50)", () => {
  it("removes keys people paste, but keeps web addresses and Twilio IDs that aren't secret", () => {
    const token = "0123456789abcdef0123456789abcdef";
    const m = maskSecrets(`my auth token is ${token} and resend re_AbCdEfGh12345678ijkl and sk-ant-api03-xyz1234567890 at ${ORIGIN}/mlo for account ACffffffffffffffffffffffffffffffff, service MG0123456789abcdef0123456789abcdef`);
    expect(m.secret).toBe(true);
    expect(m.text).not.toContain(token);
    expect(m.text).not.toContain("re_AbCdEfGh12345678ijkl");
    expect(m.text).not.toContain("sk-ant-api03");
    expect(m.text).toContain(`${ORIGIN}/mlo`);
    expect(m.text).toContain("ACffffffffffffffffffffffffffffffff");
    expect(maskSecrets("password: hunter2 and postgres://u:p@host/db").text).not.toMatch(/hunter2|u:p@host/);
    expect(maskSecrets("What should I do next?")).toEqual({ text: "What should I do next?", secret: false });
  });

  it("keeps links to this site and official pages only", () => {
    const t = keepKnownLinks(`Open ${ORIGIN}/mlo/texting, then https://console.twilio.com/us1/develop. Not https://evil.example/login.`, ORIGIN);
    expect(t).toContain(`${ORIGIN}/mlo/texting,`);
    expect(t).toContain("https://console.twilio.com/us1/develop.");
    expect(t).toContain("(link removed).");
  });

  it("gives the owner the platform settings (names only) and the texting wording with exact addresses", async () => {
    process.env.TWILIO_AUTH_TOKEN = "SECRET-VALUE-NEVER-SHOWN";
    const f = await setupFacts(owner, ORIGIN);
    expect(f.owner).toBe(true);
    expect(f.text).toContain(`${ORIGIN}/api/twilio/inbound`);
    expect(f.text).toContain(`${ORIGIN}/api/twilio/status`);
    expect(f.text).toContain("Customer Care");
    expect(f.text).toContain("TWILIO_AUTH_TOKEN");
    expect(f.text).toContain("RESEND_API_KEY");
    expect(f.text).not.toContain("SECRET-VALUE-NEVER-SHOWN");
    expect(f.text).toMatch(/\[to do\] Your email signature is set/);
  });

  it("tells a loan officer the owner handles Vercel and accounts, without listing platform settings", async () => {
    const f = await setupFacts(lo, ORIGIN);
    expect(f.text).toMatch(/not the owner/);
    expect(f.text).not.toContain("Platform settings in Vercel");
  });

  it("sends the conversation with masked keys and live facts, and cleans the reply", async () => {
    let seen: { facts: string; turns: { role: string; text: string }[] } | null = null;
    const call: SetupCall = async (_s, facts, turns) => {
      seen = { facts, turns };
      return { text: `Open ${ORIGIN}/mlo/texting and https://bad.example/x. Step 1: ...`, stop: "end_turn" };
    };
    const r = await askSetup(owner, [{ role: "assistant", text: "Hi" }, { role: "user", text: "here's my token 0123456789abcdef0123456789abcdef, what next?" }], ORIGIN, { call });
    expect(r).toMatchObject({ ok: true, by: "ai", masked: true });
    expect(seen!.turns[0].role).toBe("user");
    expect(seen!.turns[0].text).toContain("[key removed]");
    expect(seen!.facts).toContain("setup checklist");
    expect(r.ok && r.reply).toContain(`${ORIGIN}/mlo/texting`);
    expect(r.ok && r.reply).toContain("(link removed)");
  });

  it("without the AI, writes out the next unfinished steps", async () => {
    const r = await askSetup(lo, [{ role: "user", text: "What should I do next?" }], ORIGIN, { call: null });
    expect(r).toMatchObject({ ok: true, by: "guide" });
    expect(r.ok && r.reply).toMatch(/1\. /);
  });

  it("refuses empty or overlong questions and too many in an hour", async () => {
    const call: SetupCall = async () => ({ text: "ok", stop: "end_turn" });
    expect((await askSetup(lo, [], ORIGIN, { call })).ok).toBe(false);
    expect((await askSetup(lo, [{ role: "user", text: "x".repeat(2001) }], ORIGIN, { call })).ok).toBe(false);
    for (let i = 0; i < ASKS_PER_HOUR; i++) await askSetup(lo, [{ role: "user", text: "next?" }], ORIGIN, { call });
    expect((await askSetup(lo, [{ role: "user", text: "next?" }], ORIGIN, { call })).ok).toBe(false);
  });
});
