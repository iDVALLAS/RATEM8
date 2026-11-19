import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "./store";
import { canManage, CODE_TRIES, ensureOwner, inviteUser, LINK_TTL_MS, requestSignIn, updateUser, userForSession, verifySignIn, verifySignInCode } from "./auth";
import { resetMemoryCounters } from "@/lib/m8/kv";

const T0 = Date.parse("2026-11-18T18:00:00Z");
let store: MemoryAccountStore;
let sent: { to: string; text: string }[];

function linkToken(): string {
  const m = /t=([^\s]+)/.exec(sent[sent.length - 1].text);
  return decodeURIComponent(m![1]);
}

describe("Command Center accounts (D1)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    store = new MemoryAccountStore();
    setAccountStoreForTests(store);
    resetMemoryCounters();
    sent = [];
    process.env.MLO_OWNER_EMAIL = "Owner@Example.com";
    process.env.RESEND_API_KEY = "re_test";
    process.env.MLO_NOTIFICATION_EMAIL = "alerts@example.com";
    process.env.LOANM8_FROM_EMAIL = "m8@example.com";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      sent.push({ to: b.to[0], text: b.text });
      return new Response("{}", { status: 200 });
    }));
  });
  afterEach(() => {
    process.env = { ...saved };
    setAccountStoreForTests(null);
    vi.unstubAllGlobals();
  });

  it("creates the owner from MLO_OWNER_EMAIL once", async () => {
    await ensureOwner(T0);
    await ensureOwner(T0);
    const users = await store.listUsers();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ email: "owner@example.com", role: "owner", status: "active" });
  });

  it("emails a one-time link that opens a session, and expires", async () => {
    expect(await requestSignIn("owner@example.com", "https://loanm8.com", "ip1", T0)).toMatchObject({ ok: true });
    expect(sent[0].to).toBe("owner@example.com");
    const t = linkToken();
    const res = await verifySignIn(t, T0 + 60_000);
    expect(res?.user.role).toBe("owner");
    expect(await userForSession((res as { session: string }).session, T0 + 120_000)).toMatchObject({ email: "owner@example.com" });
    expect(await verifySignIn(t, T0 + 90_000)).toBeNull(); // single use
    await requestSignIn("owner@example.com", "https://loanm8.com", "ip1", T0);
    expect(await verifySignIn(linkToken(), T0 + LINK_TTL_MS + 1)).toBeNull(); // expired
  });

  it("never says whether an email has an account, and sends nothing for strangers", async () => {
    expect(await requestSignIn("stranger@example.com", "https://loanm8.com", "ip2", T0)).toMatchObject({ ok: true });
    expect(sent).toHaveLength(0);
  });

  it("D47: the 6-digit code signs in the browser that asked, once, even when the email is read elsewhere", async () => {
    const r = (await requestSignIn("owner@example.com", "https://loanm8.com", "ip5", T0)) as { ok: true; pending: string };
    expect(r.pending.length).toBeGreaterThan(20);
    const code = /code is (\d{6})/.exec(sent[0].text)![1];
    expect(sent[0].text).toContain("https://loanm8.com/api/cc/verify?t=");
    // The code alone, in another browser (no pending value, or someone else's), does nothing.
    expect(await verifySignInCode(undefined, code, T0 + 1000)).toMatchObject({ error: expect.any(String) });
    expect(await verifySignInCode("someone-elses-pending-value-xxxxxxxxxx", code, T0 + 1000)).toMatchObject({ error: expect.any(String) });
    const ok = await verifySignInCode(r.pending, code.slice(0, 3) + " " + code.slice(3), T0 + 2000);
    expect("session" in ok && ok.user.email).toBe("owner@example.com");
    expect(await verifySignInCode(r.pending, code, T0 + 3000)).toMatchObject({ error: expect.any(String) }); // single use
    // The link from the same email still works on the device that reads it.
    expect(await verifySignIn(linkToken(), T0 + 4000)).not.toBeNull();
  });

  it("D47: codes expire, stop after a few wrong tries, and strangers get a pending value that never works", async () => {
    const a = (await requestSignIn("owner@example.com", "https://x", "ip6", T0)) as { ok: true; pending: string };
    const code = /code is (\d{6})/.exec(sent[0].text)![1];
    expect(await verifySignInCode(a.pending, code, T0 + LINK_TTL_MS + 1)).toMatchObject({ error: expect.any(String) });
    const b = (await requestSignIn("owner@example.com", "https://x", "ip6", T0)) as { ok: true; pending: string };
    const good = /code is (\d{6})/.exec(sent[1].text)![1];
    const wrong = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < CODE_TRIES; i++) expect(await verifySignInCode(b.pending, wrong, T0 + 1000)).toMatchObject({ error: expect.any(String) });
    expect(await verifySignInCode(b.pending, good, T0 + 2000)).toMatchObject({ spent: true });
    const s = (await requestSignIn("stranger@example.com", "https://x", "ip7", T0)) as { ok: true; pending: string };
    expect(s.pending).toBeTruthy();
    expect(await verifySignInCode(s.pending, "123456", T0 + 1000)).toMatchObject({ error: expect.any(String) });
    expect(await verifySignInCode(b.pending, "12345", T0 + 1000)).toMatchObject({ error: "Enter the 6-digit code from the email." });
  });

  it("rate limits sign-in requests", async () => {
    for (let i = 0; i < 5; i++) await requestSignIn("owner@example.com", "https://x", "ip3", T0);
    expect(await requestSignIn("owner@example.com", "https://x", "ip3", T0)).toMatchObject({ ok: false });
  });

  it("stores only hashes of tokens", async () => {
    await requestSignIn("owner@example.com", "https://x", "ip4", T0);
    const t = linkToken();
    expect(JSON.stringify(store)).not.toContain(t);
  });

  it("lets owners add anyone and team leads add only loan officers and assistants", async () => {
    await ensureOwner(T0);
    const owner = (await store.userByEmail("owner@example.com"))!;
    const r = await inviteUser(owner, { email: "lead@example.com", name: "Lee Lead", role: "team_lead", mloId: null }, "https://x", T0);
    expect(r).toEqual({ ok: true, emailed: true });
    const lead = (await store.userByEmail("lead@example.com"))!;
    expect(canManage(lead, "lo")).toBe(true);
    expect(canManage(lead, "owner")).toBe(false);
    expect((await inviteUser(lead, { email: "o2@example.com", name: "O", role: "owner", mloId: null }, "https://x", T0)).ok).toBe(false);
    expect((await inviteUser(lead, { email: "lo@example.com", name: "Lo", role: "lo", mloId: "mlo-002" }, "https://x", T0)).ok).toBe(true);
    expect((await store.userByEmail("lo@example.com"))?.mloId).toBe("mlo-002");
    expect((await inviteUser(lead, { email: "lo@example.com", name: "Lo", role: "lo", mloId: null }, "https://x", T0)).ok).toBe(false);
  });

  it("disabling someone signs them out, and there is always an active owner", async () => {
    await ensureOwner(T0);
    const owner = (await store.userByEmail("owner@example.com"))!;
    await inviteUser(owner, { email: "lo@example.com", name: "Lo", role: "lo", mloId: null }, "https://x", T0);
    const s = (await verifySignIn(linkToken(), T0 + 1000)) as { session: string } | null;
    expect(await userForSession(s!.session, T0 + 2000)).not.toBeNull();
    const lo = (await store.userByEmail("lo@example.com")) as User;
    expect(await updateUser(owner, lo.id, { status: "disabled" }, T0 + 3000)).toEqual({ ok: true });
    expect(await userForSession(s!.session, T0 + 4000)).toBeNull();
    expect(await updateUser(owner, owner.id, { role: "lo" }, T0)).toMatchObject({ ok: false });
    expect((await store.recentAudit(10)).map((a) => a.action)).toContain("user.update");
  });
});
