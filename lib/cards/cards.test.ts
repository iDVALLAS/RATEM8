import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch } from "@/lib/contacts/service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { SPONSOR } from "@/config/licensing";
import { mloById } from "@/lib/config";
import { CARD_STARTERS } from "./library";
import { cardStore, newMemoryCardStore, setCardStoreForTests } from "./store";
import { cardSignoff, checkCardMessage, connectThanks, finalMessage, prepareCards, recipientFor, returnAddress, sendCards, setNoMail, thanksStatus } from "./service";
import { setCardsFetchForTests, thanksAuthUrl } from "./thanks";

const NOW = new Date("2026-11-20T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const other: User = { ...me, id: "lo2", email: "lo2@x.com" };
const base = { phone2: null, tags: [], notes: null, loan: null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], relationship: "past_client" };
const rec = (first: string, extra: Record<string, unknown> = {}) => ({ ...base, firstName: first, lastName: "Lee", email: `${first.toLowerCase()}@example.com`, phone: null, street: "12 Elm St", city: "Bellevue", state: "WA", zip: "98004", ...extra });

type Call = { url: string; body: string };
function fake(over: Partial<Record<"token" | "estimate" | "send", () => Response>> = {}) {
  const calls: Call[] = [];
  setCardsFetchForTests((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: String(init?.body ?? "") });
    const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s });
    if (url.endsWith("/oauth/token")) return over.token?.() ?? j(200, { access_token: "ta1", refresh_token: "tr1", expires_in: 3600 });
    if (url.includes("/estimate/")) return over.estimate?.() ?? j(200, { message: "OK", data: { total_cost_in_cents: 236, current_balance_in_cents: 5000, covered_by_balance: true, test_mode: false, total_recipients: 2 } });
    if (url.includes("/send/")) return over.send?.() ?? j(200, { id: 777 });
    return j(404, {});
  }) as typeof fetch);
  return calls;
}

