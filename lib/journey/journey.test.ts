import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addBusinessDays, clocks, federalHolidays } from "./timing";
import { STEPS } from "./steps";
import { draftStepMessage, markStep, myNextSteps, setDate, setLock, setProcessor, view, loanFor } from "./engine";
import { todayFor } from "@/lib/today/facts";
import { docRequestBody, readFindings, requestDocs, type AusCall } from "./docs";
import { MemoryJourneyStore, setJourneyStoreForTests } from "./store";
import { checkDraft } from "@/lib/concierge/guard";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { ingest, readPayload } from "@/lib/pipeline/intake";

const NOW = new Date("2026-11-19T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat Doe", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };

describe("Federal clocks (D17)", () => {
  it("knows the federal holidays, actual and observed", () => {
    const h = federalHolidays(2026);
    expect(h.has("2026-11-26")).toBe(true); // Thanksgiving
    expect(h.has("2026-07-04")).toBe(true);
    expect(h.has("2026-07-03")).toBe(true); // observed (July 4 is a Saturday)
    expect(h.has("2026-01-19")).toBe(true); // MLK Day
  });
  it("counts business days both ways", () => {
    // General (LE): Mon–Fri. Application Friday Nov 20 → due Wednesday Nov 25.
    expect(addBusinessDays("2026-11-20", 3, "general")).toBe("2026-11-25");
    // Specific (CD wait): Mon–Sat, no federal holidays. CD Tuesday Nov 24 → Wed 25, Fri 27 (Thanksgiving skipped), Sat 28.
    expect(addBusinessDays("2026-11-24", 3, "specific")).toBe("2026-11-28");
  });
  it("warns about the Loan Estimate, the fee hold, the CD wait and an old VOE", () => {
    const c = clocks({ today: "2026-11-26", applicationOn: "2026-11-20", leSentOn: null, intentToProceedOn: null, cdSentOn: "2026-11-24", signingOn: "2026-11-27", voeOn: "2026-11-01" });
    expect(c.map((x) => [x.key, x.level])).toEqual([["le_due", "stop"], ["cd_wait", "stop"], ["fee_hold", "warn"], ["voe", "warn"]]);
    expect(c[1].text).toMatch(/earliest signing is 2026-11-28/);
  });
});

