import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryJourneyStore, setJourneyStoreForTests } from "@/lib/journey/store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryAccountStore, setAccountStoreForTests, accountStore, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryAutomationStore, setAutomationStoreForTests, automationStore } from "@/lib/automations/store";
import { ingest, readPayload } from "@/lib/pipeline/intake";
import { canChangeSwitches, capByKey, CAPS, effectiveMode, gaps, loanRows, presetModes, purposeKind, type SwitchSettings } from "./autonomy";
import { emptyFile, loaStore, newMemoryLoaStore, setLoaStoreForTests } from "./store";
import { answerFact, approveLoaDraft, autonomyOf, confirmParty, loaQueue, loaTasks, makeDraft, readIntoFile, resolveReview, saveAutonomy, setLoanAutonomy, setLoanPaused, setPurpose, type PartySender } from "./service";
import type { DocCall } from "./readers";

const NOW = new Date("2026-11-20T18:00:00Z");
const lo: User = { id: "lo1", email: "lo1@x.com", name: "Pat Lee", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const helper: User = { id: "as1", email: "as1@x.com", name: "Sam Helper", role: "assistant", mloId: null, assistsUserId: "lo1", status: "active", createdAt: "", createdBy: "" };
const none: SwitchSettings = { modes: { purchase: {}, refi: {} }, pausedUntil: null };

const PSA = (escrowEmail: string) => ({ price: 650000, sellerCredits: null, earnestMoney: 15000, property: { street: "12 Elm St", city: "Kirkland", state: "WA", zip: "98033" }, mutualAcceptance: "2026-11-18", earnestMoneyDue: "2026-11-21", inspectionEnds: null, financingContingencyEnds: null, appraisalContingencyEnds: null, closingDate: "2026-12-18", possession: null, parties: [{ role: "escrow", company: "Lake Escrow", name: "Dana Fox", email: escrowEmail, phone: "425-821-0000" }], notes: [] });
const reads = (escrowEmail: string): DocCall => async () => ({ json: JSON.stringify(PSA(escrowEmail)), stop: "end_turn" });

describe("The LOA switches (D70)", () => {
  beforeEach(async () => {
    setJourneyStoreForTests(new MemoryJourneyStore());
    setContactStoreForTests(new MemoryContactStore());
    setTouchStoreForTests(new MemoryTouchStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    setLoaStoreForTests(newMemoryLoaStore());
    const a = new MemoryAccountStore();
    await a.putUser(lo);
    await a.putUser(helper);
    setAccountStoreForTests(a);
  });
  afterEach(() => {
    for (const f of [setJourneyStoreForTests, setContactStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setPipelineStoreForTests, setAutomationStoreForTests, setAccountStoreForTests, setLoaStoreForTests]) f(null);
    delete process.env.CC_LOA_AUTO;
  });
  const loan = (loanPurpose = "Purchase", n = "L-1") => ingest("lo1", readPayload({ loanNumber: n, borrowerName: "Ann Lee", borrowerPhone: "(206) 823-1234", loanStatus: "Application Taken", loanPurpose, applicationDate: "2026-11-17" })!, "arive", NOW);

  it("tells purchase from refinance by the loan system's words, then a contract on file", () => {
    const k = (purpose: string | null, contract = false) => purposeKind({ purpose }, contract ? { contract: emptyFile("x", "y").contract ?? ({ notes: [] } as never) } : null);
    for (const p of ["Purchase", "purchase money", "PURCH"]) expect(k(p)).toBe("purchase");
    for (const p of ["Refinance", "Cash-Out Refi", "cash out", "Rate and Term", "Rate & Term", "rate/term", "R/T", "RT", "Streamline", "VA IRRRL"]) expect(k(p)).toBe("refi");
    expect(k("Construction")).toBeNull();
    expect(k(null)).toBeNull();
    expect(k("Construction", true)).toBe("purchase");
  });

  it("uses a loan officer's answer over the loan system", () => {
    expect(purposeKind({ purpose: "Refinance" }, { purposeOverride: "purchase", contract: null })).toBe("purchase");
    expect(purposeKind({ purpose: null }, { purposeOverride: "refi", contract: { notes: [] } as never })).toBe("refi");
  });

  it("falls back to the stricter of purchase and refinance when the loan type is unknown", () => {
    const s: SwitchSettings = { modes: { purchase: { escrow_fees: "auto", open_escrow: "auto" }, refi: { escrow_fees: "approve" } }, pausedUntil: null };
    expect(effectiveMode(capByKey("escrow_fees"), "purchase", s, null, NOW)).toBe("auto");
    expect(effectiveMode(capByKey("escrow_fees"), null, s, null, NOW)).toBe("approve");
    // Open escrow can't be Full-auto on a refinance, so unknown is LO-Auth.
    expect(effectiveMode(capByKey("open_escrow"), null, s, null, NOW)).toBe("approve");
    // A purchase-only task is off when the type is unknown.
    expect(effectiveMode(capByKey("read_psa"), null, none, null, NOW)).toBe("off");
  });

  it("clamps to each task's maximum on read, so a saved Full-auto on HOA documents asks", () => {
    const s: SwitchSettings = { modes: { purchase: { hoa: "auto", payoff_auth: "auto" }, refi: { open_escrow: "auto" } }, pausedUntil: null };
    expect(effectiveMode(capByKey("hoa"), "purchase", s, null, NOW)).toBe("approve");
    expect(effectiveMode(capByKey("payoff_auth"), "purchase", s, null, NOW)).toBe("approve");
    expect(effectiveMode(capByKey("open_escrow"), "refi", s, null, NOW)).toBe("approve");
    // The same for a per-loan setting.
    expect(effectiveMode(capByKey("hoa"), "purchase", none, { autonomy: { hoa: "auto" } }, NOW)).toBe("approve");
    // Defaults are the Recommended preset; counsel-cleared contact rows may be Full-auto.
    expect(effectiveMode(capByKey("client_updates"), "purchase", none, null, NOW)).toBe("approve");
    expect(effectiveMode(capByKey("client_updates"), "purchase", { modes: { purchase: { client_updates: "auto" }, refi: {} }, pausedUntil: null }, null, NOW)).toBe("auto");
    expect(effectiveMode(capByKey("hoa"), "refi", none, null, NOW)).toBe("off");
  });

  it("turns every Full-auto into LO-Auth while CC_LOA_AUTO is false", () => {
    const all = { modes: presetModes("recommended"), pausedUntil: null };
    for (const c of CAPS) for (const p of ["purchase", "refi"] as const) {
      const auto = { modes: { purchase: { [c.key]: "auto" }, refi: { [c.key]: "auto" } }, pausedUntil: null } as SwitchSettings;
      expect(effectiveMode(c, p, auto, null, NOW, { env: { CC_LOA_AUTO: "false" } })).not.toBe("auto");
      expect(effectiveMode(c, p, all, null, NOW, { env: { CC_LOA_AUTO: "false" } })).not.toBe("auto");
    }
    process.env.CC_LOA_AUTO = "false";
    expect(effectiveMode(capByKey("read_title"), "purchase", none, null, NOW)).toBe("approve");
    delete process.env.CC_LOA_AUTO;
    expect(effectiveMode(capByKey("read_title"), "purchase", none, null, NOW)).toBe("auto");
  });

  it("gives Off on a paused loan or while the loan officer is paused", () => {
    for (const c of CAPS) expect(effectiveMode(c, "purchase", none, { paused: true }, NOW)).toBe("off");
    expect(effectiveMode(capByKey("read_title"), "purchase", { ...none, pausedUntil: "2026-11-21T00:00:00Z" }, null, NOW)).toBe("off");
    expect(effectiveMode(capByKey("read_title"), "purchase", { ...none, pausedUntil: "2026-11-19T00:00:00Z" }, null, NOW)).toBe("auto");
  });

  it("lets only the loan officer change the switches; assistants can't, and the audit keeps keys only", async () => {
    expect(canChangeSwitches(helper, "lo1")).toBe(false);
    expect(canChangeSwitches({ ...lo, id: "lo2" }, "lo1")).toBe(false);
    expect(await saveAutonomy(helper, { purchase: { escrow_fees: "auto" } }, NOW)).toMatchObject({ ok: false });
    const r = await saveAutonomy(lo, { purchase: { escrow_fees: "auto", hoa: "auto", nonsense: "auto" }, refi: { open_escrow: "auto" } }, NOW);
    expect(r).toMatchObject({ ok: true, changed: 1 }); // hoa and refi open escrow clamp back to their defaults
    const a = await loaStore().autonomy("lo1");
    expect(a.modes.purchase).toMatchObject({ escrow_fees: "auto", hoa: "approve" });
    expect(a.modes.refi.open_escrow).toBe("approve");
    const audit = (await accountStore().recentAudit(10)).find((e) => e.action === "loa.autonomy")!;
    expect(audit.detail).toEqual({ keys: "purchase.escrow_fees", count: 1 });
    // Client updates are the same switch as the Automations borrower recipes.
    await saveAutonomy(lo, { purchase: { client_updates: "approve" }, refi: { client_updates: "approve" } }, NOW);
    expect((await automationStore().settings("lo1")).enabled.some((id) => id.startsWith("borrower_"))).toBe(true);
    expect((await autonomyOf("lo1")).modes.purchase.client_updates).toBe("approve");
    await saveAutonomy(lo, { purchase: { client_updates: "off" }, refi: { client_updates: "off" } }, NOW);
    expect((await automationStore().settings("lo1")).enabled.some((id) => id.startsWith("borrower_"))).toBe(false);
    // Per loan: the assistant can't, the loan officer can.
    const l = await loan();
    expect(await setLoanAutonomy(helper, l.id, { escrow_fees: "off" }, NOW)).toMatchObject({ ok: false });
    expect(await setLoanPaused(helper, l.id, true, NOW)).toMatchObject({ ok: false });
    expect(await setLoanAutonomy(lo, l.id, { escrow_fees: "off", hoa: "auto" }, NOW)).toMatchObject({ ok: true, changed: 2 });
    expect((await loaStore().file(l.id))!.autonomy).toEqual({ escrow_fees: "off", hoa: "approve" });
    expect(await setLoanAutonomy(lo, l.id, { escrow_fees: "inherit" }, NOW)).toMatchObject({ ok: true, changed: 1 });
    expect((await loaStore().file(l.id))!.autonomy).toEqual({ hoa: "approve" });
  });

  it("never lets a document overwrite a confirmed escrow email, and holds the loan when it changes", async () => {
    const l = await loan();
    await readIntoFile(lo, l.id, "purchase_agreement", { text: "psa text, long enough to read" }, NOW, reads("dana@lake-escrow.example"));
    let f = (await loaStore().file(l.id))!;
    const esc = f.parties.find((p) => p.role === "escrow")!;
    expect(esc).toMatchObject({ email: "dana@lake-escrow.example", source: "document", confirmedAt: null });
    expect(f.contract?.named).toContain("escrow");
    // Unconfirmed: a new copy may change it, and nothing is held.
    await readIntoFile(lo, l.id, "purchase_agreement", { text: "psa text, long enough to read" }, NOW, reads("dana2@lake-escrow.example"));
    f = (await loaStore().file(l.id))!;
    expect(f.parties.find((p) => p.role === "escrow")!.email).toBe("dana2@lake-escrow.example");
    expect(f.hold ?? null).toBeNull();
    // Confirmed, then a document with a different address arrives.
    expect(await confirmParty(lo, l.id, "escrow", NOW)).toBe(true);
    await readIntoFile(lo, l.id, "purchase_agreement", { text: "psa text, long enough to read" }, NOW, reads("wire-desk@lake-escrow-pay.example"));
    f = (await loaStore().file(l.id))!;
    expect(f.parties.find((p) => p.role === "escrow")!.email).toBe("dana2@lake-escrow.example");
    expect(f.hold).toMatchObject({ role: "escrow" });
    expect(f.review?.find((r) => r.field === "email")).toMatchObject({ was: "dana2@lake-escrow.example", now: "wire-desk@lake-escrow-pay.example" });
    // Everything automatic on the loan drops to asking first.
    expect(effectiveMode(capByKey("read_title"), "purchase", none, f, NOW)).toBe("approve");
    const tasks = await loaTasks(lo, NOW);
    expect(tasks[0]).toMatchObject({ urgent: true, title: expect.stringMatching(/Escrow's email changed/) });
    // The contract's other values never changed (fill-empty only).
    expect(f.contract?.price).toBe(650000);
    // Keeping the confirmed email lifts the hold.
    expect(await resolveReview(lo, l.id, f.review!.find((r) => r.field === "email")!.id, false, NOW)).toBe(true);
    f = (await loaStore().file(l.id))!;
    expect(f.hold).toBeNull();
    expect(f.parties.find((p) => p.role === "escrow")!.email).toBe("dana2@lake-escrow.example");
  });

  it("asks what the contract didn't answer, and an answer unlocks the Full-auto jobs", async () => {
    const l = await loan();
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto", insurance: "auto" } }, NOW);
    await readIntoFile(lo, l.id, "purchase_agreement", { text: "psa text, long enough to read" }, NOW, reads("dana@lake-escrow.example"));
    const settings = { modes: (await autonomyOf("lo1")).modes, pausedUntil: null };
    let f = (await loaStore().file(l.id))!;
    let rows = loanRows({ file: f, purpose: "purchase", agentOk: false }, settings, NOW);
    const g = gaps(rows);
    expect(g.auto.map((x) => x.key)).toEqual(["escrow_email", "insurance_email", "lender"]);
    expect(g.auto[0].unlocks.map((c) => c.key)).toEqual(expect.arrayContaining(["escrow_fees", "open_escrow", "payoffs"]));
    expect(rows.find((r) => r.cap.key === "escrow_fees")).toMatchObject({ mode: "auto", waits: true, need: "escrow's confirmed email" });
    // HOA questions are LO-Auth jobs: asked in the second list.
    expect(g.other.map((x) => x.key)).toContain("hoa");
    // The agent row doesn't exist without the client's OK.
    expect(rows.find((r) => r.cap.key === "agent_updates")?.applies).toBe(false);
    expect(await answerFact(lo, l.id, "escrow_email", "dana@lake-escrow.example", NOW)).toMatchObject({ ok: true });
    expect(await answerFact(lo, l.id, "hoa", false, NOW)).toMatchObject({ ok: true });
    f = (await loaStore().file(l.id))!;
    rows = loanRows({ file: f, purpose: "purchase", agentOk: false }, settings, NOW);
    expect(rows.find((r) => r.cap.key === "escrow_fees")).toMatchObject({ waits: false, need: null });
    expect(rows.find((r) => r.cap.key === "hoa")?.applies).toBe(false);
    expect(f.parties.find((p) => p.role === "escrow")?.confirmedAt).toBeTruthy();
  });

  it("writes refinance wording on a refinance, and asks when the loan system doesn't say", async () => {
    const r = await loan("Refinance", "R-1");
    expect(await makeDraft(lo, r.id, "open_title", NOW)).toMatchObject({ ok: true });
    expect(await makeDraft(lo, r.id, "escrow_fees", NOW)).toMatchObject({ ok: true });
    const f = (await loaStore().file(r.id))!;
    const title = f.drafts.find((d) => d.kind === "open_title")!;
    expect(title.body).toMatch(/'s refinance\./);
    expect(title.body).not.toMatch(/purchase/);
    expect(title).toMatchObject({ cap: "order_title", mode: "approve", status: "draft" });
    const fees = f.drafts.find((d) => d.kind === "escrow_fees")!;
    expect(fees.body).toMatch(/for the borrower, so I can get them into the Loan Estimate/);
    expect(fees.body).not.toMatch(/buyer/);
    // A purchase keeps "the buyer".
    const p = await loan("Purchase", "P-2");
    await makeDraft(lo, p.id, "open_title", NOW);
    expect((await loaStore().file(p.id))!.drafts[0].body).toMatch(/'s purchase\./);
    // Unknown type: the loan officer says which.
    const u = await loan("Construction", "U-3");
    expect(purposeKind(u, await loaStore().file(u.id))).toBeNull();
    expect(await setPurpose(lo, u.id, "refi", NOW)).toBe(true);
    expect(purposeKind(u, await loaStore().file(u.id))).toBe("refi");
  });

  it("puts every prepared email in one queue with one-tap Approve, and nothing sends without it", async () => {
    const l = await loan();
    await readIntoFile(lo, l.id, "purchase_agreement", { text: "psa text, long enough to read" }, NOW, reads("dana@lake-escrow.example"));
    expect(await makeDraft(lo, l.id, "escrow_fees", NOW)).toMatchObject({ ok: true });
    let q = await loaQueue(helper);
    expect(q.drafts).toHaveLength(1);
    expect((await loaTasks(lo, NOW)).find((t) => t.kind === "draft")).toMatchObject({ href: "/mlo/loa#needs" });
    const sent: string[] = [];
    const sender: PartySender = async (_u, to) => (sent.push(to), { ok: true, via: "test" });
    // Nothing went out on its own.
    expect(sent).toHaveLength(0);
    // The assistant may approve third-party drafts.
    expect(await approveLoaDraft(helper, l.id, q.drafts[0].draft.id, NOW, sender)).toMatchObject({ ok: true });
    expect(sent).toEqual(["dana@lake-escrow.example"]);
    const d = (await loaStore().file(l.id))!.drafts.find((x) => x.kind === "escrow_fees")!;
    expect(d).toMatchObject({ status: "sent", approvedBy: "as1@x.com" });
    q = await loaQueue(lo);
    expect(q.drafts).toHaveLength(0);
  });
});