describe("Cards by mail through Thanks.io (D53)", () => {
  const saved = { ...process.env };
  let contacts: MemoryContactStore;
  beforeEach(async () => {
    process.env.THANKSIO_CLIENT_ID = "cid";
    process.env.THANKSIO_CLIENT_SECRET = "csecret";
    process.env.CC_LINK_SECRET = "test-secret";
    contacts = new MemoryContactStore();
    setContactStoreForTests(contacts);
    setAccountStoreForTests(new MemoryAccountStore());
    setCardStoreForTests(newMemoryCardStore());
    await importBatch(me, "contacts", [rec("Ann"), rec("Bo"), rec("Cy", { street: null }), rec("Di", { zip: "9800" })], "a.csv", "personal", NOW);
  });
  afterEach(() => {
    process.env = { ...saved };
    setCardsFetchForTests(null);
    for (const f of [setContactStoreForTests, setAccountStoreForTests, setCardStoreForTests]) f(null);
  });
  const byName = async (n: string) => (await contacts.list({})).contacts.find((c) => c.firstName === n)!;
  const connect = async () => {
    fake();
    expect(await connectThanks(me, "code", "https://cc.example.com", NOW)).toEqual({ ok: true });
  };
  const design = { kind: "notecard" as const, size: null, designId: 6, designImage: "https://cdn.example.com/front.png", styleId: 4, message: CARD_STARTERS[0].message };

  it("connects each loan officer's own account through Thanks.io's sign-in", async () => {
    const u = new URL(thanksAuthUrl("https://cc.example.com", "st1")!);
    expect(u.origin + u.pathname).toBe("https://dashboard.thanks.io/oauth/authorize");
    expect(u.searchParams.get("redirect_uri")).toBe("https://cc.example.com/api/cc/cards/callback");
    expect(u.searchParams.get("state")).toBe("st1");
    await connect();
    expect(await thanksStatus(me)).toMatchObject({ connected: true });
    expect(JSON.stringify(await cardStore().account("lo1"))).not.toContain("tr1");
    delete process.env.THANKSIO_CLIENT_SECRET;
    expect(thanksAuthUrl("https://cc.example.com", "s")).toBeNull();
  });

  it("checks the words like every other message", () => {
    for (const s of CARD_STARTERS) {
      expect(checkCardMessage(s.message), s.id).toMatchObject({ ok: true });
    }
    expect(checkCardMessage("Hi {first}, rates are at 5.9% this week!")).toMatchObject({ ok: false });
    expect(checkCardMessage("Hi {first}, you're pre-approved, " + "guaran" + "teed!")).toMatchObject({ ok: false });
    expect(checkCardMessage("Hi {nickname}, happy holidays to you all")).toMatchObject({ ok: false, error: expect.stringMatching(/\{nickname\}/) });
    expect(checkCardMessage("Hi %FIRST_NAME%, happy holidays")).toMatchObject({ ok: false });
    expect(checkCardMessage("x".repeat(400))).toMatchObject({ ok: false, error: expect.stringMatching(/under/) });
  });

  it("ends every card with the loan officer, the company, their NMLS numbers and Equal Housing", () => {
    const mlo = mloById("mlo-001")!;
    const f = finalMessage(me, "Hi {first},\n\nHappy holidays!\n\n{myFirst}");
    expect(f).toContain("Hi %FIRST_NAME%,");
    expect(f).toContain(mlo.name.split(/\s+/)[0]);
    expect(f).not.toMatch(/\{myFirst\}/);
    expect(cardSignoff(me)).toContain(`NMLS #${mlo.nmls}`);
    expect(cardSignoff(me)).toContain(`NMLS #${SPONSOR.nmls}`);
    expect(cardSignoff(me)).toContain("Equal Housing Opportunity");
  });

  it("uses the company's address as the return address", () => {
    expect(returnAddress("135 Main St S, Ste 230, Kirkland, WA 98033")).toEqual({ return_address: "135 Main St S", return_address2: "Ste 230", return_city: "Kirkland", return_state: "WA", return_postal_code: "98033" });
    expect(returnAddress("10 First Ave, Portland, OR 97201-1234")).toMatchObject({ return_city: "Portland", return_postal_code: "97201-1234" });
    expect(returnAddress("somewhere")).toBeNull();
    expect(returnAddress(SPONSOR.address)).not.toBeNull();
  });

  it("needs a full mailing address", async () => {
    expect(recipientFor(await byName("Ann"))).toMatchObject({ name: "Ann Lee", address: "12 Elm St", province: "WA", postal_code: "98004", country: "US" });
    expect(recipientFor(await byName("Cy"))).toBeNull();
    expect(recipientFor(await byName("Di"))).toBeNull();
  });

  it("prices first, leaving people out with the reason, and only from your own book", async () => {
    await connect();
    await importBatch(other, "contacts", [rec("Ed")], "b.csv", "personal", NOW);
    await setNoMail(me, (await byName("Bo")).id, true, NOW);
    const calls = fake();
    const ids = await Promise.all(["Ann", "Bo", "Cy", "Ed"].map(async (n) => (await byName(n)).id));
    const r = await prepareCards(me, { ...design, contactIds: ids }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.contactIds).toEqual([ids[0]]);
    expect(r.order.skipped.map((s) => s.reason)).toEqual(["asked for no cards by mail", "no full mailing address"]);
    expect(r.order.status).toBe("draft");
    expect(r.order.estimateCents).toBe(236);
    const est = calls.find((c) => c.url.includes("/estimate/notecard"))!;
    const body = JSON.parse(est.body);
    expect(body.recipients).toHaveLength(1);
    expect(body.email_lookup).toBe(false);
    expect(body.image_template_id).toBe(6);
    expect(body.handwriting_style_id).toBe(4);
    expect(body.message).toContain("Equal Housing Opportunity");
    expect(body.return_state).toBeTruthy();
    expect(calls.some((c) => c.url.includes("/send/"))).toBe(false);
  });

  it("sends once, re-checks people at send time, and won't send the same person twice in 30 days", async () => {
    await connect();
    const ann = await byName("Ann");
    const bo = await byName("Bo");
    const r = await prepareCards(me, { ...design, contactIds: [ann.id, bo.id] }, NOW);
    if (!r.ok) throw new Error(r.error);
    await setNoMail(me, bo.id, true, NOW);
    const calls = fake();
    const s = await sendCards(me, r.order.id, NOW);
    expect(s).toEqual({ ok: true, count: 1, testMode: false });
    expect(JSON.parse(calls.find((c) => c.url.includes("/send/notecard"))!.body).recipients).toHaveLength(1);
    const o = (await cardStore().order(r.order.id))!;
    expect(o).toMatchObject({ status: "sent", orderId: 777, contactIds: [ann.id] });
    expect(await sendCards(me, r.order.id, NOW)).toMatchObject({ ok: false });
    expect(await sendCards(other, r.order.id, NOW)).toMatchObject({ ok: false });
    const again = await prepareCards(me, { ...design, contactIds: [ann.id] }, new Date(NOW.getTime() + 86_400_000));
    expect(again).toMatchObject({ ok: false, skipped: [{ reason: "got a card in the last 30 days" }] });
  });

  it("refuses a stale price check", async () => {
    await connect();
    const r = await prepareCards(me, { ...design, contactIds: [(await byName("Ann")).id] }, NOW);
    if (!r.ok) throw new Error(r.error);
    expect(await sendCards(me, r.order.id, new Date(NOW.getTime() + 31 * 60_000))).toMatchObject({ ok: false, error: expect.stringMatching(/30 minutes/) });
  });

  it("asks to reconnect when Thanks.io takes the permission back", async () => {
    await connect();
    fake({ token: () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }) });
    const r = await prepareCards(me, { ...design, contactIds: [(await byName("Ann")).id] }, new Date(NOW.getTime() + 2 * 3600_000));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/^Reconnect Thanks\.io/) });
    expect(await thanksStatus(me)).toMatchObject({ connected: false, reconnect: true });
  });

  it("passes Thanks.io's own refusal through plainly", async () => {
    await connect();
    fake({ estimate: () => new Response(JSON.stringify({ message: "The given data was invalid.", errors: { image_template_id: ["The selected image template id is invalid."] } }), { status: 422 }) });
    const r = await prepareCards(me, { ...design, contactIds: [(await byName("Ann")).id] }, NOW);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/image template id is invalid/) });
  });
});
