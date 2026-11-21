import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryJourneyStore, setJourneyStoreForTests, emptyJourney, journeyStore, type Journey } from "@/lib/journey/store";
import { MemoryContactStore, setContactStoreForTests, contactStore, type Contact } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryConciergeStore, setConciergeStoreForTests, conciergeStore } from "@/lib/concierge/store";
import { MemoryAccountStore, setAccountStoreForTests, accountStore, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests, type Loan } from "@/lib/pipeline/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { ingest, readPayload } from "@/lib/pipeline/intake";
import { CONFIG } from "@/lib/config";
import { digestFor } from "@/lib/digest";
import { CAP_KEYS, isCapKey, type CapKey, type Mode, type SwitchSettings } from "./autonomy";
import { emptyFile, loaStore, newMemoryLoaStore, setLoaStoreForTests, type Contract, type LoaFile, type Party } from "./store";
import { confirmParty, saveAutonomy, type PartySender } from "./service";
import { AUTO_BY, draftCorrection, fingerprint, loaDigestLine, MORNING_RUN_UTC_HOUR, nextMorningRun, plan, runLoaAutopilot, sendAfterFor, sendQueued, sendSoon, setSendWhen, stopQueued, whenLong, whenShort, type PlanCtx } from "./autopilot";
import { GET as tick } from "@/app/api/cc/loa/tick/route";

