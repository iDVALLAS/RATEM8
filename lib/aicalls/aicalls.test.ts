import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryJourneyStore, setJourneyStoreForTests } from "@/lib/journey/store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { recordConsent } from "@/lib/contacts/service";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { ingest, readPayload } from "@/lib/pipeline/intake";
import { mloById } from "@/lib/config";
import { conciergeStore } from "@/lib/concierge/store";
import type { Dialer } from "@/lib/voicemail/service";
import { aiCallStore, newMemoryAiCallStore, setAiCallStoreForTests } from "./store";
import { aiCallStatus, canAiCall, startAiCall, startTwiml, turnSystem, turnTwiml, type TurnModel } from "./service";

const TUE_10AM_PT = new Date("2026-11-17T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const M = mloById("mlo-001")!;

describe("M8 loan-update calls (D58)", () => {
  const saved = { ...process.env };
  let contacts: MemoryContactStore;
  let touches: MemoryTouchStore;
  beforeEach(async () => {
    process.env.CC_AI_CALLS = "true";
    process.env.TWILIO_ACCOUNT_SID = "AC" + "0".repeat(32);
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_CALLER_ID = "+14258210000";
    setJourneyStoreForTests(new MemoryJourneyStore());
    contacts = new MemoryContactStore();
    setContactStoreForTests(contacts);
    touches = new MemoryTouchStore();
    setTouchStoreForTests(touches);
    setConciergeStoreForTests(new MemoryConciergeStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    setAiCallStoreForTests(newMemoryAiCallStore());
    const a = new MemoryAccountStore();
    setAccountStoreForTests(a);
    await a.putUser(me);
  });
  afterEach(() => {
    process.env = { ...saved };
    for (const f of [setJourneyStoreForTests, setContactStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setPipelineStoreForTests, setAutomationStoreForTests, setAccountStoreForTests, setAiCallStoreForTests]) f(null);
  });

  const client = async (status = "Application Taken") => {
    const loan = await ingest("lo1", readPayload({ loanNumber: "L-1", borrowerName: "Ann Lee", borrowerPhone: "(206) 823-1234", loanStatus: status, loanPurpose: "Purchase", interestRate: "6.5", loanAmount: "400000" })!, "arive", TUE_10AM_PT);
    const c = (await contacts.get(loan.contactId!))!;
    await contacts.put({ ...c, state: "WA" });
    return c.id;
  };
  const calls: Parameters<Dialer>[0][] = [];
  const dial: Dialer = async (x) => (calls.push(x), { ok: true, sid: `CA${calls.length}` });
  const ready = async () => true;
  const placed = async () => {
    const id = await client();
    await recordConsent(me, id, { channel: "ai_call", purpose: "service", granted: true, evidence: "web_form", proof: "application e-consent" }, TUE_10AM_PT);
    const r = await startAiCall(me, id, TUE_10AM_PT, dial, ready);
    if (!r.ok) throw new Error(r.error);
    return { contactId: id, callId: r.id };
  };
  const mails: { to: string; subject: string }[] = [];
  const mail = async (m: { to: string; subject: string; text: string }) => (mails.push(m), true);

  it("is off until the owner turns it on, and needs written permission and a loan in progress", async () => {
    const id = await client();
    delete process.env.CC_AI_CALLS;
    expect(await canAiCall(me, id, TUE_10AM_PT)).toMatchObject({ ok: false, error: expect.stringMatching(/off/) });
    process.env.CC_AI_CALLS = "true";
    expect(await canAiCall(me, id, TUE_10AM_PT)).toMatchObject({ ok: false, error: expect.stringMatching(/written permission/) });
    await recordConsent(me, id, { channel: "ai_call", purpose: "service", granted: true, evidence: "recorded_call", proof: "said yes on a call" }, TUE_10AM_PT);
    expect(await canAiCall(me, id, TUE_10AM_PT)).toMatchObject({ ok: false, error: expect.stringMatching(/written permission/) });
    await recordConsent(me, id, { channel: "ai_call", purpose: "service", granted: true, evidence: "written", proof: "signed form" }, TUE_10AM_PT);
    expect(await canAiCall(me, id, TUE_10AM_PT)).toEqual({ ok: true });
    expect(await canAiCall(me, id, new Date("2026-11-17T07:00:00Z"))).toMatchObject({ ok: false }); // 11 PM Pacific
  });

  it("says it's an AI and asks for the client before saying anything about the loan", async () => {
    const { callId } = await placed();
    expect(calls[0].url).toMatch(/\/api\/twilio\/aicall\?s=ac_/);
    const first = await startTwiml(callId, "human", TUE_10AM_PT);
    expect(first).toContain(`this is M8, an AI assistant calling for ${M.name}`);
    expect(first).toContain("Am I speaking with Ann Lee?");
    expect(first).not.toMatch(/being reviewed|Upload/);
    // Someone else answers: no loan details.
    const wrong = await turnTwiml(callId, { SpeechResult: "No, she's not here." }, TUE_10AM_PT, mail, null);
    expect(wrong).toMatch(/Please ask Ann to call/);
    expect(wrong).not.toMatch(/reviewed/);
    expect((await aiCallStore().get(callId))?.status).toBe("wrong-person");
  });

  it("a voicemail gets no loan details", async () => {
    const { callId } = await placed();
    const vm = await startTwiml(callId, "machine_end_beep", TUE_10AM_PT);
    expect(vm).toMatch(/quick update on their loan/);
    expect(vm).not.toMatch(/reviewed|documents/);
    expect(vm).toContain("<Hangup/>");
  });

  it("gives the status from their own page, answers inside the rules, and passes the rest to the loan officer", async () => {
    const { contactId, callId } = await placed();
    await startTwiml(callId, "human", TUE_10AM_PT);
    const yes = await turnTwiml(callId, { SpeechResult: "Yes, this is Ann." }, TUE_10AM_PT, mail, null);
    expect(yes).toContain("Your application and documents are being reviewed.");
    expect(yes).toContain("written note of this call");
    expect(yes).toContain("<Gather");
    // The model's reply goes through the guard: a rate is never spoken.
    const seen: string[] = [];
    const leaky: TurnModel = async (sys, convo) => (seen.push(sys, convo), { say: "Your rate is 6.5% and you're approved.", action: "continue", note: "" });
    const r = await turnTwiml(callId, { SpeechResult: "What's my rate?" }, TUE_10AM_PT, mail, leaky);
    expect(r).not.toMatch(/6\.5|approved/);
    expect(r).toMatch(/call you back/);
    expect(seen[0]).toMatch(/Never state, estimate or hint at interest rates/);
    expect(seen[1]).toMatch(/<data-d[0-9a-f]+ kind="client_said">What's my rate\?<\/data-d/);
    const tasks = await conciergeStore().tasks("lo1", false);
    expect(tasks[0]).toMatchObject({ contactId, title: "Call Ann Lee back" });
    expect(mails.at(-1)?.subject).toBe("Ann Lee would like a call back");
    expect(await aiCallStore().get(callId)).toMatchObject({ status: "done", outcome: "callback" });
  });

  it("keeps talking when the answer is in the status, and works with no AI at all", async () => {
    const { callId } = await placed();
    await startTwiml(callId, "human", TUE_10AM_PT);
    await turnTwiml(callId, { SpeechResult: "Yep." }, TUE_10AM_PT, mail, null);
    const good: TurnModel = async () => ({ say: "Right now your application and documents are being reviewed. Anything else?", action: "continue", note: "" });
    expect(await turnTwiml(callId, { SpeechResult: "What's happening now?" }, TUE_10AM_PT, mail, good)).toMatch(/<Gather[^>]*>.*being reviewed\. Anything else\?/);
    // No model: the plain path offers the call-back.
    expect(await turnTwiml(callId, { SpeechResult: "Can I lower my payment?" }, TUE_10AM_PT, mail, null)).toMatch(/call you back/);
    expect(turnSystem("dabc", { mloName: "A B", mloFirst: "A", company: "Co" })).toContain("<data-dabc>");
  });

  it("stop calling ends it and stops recorded calls and texts to that number", async () => {
    const { contactId, callId } = await placed();
    await startTwiml(callId, "human", TUE_10AM_PT);
    const r = await turnTwiml(callId, { SpeechResult: "Please stop calling me." }, TUE_10AM_PT, mail, null);
    expect(r).toMatch(/won't get more/);
    const c = (await contacts.get(contactId))!;
    expect(await touches.optedOut(c.phone!)).toBe(true);
    expect(await canAiCall(me, contactId, TUE_10AM_PT)).toMatchObject({ ok: false });
    await aiCallStatus(callId, { CallSid: (await aiCallStore().get(callId))!.callSid!, CallStatus: "completed" }, TUE_10AM_PT);
    expect((await touches.forContact(contactId))[0].status).toBe("talked (stop)");
  });
});
