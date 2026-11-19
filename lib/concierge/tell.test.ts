import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { tell, type TellCall } from "./tell";
import { MemoryConciergeStore, setConciergeStoreForTests } from "./store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch, recordConsent } from "@/lib/contacts/service";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";

const NOW = new Date("2026-11-19T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = (first: string, phone: string, closedOn: string | null, over: Record<string, unknown> = {}) => ({ firstName: first, lastName: "Lee", email: null, phone, phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: closedOn ? { closedOn, amount: 400000, noteRate: 7.1 } : null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], ...over });
const tu = (name: string, input: object, i: number) => ({ type: "tool_use", id: `t${i}`, name, input }) as unknown as Anthropic.Messages.ToolUseBlock;
const text = (t: string) => ({ type: "text", text: t }) as Anthropic.Messages.TextBlock;

describe("Tell your Concierge (D15)", () => {
  let concierge: MemoryConciergeStore;
  let contacts: MemoryContactStore;
  const saved = { ...process.env };
  beforeEach(() => {
    concierge = new MemoryConciergeStore();
    contacts = new MemoryContactStore();
    setConciergeStoreForTests(concierge);
    setContactStoreForTests(contacts);
    setTouchStoreForTests(new MemoryTouchStore());
    setAccountStoreForTests(new MemoryAccountStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CC_ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    process.env = { ...saved };
    for (const f of [setConciergeStoreForTests, setContactStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setPipelineStoreForTests]) f(null);
  });

  it("finds the right people, drafts within the rules, and never for someone who said stop or an invented id", async () => {
    await importBatch(me, "contacts", [rec("Ann", "+12065551111", "2021-04-01"), rec("Bo", "+12065552222", "2021-08-01"), rec("Cy", "+12065553333", "2021-09-01"), rec("Di", "+12065554444", "2019-01-01")], "a.csv", "personal", NOW);
    await importBatch({ ...me, id: "lo2", email: "lo2@x.com" }, "contacts", [rec("Ed", "+12065555555", "2021-05-01")], "b.csv", "personal", NOW);
    const cy = (await contacts.list({ q: "Cy" })).contacts[0];
    await recordConsent(me, cy.id, { channel: "text", purpose: "marketing", granted: false, evidence: "revoked", proof: "STOP" }, NOW);
    const seen: string[] = [];
    let ids: string[] = [];
    const call: TellCall = async ({ messages }) => {
      const last = messages[messages.length - 1];
      seen.push(JSON.stringify(last.content));
      if (messages.length === 1) return { stop_reason: "tool_use", content: [tu("find_clients", { name: "", relationship: "past_client", closedYearFrom: 2021, closedYearTo: 2021, state: "", tag: "", quietDays: 0 }, 1)] };
      if (messages.length === 3) {
        ids = [...String(JSON.stringify(last.content)).matchAll(/id=\\"(c_[^\\"]+)\\"/g)].map((m) => m[1]);
        const [a, b, c] = ids;
        return { stop_reason: "tool_use", content: [tu("draft_text", { clientId: a, purpose: "marketing", body: "Hi Ann, how's the house treating you?", why: "past client from 2021" }, 2), tu("draft_text", { clientId: b, purpose: "marketing", body: "Hi Bo, rates are 5.5% now, want to refi?", why: "rate drop" }, 3), tu("draft_text", { clientId: c, purpose: "marketing", body: "Hi Cy, checking in!", why: "check-in" }, 4), tu("draft_text", { clientId: "c_invented", purpose: "marketing", body: "Hi", why: "x" }, 5), tu("add_reminder", { clientId: b, action: "price_scenario", why: "Call 555-010-0100 first", dueInDays: 2 }, 6)] };
      }
      return { stop_reason: "end_turn", content: [text("I drafted a check-in for Ann. Bo's draft mentioned a rate, so I left it out.")] };
    };
    const r = await tell(me, "Draft a check-in to my 2021 past clients", { now: NOW, call });
    // Only this loan officer's 2021 past clients came back, as data, with no phone numbers or rates.
    expect(ids).toHaveLength(3);
    // "Ed" as a whole word only: random contact ids can contain those two letters.
    expect(seen[1]).not.toMatch(/206555|7\.1|400000|(?<![\w-])Ed(?![\w-])/);
    expect(r).toMatchObject({ drafts: 1, reminders: 0 });
    expect(r.skipped.join(" ")).toMatch(/Bo: draft refused/);
    expect(r.skipped.join(" ")).toMatch(/Cy: said stop/);
    const pending = await concierge.proposals("lo1", "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].body).toBe("Hi Ann, how's the house treating you?");
    expect(r.answer).toMatch(/drafted a check-in for Ann/);
  });

  it("says what it needs without a key", async () => {
    expect((await tell(me, "text everyone", { now: NOW })).answer).toMatch(/Anthropic key/);
    expect((await tell(me, "   ", { now: NOW, call: null })).answer).toMatch(/Tell me what/);
  });
});