const NOW = new Date("2026-11-20T18:00:00Z"); // Friday, 10:00 AM Pacific
const lo: User = { id: "lo1", email: "lo1@x.com", name: "Pat Lee", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const helper: User = { id: "as1", email: "as1@x.com", name: "Sam Helper", role: "assistant", mloId: null, assistsUserId: "lo1", status: "active", createdAt: "", createdBy: "" };

const contract = (over: Partial<Contract> = {}): Contract => ({ price: 650000, sellerCredits: null, earnestMoney: 15000, property: { street: "12 Elm St", city: "Kirkland", state: "WA", zip: "98033" }, mutualAcceptance: "2026-11-18", earnestMoneyDue: null, inspectionEnds: null, financingContingencyEnds: null, appraisalContingencyEnds: null, closingDate: "2026-12-18", possession: null, notes: [], named: ["escrow", "title"], ...over });
const party = (role: Party["role"], email: string, confirmed = true): Party => ({ role, company: `${role} co`, name: "Dana Fox", email, phone: "", source: confirmed ? "lo" : "document", confirmedAt: confirmed ? NOW.toISOString() : null, confirmedBy: confirmed ? "lo1@x.com" : null });
const loanOf = (over: Partial<Loan> = {}): Loan => ({ id: "L1", ownerUserId: "lo1", externalId: "1", source: "arive", contactId: "c1", borrowerName: "Ann Lee", purpose: "Purchase", loanType: null, amount: null, noteRate: null, milestone: "Application Taken", milestoneAt: NOW.toISOString(), history: [], keyDates: { application: "2026-11-17", lockExpires: null, appraisal: null, clearToClose: null, closing: null }, agentName: null, closed: false, dead: false, updatedAt: "", ...over });
const fileOf = (over: Partial<LoaFile> = {}): LoaFile => ({ ...emptyFile("L1", "lo1"), contract: contract(), parties: [party("escrow", "dana@lake-escrow.example")], ...over });
const set = (m: Partial<Record<CapKey, Mode>>): SwitchSettings => ({ modes: { purchase: { ...m }, refi: { ...m } }, pausedUntil: null });
const ctxOf = (over: Partial<PlanCtx> = {}): PlanCtx => ({ file: fileOf(), loan: loanOf(), journey: emptyJourney("L1", "lo1"), purpose: "purchase", settings: set({ escrow_fees: "auto" }), now: NOW, trigger: "read", me: "Pat", borrower: "Ann Lee", client: { id: "c1", firstName: "Ann", lastName: "Lee" }, agent: null, recipes: [], previousMilestone: null, portal: `${CONFIG.siteUrl.replace(/\/$/, "")}/apply`, ...over });
const ALL_AUTO = set(Object.fromEntries(CAP_KEYS.map((k) => [k, "auto"])) as Record<CapKey, Mode>);

describe("LOA Full-auto: the planner (D71)", () => {
  it("plans one escrow fees send on a purchase with escrow's email confirmed", () => {
    const a = plan(ctxOf()).filter((x) => x.cap === "escrow_fees");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "send", mode: "auto", key: "loa:escrow_fees:L1", to: "escrow", toEmail: "dana@lake-escrow.example", reason: null, followUp: 0 });
    expect(a[0].body).toMatch(/for the buyer, so I can get them into the Loan Estimate/);
  });

  it("drops to LO-Auth, with the reason, when escrow's email only came from a document", () => {
    const a = plan(ctxOf({ file: fileOf({ parties: [party("escrow", "dana@lake-escrow.example", false)] }) })).find((x) => x.cap === "escrow_fees")!;
    expect(a).toMatchObject({ kind: "draft", mode: "approve", wanted: "auto", reason: expect.stringMatching(/came from a document and isn't confirmed/) });
    // With no email at all the job waits (the contract's questions ask for it); nothing is planned.
    expect(plan(ctxOf({ file: fileOf({ parties: [] }) })).filter((x) => x.cap === "escrow_fees")).toHaveLength(0);
  });

  it("turns every Full-auto into LO-Auth while CC_LOA_AUTO is false", () => {
    const base = { settings: ALL_AUTO, file: fileOf({ parties: [party("escrow", "e@x.example"), party("title", "t@x.example")] }) };
    expect(plan(ctxOf(base)).some((a) => a.mode === "auto" && (a.kind === "send" || a.kind === "text"))).toBe(true);
    const off = plan(ctxOf({ ...base, env: { CC_LOA_AUTO: "false" } })).filter((a) => a.kind !== "task");
    expect(off.length).toBeGreaterThan(0);
    for (const a of off) expect(a).toMatchObject({ mode: "approve", wanted: "auto", reason: "Full-auto is switched off for everyone right now" });
  });

  it("drops to LO-Auth when something is left to fill in", () => {
    const letter = { subject: "Evidence of insurance: 12 Elm St", body: "Please send the binder with the mortgagee clause: [the lender's mortgagee clause]\n\nThank you,\nPat" };
    const a = plan(ctxOf({ settings: set({ insurance: "auto" }), letters: { insurance: letter }, file: fileOf({ parties: [party("insurance", "ins@agent.example"), { ...party("lender", ""), company: "UWM" }] }) })).find((x) => x.cap === "insurance")!;
    expect(a).toMatchObject({ mode: "approve", kind: "draft", reason: "something in it is left to fill in" });
  });

  it("never sends an SSN on its own, and keeps it out of the draft too", () => {
    const a = plan(ctxOf({ borrower: "Ann Lee 123-45-6789" })).find((x) => x.cap === "escrow_fees")!;
    expect(a).toMatchObject({ mode: "approve", reason: expect.stringMatching(/Social Security/) });
    expect(a.body).not.toContain("123-45-6789");
  });

  it("plans nothing on a paused loan", () => {
    expect(plan(ctxOf({ file: fileOf({ paused: true }), settings: ALL_AUTO }))).toEqual([]);
  });

  it("follows up once on escrow's fees, and stops once the fees are in", () => {
    const sent = { id: "d1", to: "escrow" as const, toName: "Dana Fox", toEmail: "dana@lake-escrow.example", subject: "Escrow fee estimate", body: "x", kind: "escrow_fees" as const, status: "sent" as const, createdAt: "2026-11-16T17:00:00Z", sentAt: "2026-11-16T17:00:00Z" };
    const a = plan(ctxOf({ file: fileOf({ drafts: [sent] }) })).filter((x) => x.cap === "escrow_fees");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ key: "loa:escrow_fees:L1:1", followUp: 1, subject: expect.stringMatching(/^Following up/) });
    // Not before two business days.
    expect(plan(ctxOf({ file: fileOf({ drafts: [{ ...sent, sentAt: "2026-11-19T17:00:00Z" }] }) })).filter((x) => x.cap === "escrow_fees")).toHaveLength(0);
    // Not a second follow-up.
    expect(plan(ctxOf({ file: fileOf({ drafts: [sent, { ...sent, id: "d2", sentAt: "2026-11-17T17:00:00Z" }] }) })).filter((x) => x.cap === "escrow_fees")).toHaveLength(0);
    // The fees came in: no follow-up.
    expect(plan(ctxOf({ file: fileOf({ drafts: [sent], escrowFees: { from: "Lake Escrow", total: 2150, lines: [], receivedAt: NOW.toISOString() } }) })).filter((x) => x.cap === "escrow_fees")).toHaveLength(0);
  });

  it("plans nothing from a purchase contract on a refinance without one", () => {
    const refi = { purpose: "refi" as const, loan: loanOf({ purpose: "Refinance", keyDates: { application: null, lockExpires: null, appraisal: null, clearToClose: null, closing: null } }), file: fileOf({ contract: null, parties: [party("escrow", "e@x.example"), party("title", "t@x.example")] }), settings: ALL_AUTO };
    expect(plan(ctxOf(refi)).filter((a) => a.kind !== "task")).toEqual([]);
    // Once the application date is in, the refinance jobs start, none of them from a contract.
    const a = plan(ctxOf({ ...refi, loan: loanOf({ purpose: "Refinance" }) }));
    expect(a.map((x) => x.cap)).toEqual(expect.arrayContaining(["escrow_fees", "order_title"]));
    expect(a.some((x) => x.cap === "read_psa")).toBe(false);
    expect(a.every((x) => !/buyer|purchase/i.test(x.body))).toBe(true);
    // Open escrow and order title can't be Full-auto on a refinance (settlement services can be shopped).
    expect(a.find((x) => x.cap === "order_title")).toMatchObject({ mode: "approve" });
  });

  it("never plans a disclosure from a conditional approval", () => {
    const journey: Journey = { ...emptyJourney("L1", "lo1"), docs: [{ id: "x1", name: "Most recent pay stub", why: "Conditional approval", phase: "final", status: "needed", at: NOW.toISOString() }] };
    const file = fileOf({ approvalReceivedAt: NOW.toISOString(), escrowFees: { from: "Lake Escrow", total: 1, lines: [], receivedAt: "" }, title: { commitmentDate: null, vesting: "", items: [], receivedAt: "" }, checks: { insurance: { done: true, at: "", by: "" } }, drafts: [{ id: "o", to: "escrow", toName: "", toEmail: "", subject: "", body: "", kind: "open_escrow", status: "sent", createdAt: "", sentAt: "" }] });
    const a = plan(ctxOf({ file, journey, settings: ALL_AUTO }));
    expect(a.find((x) => x.cap === "borrower_conditions")).toMatchObject({ kind: "text", mode: "auto", to: "client", count: 1, body: expect.stringMatching(/the 1 item your file needs for final approval in your secure portal/) });
    for (const x of a) {
      expect(isCapKey(x.cap)).toBe(true);
      // Reminders to the loan officer may name a federal deadline; nothing that goes out is a disclosure.
      if (x.kind === "task") expect(x.to).toBe("lo");
      else expect(`${x.subject} ${x.body}`).not.toMatch(/Loan Estimate|Closing Disclosure|disclos/i);
    }
  });

  it("updates the client's agent only with the client's OK", () => {
    const moved = { trigger: "loan_change" as const, previousMilestone: "Application Taken", loan: loanOf({ milestone: "Appraisal Ordered" }), recipes: ["borrower_appraisal", "agent_appraisal"], settings: set({ client_updates: "auto", agent_updates: "auto" }) };
    let a = plan(ctxOf(moved));
    expect(a.find((x) => x.cap === "client_updates")).toMatchObject({ kind: "text", mode: "auto", to: "client", recipeKey: "borrower_appraisal:L1" });
    expect(a.some((x) => x.cap === "agent_updates")).toBe(false);
    a = plan(ctxOf({ ...moved, agent: { id: "a1", firstName: "Rae", lastName: "Kim" } }));
    expect(a.find((x) => x.cap === "agent_updates")).toMatchObject({ kind: "text", mode: "auto", to: "agent", contactId: "a1", body: expect.stringMatching(/^Hi Rae, an update on Ann's loan: the appraisal has been ordered/) });
    // The same stage again plans nothing.
    expect(plan(ctxOf({ ...moved, previousMilestone: "Appraisal ordered" })).filter((x) => x.cap.endsWith("_updates"))).toEqual([]);
  });
});

describe("LOA Full-auto: send times (D71)", () => {
  it("goes with the next morning run by default, or 15 minutes after it's ready", () => {
    expect(nextMorningRun(NOW).toISOString()).toBe("2026-11-21T15:00:00.000Z");
    expect(nextMorningRun(new Date("2026-11-20T14:00:00Z")).toISOString()).toBe("2026-11-20T15:00:00.000Z");
    const morning = { sendAfter: sendAfterFor("morning", NOW, 15), when: "morning" as const };
    expect(whenShort(morning, NOW)).toBe("with tomorrow morning's run");
    expect(whenLong(morning, NOW)).toBe("Goes out with tomorrow morning's run.");
    expect(whenShort({ sendAfter: "2026-11-20T15:00:00Z", when: "morning" }, new Date("2026-11-20T14:00:00Z"))).toBe("with this morning's run");
    const soon = { sendAfter: sendAfterFor("soon", NOW, 15), when: "soon" as const };
    expect(soon.sendAfter).toBe("2026-11-20T18:15:00.000Z");
    expect(whenShort(soon, NOW)).toBe("at 10:15 AM PT");
    expect(whenLong(soon, NOW)).toBe("Goes out at 10:15 AM PT, or when you next open Command Center.");
    expect(whenLong(soon, new Date("2026-11-20T19:00:00Z"))).toMatch(/next time Command Center runs/);
  });

  it("matches the morning run in vercel.json, and adds no cron the free plan refuses", () => {
    const v = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };
    const sweep = v.crons.find((c) => c.path === "/api/cc/concierge/sweep")!;
    expect(Number(sweep.schedule.split(" ")[1])).toBe(MORNING_RUN_UTC_HOUR);
    // Daily only on Hobby: a fixed minute and a fixed hour on every cron, and no LOA tick there.
    for (const c of v.crons) expect(c.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
    expect(v.crons.some((c) => c.path === "/api/cc/loa/tick")).toBe(false);
  });
});

describe("LOA Full-auto: running it (D71)", () => {
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
    delete process.env.CRON_SECRET;
  });
  const newLoan = (n = "L-1", purpose = "Purchase") => ingest("lo1", readPayload({ loanNumber: n, borrowerName: "Ann Lee", borrowerPhone: "(206) 823-1234", loanStatus: "Application Taken", loanPurpose: purpose, applicationDate: "2026-11-17" })!, "arive", NOW);
  /** A purchase with the contract in and escrow's email confirmed. */
  const ready = async (n = "L-1", email = "dana@lake-escrow.example", confirmed = true) => {
    const l = await newLoan(n);
    await loaStore().putFile({ ...emptyFile(l.id, "lo1"), contract: contract(), parties: [party("escrow", email, confirmed)] });
    return l;
  };
  const queued = async (loanId: string) => (await loaStore().file(loanId))!.drafts.filter((d) => d.status === "queued");
  const sender = (sent: string[], ok = true): PartySender => async (_u, to) => (sent.push(to), ok ? { ok: true, via: "test" } : { ok: false, via: "", error: "Email isn't set up yet." });
  const TOMORROW = new Date("2026-11-21T15:20:00Z");

  it("claims each job once: the same key twice fires once", async () => {
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto" } }, NOW);
    const l = await ready();
    const r1 = await runLoaAutopilot(l, "read", NOW);
    expect(r1.lines.join(" ")).toMatch(/Asked escrow for fees\. It goes out with tomorrow morning's run unless you stop it\./);
    await runLoaAutopilot(l, "read", NOW);
    await runLoaAutopilot(l, "sweep", NOW);
    const q = await queued(l.id);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ cap: "escrow_fees", mode: "auto", when: "morning", sendAfter: "2026-11-21T15:00:00.000Z", fixed: fingerprint(q[0]) });
    const f = (await loaStore().file(l.id))!;
    expect(f.auto?.filter((e) => e.cap === "escrow_fees")).toEqual([expect.objectContaining({ status: "queued", toRole: "escrow", action: "Asked escrow for fees" })]);
    // The log never holds the address or the words.
    expect(JSON.stringify(f.auto)).not.toMatch(/dana@|Could you send/);
  });

  it("sends nothing before its time, then sends it (and logs and audits without the address)", async () => {
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto" } }, NOW);
    const l = await ready();
    await runLoaAutopilot(l, "read", NOW);
    const sent: string[] = [];
    expect(await sendQueued(lo, NOW, { send: sender(sent) })).toMatchObject({ sent: 0 });
    expect(await sendQueued(lo, TOMORROW, { send: sender(sent) })).toMatchObject({ sent: 1 });
    expect(sent).toEqual(["dana@lake-escrow.example"]);
    const d = (await loaStore().file(l.id))!.drafts.find((x) => x.cap === "escrow_fees")!;
    expect(d).toMatchObject({ status: "sent", approvedBy: AUTO_BY });
    const audit = (await accountStore().recentAudit(20)).find((e) => e.action === "loa.auto.send")!;
    expect(audit.detail).toEqual({ loanId: l.id, cap: "escrow_fees", toRole: "escrow" });
    // A second run never sends it again.
    expect(await sendQueued(lo, new Date(TOMORROW.getTime() + 60_000), { send: sender(sent) })).toMatchObject({ sent: 0 });
    // After it went: a correction, for the loan officer to check and send.
    expect(await draftCorrection(lo, l.id, d.id, TOMORROW)).toMatchObject({ ok: true });
    const c = (await loaStore().file(l.id))!.drafts.find((x) => x.subject.startsWith("Correction:"))!;
    expect(c).toMatchObject({ status: "draft", toEmail: "dana@lake-escrow.example" });
    expect(c.body).toContain("[write the correction here]");
  });

  it("Stop: a queued message never goes", async () => {
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto" } }, NOW);
    const l = await ready();
    await runLoaAutopilot(l, "read", NOW);
    const [d] = await queued(l.id);
    // An assistant may stop one.
    expect(await stopQueued(helper, l.id, d.id, NOW)).toMatchObject({ ok: true });
    const sent: string[] = [];
    expect(await sendQueued(lo, TOMORROW, { send: sender(sent) })).toMatchObject({ sent: 0 });
    expect(sent).toEqual([]);
    const f = (await loaStore().file(l.id))!;
    expect(f.drafts.find((x) => x.id === d.id)?.status).toBe("stopped");
    expect(f.auto?.at(-1)).toMatchObject({ status: "stopped", ref: d.id });
    expect(await stopQueued(lo, l.id, d.id, NOW)).toMatchObject({ ok: false });
  });

  it("Send in 15 minutes moves it from the morning run to the undo window", async () => {
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto" } }, NOW);
    const l = await ready();
    await runLoaAutopilot(l, "read", NOW);
    const [d] = await queued(l.id);
    expect(await sendSoon(lo, l.id, d.id, NOW)).toMatchObject({ ok: true, line: expect.stringMatching(/Goes out at 10:15 AM PT, or when you next open Command Center/) });
    const sent: string[] = [];
    expect(await sendQueued(lo, new Date("2026-11-20T18:10:00Z"), { send: sender(sent) })).toMatchObject({ sent: 0 });
    expect(await sendQueued(lo, new Date("2026-11-20T18:16:00Z"), { send: sender(sent) })).toMatchObject({ sent: 1 });
    // The officer setting does the same for everything new; only the loan officer changes it.
    expect(await setSendWhen(helper, "soon", NOW)).toMatchObject({ ok: false });
    expect(await setSendWhen(lo, "soon", NOW)).toMatchObject({ ok: true });
    const l2 = await ready("L-2", "other@escrow.example");
    await runLoaAutopilot(l2, "read", NOW);
    expect((await queued(l2.id))[0]).toMatchObject({ when: "soon", sendAfter: "2026-11-20T18:15:00.000Z" });
  });

  it("holds the 16th Full-auto message that day until the next morning run", async () => {
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto" } }, NOW);
    for (let i = 1; i <= 16; i++) await runLoaAutopilot(await ready(`L-${i}`, `escrow${i}@x.example`), "read", NOW);
    const sent: string[] = [];
    const r = await sendQueued(lo, TOMORROW, { send: sender(sent) });
    expect(r).toMatchObject({ sent: 15, held: 1 });
    expect(sent).toHaveLength(15);
    const all = await loaStore().filesFor("lo1");
    const waiting = all.flatMap((f) => f.drafts).filter((d) => d.status === "queued");
    expect(waiting).toHaveLength(1);
    expect(waiting[0].sendAfter).toBe("2026-11-22T15:00:00.000Z");
    expect(all.flatMap((f) => f.auto ?? []).find((e) => e.status === "held" && e.cap === "escrow_fees")?.reason).toMatch(/over today's limit of 15/);
    expect((await accountStore().recentAudit(50)).some((e) => e.action === "loa.auto.hold")).toBe(true);
  });

  it("sends at most 3 a day to one address", async () => {
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto" } }, NOW);
    for (let i = 1; i <= 4; i++) await runLoaAutopilot(await ready(`L-${i}`, "same@escrow.example"), "read", NOW);
    const sent: string[] = [];
    expect(await sendQueued(lo, TOMORROW, { send: sender(sent) })).toMatchObject({ sent: 3, held: 1 });
  });

  it("with the kill switch off, a queued message drops to LO-Auth instead of going", async () => {
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto" } }, NOW);
    const l = await ready();
    await runLoaAutopilot(l, "read", NOW);
    process.env.CC_LOA_AUTO = "false";
    const sent: string[] = [];
    expect(await sendQueued(lo, TOMORROW, { send: sender(sent) })).toMatchObject({ sent: 0, held: 1 });
    expect(sent).toEqual([]);
    const d = (await loaStore().file(l.id))!.drafts.find((x) => x.cap === "escrow_fees")!;
    expect(d).toMatchObject({ status: "draft", mode: "approve", autoReason: "Full-auto is switched off for everyone right now" });
    // And nothing new is queued while it's off.
    const l2 = await ready("L-2", "other@escrow.example");
    await runLoaAutopilot(l2, "read", NOW);
    expect(await queued(l2.id)).toHaveLength(0);
  });

  it("a send that fails (no mail service) is logged and waits for the loan officer", async () => {
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto" } }, NOW);
    const l = await ready();
    await runLoaAutopilot(l, "read", NOW);
    expect(await sendQueued(lo, TOMORROW, { send: sender([], false) })).toMatchObject({ sent: 0, failed: 1 });
    const f = (await loaStore().file(l.id))!;
    expect(f.auto?.at(-1)).toMatchObject({ status: "failed", reason: expect.stringMatching(/didn't go out \(Email isn't set up yet\.\)/) });
    expect(f.drafts.find((x) => x.cap === "escrow_fees")).toMatchObject({ status: "draft" });
  });

  it("an unconfirmed email asks first, and confirming it lets it go on its own", async () => {
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto" } }, NOW);
    const l = await ready("L-1", "dana@lake-escrow.example", false);
    const r = await runLoaAutopilot(l, "read", NOW);
    expect(r.lines.join(" ")).toMatch(/Ready for your OK: ask escrow for their fee estimate \(it asks you because Escrow's email came from a document/);
    expect(await queued(l.id)).toHaveLength(0);
    expect(await confirmParty(lo, l.id, "escrow", NOW)).toBe(true);
    const r2 = await runLoaAutopilot(l, "answer", NOW);
    expect(r2.queued).toBe(1);
    expect(await queued(l.id)).toHaveLength(1);
  });

  it("a confirmed email changing afterwards stops it from going on its own", async () => {
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto" } }, NOW);
    const l = await ready();
    await runLoaAutopilot(l, "read", NOW);
    const f = (await loaStore().file(l.id))!;
    await loaStore().putFile({ ...f, parties: [party("escrow", "wire-desk@lake-escrow-pay.example")] });
    const sent: string[] = [];
    expect(await sendQueued(lo, TOMORROW, { send: sender(sent) })).toMatchObject({ sent: 0, held: 1 });
    expect((await loaStore().file(l.id))!.drafts.find((x) => x.cap === "escrow_fees")?.autoReason).toMatch(/changed since this was ready/);
  });

  it("a text to the client still goes through the contact rules; blocked, it lands on the Concierge desk", async () => {
    await saveAutonomy(lo, { purchase: { borrower_conditions: "auto" } }, NOW);
    const l = await newLoan();
    await loaStore().putFile({ ...emptyFile(l.id, "lo1"), contract: contract(), approvalReceivedAt: NOW.toISOString() });
    await journeyStore().put({ ...emptyJourney(l.id, "lo1"), docs: [{ id: "x1", name: "Pay stub", why: "", phase: "final", status: "needed", at: NOW.toISOString() }] });
    expect((await contactStore().get(l.contactId!)) as Contact).toBeTruthy();
    // A Full-auto text as the planner queues it (the fixed document request).
    const body = `Hi Ann, I've posted the 1 item your file needs for final approval in your secure portal: ${CONFIG.siteUrl.replace(/\/$/, "")}/apply Please upload them there (not by text or email). Reply here with any questions. -Pat`;
    const m = { to: "client" as const, toEmail: "", contactId: l.contactId, subject: "", body };
    const f = (await loaStore().file(l.id))!;
    await loaStore().putFile({ ...f, drafts: [{ id: "q1", ...m, toName: "Ann", kind: "borrower_conditions", status: "queued", createdAt: NOW.toISOString(), sentAt: null, cap: "borrower_conditions", mode: "auto", when: "morning", sendAfter: "2026-11-21T15:00:00.000Z", channel: "text", fixed: fingerprint(m), followUp: 0 }] });
    const texts: string[] = [];
    const r = await sendQueued(lo, TOMORROW, { send: sender([]), text: async (_u, _id, b) => (texts.push(b), { ok: true }) });
    // No permission on file: the gate says no, so nothing is texted and it waits on the desk.
    expect(texts).toEqual([]);
    expect(r).toMatchObject({ sent: 0, held: 1 });
    const p = await conciergeStore().proposals("lo1", "pending");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ contactId: l.contactId, purpose: "service", why: expect.stringMatching(/your contact rules stopped it/) });
    expect((await loaStore().file(l.id))!.drafts[0]).toMatchObject({ status: "held", mode: "approve" });
  });

  it("puts one line in the morning email, counts only", async () => {
    await saveAutonomy(lo, { purchase: { escrow_fees: "auto" } }, NOW);
    const l = await ready();
    await runLoaAutopilot(l, "read", NOW);
    expect(await loaDigestLine(lo, NOW)).toMatch(/^Your LOA: 0 sent on their own, \d+ waiting for your OK, 1 going out on its own unless you stop it\.$/);
    await sendQueued(lo, TOMORROW, { send: sender([]) });
    expect(await loaDigestLine(lo, TOMORROW)).toMatch(/^Your LOA: 1 sent on its own, \d+ waiting for your OK\.$/);
    const d = await digestFor(lo, TOMORROW);
    expect(d.text).toMatch(/Your LOA: 1 sent on its own/);
    expect(d.text).not.toMatch(/dana@|Could you send/);
  });
});

describe("The LOA tick (D71)", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
    setLoaStoreForTests(null);
  });
  const req = (auth?: string) => new Request("http://localhost/api/cc/loa/tick", { headers: auth ? { authorization: auth } : {} });

  it("is a 404 without CRON_SECRET or with the wrong one, and runs with the right one", async () => {
    setLoaStoreForTests(newMemoryLoaStore());
    expect((await tick(req("Bearer anything"))).status).toBe(404);
    process.env.CRON_SECRET = "s3cret-value";
    expect((await tick(req())).status).toBe(404);
    expect((await tick(req("Bearer wrong-value"))).status).toBe(404);
    expect((await tick(req("Bearer s3cret-valu"))).status).toBe(404);
    const ok = await tick(req("Bearer s3cret-value"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, sent: 0 });
  });
});
