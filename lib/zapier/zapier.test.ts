import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { importBatch, summarize } from "@/lib/contacts/service";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryScriptStore, setScriptStoreForTests } from "@/lib/scripts/store";
import { addHook, checkHookUrl, dialerOk, emit, hookStore, logDialerCall, newMemoryHookStore, resultFrom, sendCallList, setHookStoreForTests } from "./service";

const NOW = new Date("2026-11-17T18:00:00Z"); // Tuesday, 10 AM Pacific, 1 PM Eastern
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat Doe", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = (over: Record<string, unknown> = {}) => ({ firstName: "Ann", lastName: "Lee", email: null, phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: { closedOn: "2020-11-19", amount: 400000, noteRate: 7.25 }, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], ...over });
const HOOK = "https://hooks.zapier.com/hooks/catch/123/abc/";

describe("Zapier connections and power dialers (D65)", () => {
  const saved = { ...process.env };
  let contacts: MemoryContactStore;
  beforeEach(() => {
    process.env.CC_LINK_SECRET = "test-secret";
    contacts = new MemoryContactStore();
    setContactStoreForTests(contacts);
    setTouchStoreForTests(new MemoryTouchStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    setAccountStoreForTests(new MemoryAccountStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setScriptStoreForTests(new MemoryScriptStore());
    setHookStoreForTests(newMemoryHookStore());
  });
  afterEach(() => {
    process.env = { ...saved };
    for (const f of [setContactStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setAutomationStoreForTests, setAccountStoreForTests, setPipelineStoreForTests, setScriptStoreForTests, setHookStoreForTests]) f(null);
  });

  it("takes only https hook addresses on a public host", () => {
    expect(checkHookUrl(HOOK)).toMatchObject({ ok: true, host: "hooks.zapier.com" });
    for (const bad of ["http://hooks.zapier.com/x", "https://localhost/x", "https://10.0.0.1/x", "https://a:b@hooks.zapier.com/x", "https://hooks.zapier.com:8443/x", "https://intranet/x", "not a url"]) expect(checkHookUrl(bad).ok).toBe(false);
  });

  it("seals the hook address and posts each event only to its own hooks", async () => {
    expect(await addHook(me, "made_up", HOOK, "")).toMatchObject({ ok: false });
    expect(await addHook(me, "lead_created", HOOK, "Sheets", NOW)).toMatchObject({ ok: true });
    await addHook(me, "call_list", "https://hooks.zapier.com/hooks/catch/123/dialer/", "PhoneBurner", NOW);
    expect(JSON.stringify(await hookStore().list("lo1"))).not.toContain("/catch/123/abc");
    const post = vi.fn(async () => true);
    expect(await emit("lo1", "lead_created", { name: "Ann" }, NOW, post)).toEqual({ sent: 1, failed: 0 });
    expect(post).toHaveBeenCalledWith(HOOK, expect.objectContaining({ event: "lead_created", name: "Ann", source: "MLO Command Center" }));
    expect(await emit("lo2", "lead_created", {}, NOW, post)).toEqual({ sent: 0, failed: 0 });
    expect(await emit("lo1", "client_replied", {}, NOW, post)).toEqual({ sent: 0, failed: 0 });
    expect(await emit("lo1", "lead_created", {}, NOW, async () => false)).toEqual({ sent: 0, failed: 1 });
    expect((await hookStore().list("lo1")).find((h) => h.event === "lead_created")?.lastOk).toBe(false);
  });

  it("sends the dialer only people the rules allow", async () => {
    expect(await sendCallList(me, NOW, async () => true)).toMatchObject({ ok: false, error: expect.stringMatching(/Connections/) });
    await importBatch(me, "contacts", [rec(), rec({ firstName: "Bo", lastName: "Ng", phone: "+12065552222", relationship: "lead", loan: { closedOn: "2021-11-18", amount: 1, noteRate: 3 } })], "a.csv", "personal");
    for (const c of (await contacts.list({})).contacts) await contacts.put({ ...c, dnc: { onList: false, checkedAt: "2026-11-10T00:00:00Z", source: "test" } });
    await addHook(me, "call_list", HOOK, "Dialer", NOW);
    const post = vi.fn(async (_u: string, _b: unknown) => true);
    expect(await sendCallList(me, NOW, post)).toMatchObject({ ok: true, sent: 1, heldBack: 0 });
    const body = post.mock.calls[0][1] as { people: { firstName: string; contactUrl: string }[] };
    expect(body.people.map((p) => p.firstName)).toEqual(["Ann"]);
    expect(body.people[0].contactUrl).toMatch(/\/mlo\/contacts\//);
    expect(JSON.stringify(body)).not.toMatch(/7\.25|400000/);
    expect(await sendCallList(me, NOW, async () => false)).toMatchObject({ ok: false });
  });

  it("holds back Florida, Oklahoma and Maryland unless the permission to call is written", () => {
    expect(dialerOk("WA", { granted: false })).toBe(true);
    expect(dialerOk(null, { granted: false })).toBe(true);
    for (const st of ["FL", "OK", "MD"]) {
      expect(dialerOk(st, { granted: false })).toBe(false);
      expect(dialerOk(st, { granted: true, evidence: "verbal" })).toBe(false);
      expect(dialerOk(st, { granted: true, evidence: "written" })).toBe(true);
    }
  });

  it("reads a dialer's disposition and logs it on the contact; do-not-call records a stop", async () => {
    expect(resultFrom("No Answer")).toBe("no_answer");
    expect(resultFrom("Left Voicemail")).toBe("voicemail");
    expect(resultFrom("Appointment Set")).toBe("booked");
    expect(resultFrom("Do Not Call")).toBe("asked_to_stop");
    expect(resultFrom("Wrong Number")).toBe("wrong_number");
    expect(resultFrom("Not Interested")).toBe("not_now");
    expect(resultFrom("Connected")).toBe("reached");

    await importBatch(me, "contacts", [rec()], "a.csv", "personal");
    const ann = (await contacts.list({})).contacts[0];
    await contacts.put({ ...ann, dnc: { onList: false, checkedAt: "2026-11-10T00:00:00Z", source: "test" } });
    expect(await logDialerCall(me, { phone: "12", result: "x", notes: "" }, NOW)).toMatchObject({ ok: false });
    expect(await logDialerCall(me, { phone: "(425) 821-0000", result: "x", notes: "" }, NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/No contact/) });
    expect(await logDialerCall({ ...me, id: "lo2" }, { phone: "206-555-1234", result: "Connected", notes: "" }, NOW)).toMatchObject({ ok: false });
    expect(await logDialerCall(me, { phone: "206-555-1234", result: "Do Not Call", notes: "asked to stop" }, NOW)).toEqual({ ok: true, result: "asked_to_stop" });
    expect(summarize(await contacts.consents(ann.id)).call.marketing.granted).toBe(false);
  });
});