describe("Loan Journey (D17, D18)", () => {
  let concierge: MemoryConciergeStore;
  const saved = { ...process.env };
  beforeEach(async () => {
    concierge = new MemoryConciergeStore();
    setConciergeStoreForTests(concierge);
    setContactStoreForTests(new MemoryContactStore());
    setTouchStoreForTests(new MemoryTouchStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setJourneyStoreForTests(new MemoryJourneyStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    const a = new MemoryAccountStore();
    setAccountStoreForTests(a);
    await a.putUser(me);
  });
  afterEach(() => {
    process.env = { ...saved };
    for (const f of [setConciergeStoreForTests, setContactStoreForTests, setTouchStoreForTests, setPipelineStoreForTests, setJourneyStoreForTests, setAutomationStoreForTests, setAccountStoreForTests]) f(null);
  });
  const sync = (status: string, extra: Record<string, unknown> = {}) => ingest("lo1", readPayload({ loanNumber: "L-1", borrowerName: "Ann Lee", borrowerPhone: "(206) 555-1234", loanStatus: status, applicationDate: "2026-11-16", ...extra })!, "arive", NOW);

  it("every borrower message passes the Concierge guard", () => {
    for (const s of STEPS.filter((x) => x.message)) {
      for (const portal of [null, "https://loanm8.com/apply"]) expect(checkDraft(s.message!({ first: "Ann", me: "Pat", portal }), { names: ["Ann", "Pat"] }), s.key).toMatchObject({ ok: true });
    }
  });

  it("checks steps off from the loan system, keeps the appraisal fee behind intent to proceed, and only the loan officer locks", async () => {
    const loan = await sync("Submitted to Underwriting");
    let v = await view((await loanFor(me, loan.id))!, NOW);
    const state = (k: string) => v.steps.find((s) => s.key === k)!.state;
    expect(state("15")).toMatchObject({ status: "done", auto: true });
    expect(state("14A")).toMatchObject({ status: "done", auto: true });
    expect(state("17")).toBeNull();
    expect(v.current?.key).toBe("3");
    expect(await draftStepMessage(me, loan.id, "14A", NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/intend to proceed/) });
    await setDate(me, loan.id, "intentToProceedOn", "2026-11-18", NOW);
    expect(await draftStepMessage(me, loan.id, "14A", NOW)).toMatchObject({ ok: true });
    expect(await setLock({ ...me, role: "assistant", id: "a1", assistsUserId: "lo1" }, loan.id, "lock", NOW)).toMatchObject({ ok: false });
    expect(await setLock(me, loan.id, "lock", NOW)).toEqual({ ok: true });
    await markStep(me, loan.id, "3", "done", "", NOW);
    v = await view((await loanFor(me, loan.id))!, NOW);
    expect(v.journey.lock?.decision).toBe("lock");
    expect(v.steps.find((s) => s.key === "13")!.state).toMatchObject({ status: "done", note: "Locked" });
    expect(await loanFor({ ...me, id: "lo2" }, loan.id)).toBeNull();
  });

  it("reads the AUS findings once into a checklist, and the borrower's text gives a count and the portal, not the names", async () => {
    const loan = await sync("Application Taken");
    const call: AusCall = async (input) => {
      expect(input.pdfBase64).toBeTruthy();
      return { stop: "end_turn", json: JSON.stringify({ system: "DU", documents: [{ name: "Pay stubs covering the most recent 30 days", why: "Message 21", phase: "initial" }, { name: "Divorce decree", why: "Message 34", phase: "initial" }, { name: "Call 555-010-0100 for docs", why: "x", phase: "initial" }, { name: "Final verbal VOE", why: "Message 40", phase: "final" }] }) };
    };
    const pdf = new TextEncoder().encode("%PDF-1.4 findings");
    expect(await readFindings(me, loan.id, { pdf: new TextEncoder().encode("not a pdf") }, { now: NOW, call })).toMatchObject({ ok: false });
    expect(await readFindings(me, loan.id, { pdf }, { now: NOW, call })).toEqual({ ok: true, added: 3, system: "DU" });
    // Without a secure portal link on file, nothing is drafted.
    expect(await requestDocs(me, loan.id, "initial", NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/secure application link/) });
    expect(await concierge.proposals("lo1", "pending")).toHaveLength(0);
    const body = docRequestBody("Ann", 2, "initial", "https://loanm8.com/apply", "Pat");
    expect(body).toBe("Hi Ann, I've posted the 2 items your file needs in your secure portal: https://loanm8.com/apply Please upload them there (not by text or email). Reply here with any questions. -Pat");
    expect(checkDraft(body, { names: ["Ann", "Pat"] })).toMatchObject({ ok: true });
  });

  it("D19: puts the journey's deadlines on Today and hands processor steps to the named processor", async () => {
    const loan = await sync("Application Taken", { applicationDate: "2026-11-13" });
    const today = await todayFor(me, NOW);
    const card = today.cards.find((c) => c.kind === "journey");
    expect(card).toMatchObject({ loanId: loan.id, title: "Ann Lee: Loan Estimate deadline" });
    expect(card!.reason).toMatch(/was due by 2026-11-18/);
    expect(today.cards.some((c) => c.reason.includes("appraisal fee"))).toBe(false);
    const asst: User = { ...me, id: "a1", email: "a1@x.com", name: "Sam", role: "assistant", assistsUserId: "lo1" };
    const outsider: User = { ...me, id: "a2", email: "a2@x.com", name: "Lee", role: "assistant", assistsUserId: "lo9" };
    const accounts = new MemoryAccountStore();
    setAccountStoreForTests(accounts);
    for (const u of [me, asst, outsider]) await accounts.putUser(u);
    expect(await setProcessor(asst, loan.id, asst.id, NOW)).toMatchObject({ ok: false });
    expect(await setProcessor(me, loan.id, outsider.id, NOW)).toMatchObject({ ok: false });
    expect(await setProcessor(me, loan.id, asst.id, NOW)).toEqual({ ok: true });
    const theirs = await myNextSteps(asst, NOW);
    expect(theirs[0]).toMatchObject({ loan: { id: loan.id }, step: { key: "4" } }); // step 3 is the borrower's
    expect((await myNextSteps(me, NOW))[0]?.step.key).toBe("5");
  });
});
