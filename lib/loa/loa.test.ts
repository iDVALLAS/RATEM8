import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryJourneyStore, setJourneyStoreForTests, journeyStore } from "@/lib/journey/store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { ingest, readPayload } from "@/lib/pipeline/intake";
import { AGENT_KEYS } from "@/lib/agents/team";
import { cdReceivedBy, cdSendBy, federalHolidays, leDueBy, voeWindowOpens } from "./dates";
import { newMemoryLoaStore, setLoaStoreForTests, loaStore } from "./store";
import { fileFor, loaTasks, makeDraft, readIntoFile, sendDraft, setCondition, type PartySender } from "./service";
import { addOverlay, askLoa, GUIDE_DOMAINS, type AskModel } from "./chat";
import type { DocCall } from "./readers";

const NOW = new Date("2026-11-20T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat Lee", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };

const PSA = { price: 650000, sellerCredits: 10000, earnestMoney: 15000, property: { street: "12 Elm St", city: "Kirkland", state: "WA", zip: "98033" }, mutualAcceptance: "2026-11-18", earnestMoneyDue: "2026-11-21", inspectionEnds: "2026-11-28", financingContingencyEnds: "2026-12-09", appraisalContingencyEnds: "2026-12-04", closingDate: "2026-12-18", possession: "2026-12-19", parties: [{ role: "escrow", company: "Lake Escrow", name: "Dana Fox", email: "dana@lake-escrow.example", phone: "425-821-0000" }, { role: "title", company: "First Title", name: "Rae Kim", email: "rae@firsttitle.example", phone: "" }, { role: "listing_agent", company: "Eastside Realty", name: "Sam Roe", email: "not-an-email", phone: "" }], notes: ["Seller pays the owner's title policy"] };
const TITLE = { commitmentDate: "2026-11-25", vesting: "Jordan and Casey Seller", items: [{ kind: "mortgage", text: "Deed of trust to Big Bank, recorded 2019 as 2019-0001234", payoff: true }, { kind: "judgment", text: "Judgment for county taxes", payoff: true }, { kind: "easement", text: "Utility easement along the north line", payoff: false }] };
const APPROVAL = { lender: "UWM", approvalDate: "2026-12-01", expires: "2026-12-31", conditions: [{ text: "Most recent pay stub", owner: "borrower", priorTo: "docs" }, { text: "Hazard insurance binder", owner: "third_party", priorTo: "docs" }, { text: "Signed 4506-C", owner: "loan_officer", priorTo: "docs" }] };
const FEES = { from: "Lake Escrow", total: 2150, lines: [{ label: "Escrow fee", amount: 1950 }, { label: "Courier", amount: 200 }] };
const fake: DocCall = async (kind) => ({ json: JSON.stringify({ purchase_agreement: PSA, title_commitment: TITLE, conditional_approval: APPROVAL, escrow_fees: FEES }[kind]), stop: "end_turn" });

describe("The Loan Officer Assistant (D62)", () => {
  beforeEach(async () => {
    setJourneyStoreForTests(new MemoryJourneyStore());
    setContactStoreForTests(new MemoryContactStore());
    setTouchStoreForTests(new MemoryTouchStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    setLoaStoreForTests(newMemoryLoaStore());
    const a = new MemoryAccountStore();
    await a.putUser(me);
    setAccountStoreForTests(a);
  });
  afterEach(() => {
    for (const f of [setJourneyStoreForTests, setContactStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setPipelineStoreForTests, setAutomationStoreForTests, setAccountStoreForTests, setLoaStoreForTests]) f(null);
  });
  const loan = () => ingest("lo1", readPayload({ loanNumber: "L-1", borrowerName: "Ann Lee", borrowerPhone: "(206) 823-1234", loanStatus: "Application Taken", loanPurpose: "Purchase", applicationDate: "2026-11-25" })!, "arive", NOW);

  it("is the ninth team member, shown first", () => {
    expect(AGENT_KEYS).toHaveLength(9);
    expect(AGENT_KEYS[0]).toBe("loa");
  });

  it("counts business days the way TRID and the Selling Guide do", () => {
    const h = federalHolidays(2026);
    expect(h.has("2026-11-26")).toBe(true); // Thanksgiving
    expect(h.has("2026-07-03")).toBe(true); // July 4th falls on a Saturday
    expect(leDueBy("2026-11-25")).toBe("2026-11-30"); // skips Thanksgiving and Sunday, counts Saturday
    expect(cdReceivedBy("2026-12-10")).toBe("2026-12-07");
    expect(cdSendBy("2026-12-10")).toBe("2026-12-03");
    expect(voeWindowOpens("2026-12-10")).toBe("2026-11-25"); // ten weekdays, Thanksgiving skipped
  });

  it("reads the purchase agreement into the file and keeps every deadline", async () => {
    const l = await loan();
    const r = await readIntoFile(me, l.id, "purchase_agreement", { text: "x".repeat(50) }, NOW, fake);
    expect(r).toMatchObject({ ok: true, summary: expect.stringMatching(/\$650,000.*closing 2026-12-18/) });
    const ctx = (await fileFor(me, l.id))!;
    expect(ctx.file.contract).toMatchObject({ price: 650000, closingDate: "2026-12-18" });
    expect(ctx.file.parties.find((p) => p.role === "listing_agent")?.email).toBe(""); // a bad email isn't kept
    const keys = ctx.file.deadlines.map((d) => d.key);
    expect(keys).toEqual(expect.arrayContaining(["emd", "inspection", "financing", "appraisal_contingency", "closing", "cd_send", "cd_receive", "voe"]));
    expect(ctx.file.deadlines.find((d) => d.key === "cd_receive")?.date).toBe(cdReceivedBy("2026-12-18"));
    expect(ctx.file.checks.contract?.done).toBe(true);
    // No document: a plain message.
    expect(await readIntoFile(me, l.id, "purchase_agreement", {}, NOW, fake)).toMatchObject({ ok: false });
  });

  it("reads title, drafts the payoffs to escrow, and sends only when the loan officer does", async () => {
    const l = await loan();
    await readIntoFile(me, l.id, "purchase_agreement", { text: "psa text here, long enough" }, NOW, fake);
    const r = await readIntoFile(me, l.id, "title_commitment", { text: "title text here, long enough" }, NOW, fake);
    expect(r).toMatchObject({ ok: true, summary: expect.stringMatching(/2 to pay off/) });
    let f = (await loaStore().file(l.id))!;
    const d = f.drafts.find((x) => x.kind === "payoffs")!;
    expect(d).toMatchObject({ status: "draft", toEmail: "dana@lake-escrow.example" });
    expect(d.body).toContain("Deed of trust to Big Bank");
    expect(d.body).toContain("12 Elm St, Kirkland, WA 98033");
    const sent: { to: string; text: string }[] = [];
    const sender: PartySender = async (_u, to, _s, text) => (sent.push({ to, text }), { ok: true, via: "pat@mybrokerage.example" });
    expect(await sendDraft(me, l.id, d.id, { to: "", subject: d.subject, body: d.body }, NOW, sender)).toMatchObject({ ok: false });
    expect(await sendDraft(me, l.id, d.id, { to: d.toEmail, subject: d.subject, body: d.body }, NOW, sender)).toMatchObject({ ok: true });
    f = (await loaStore().file(l.id))!;
    expect(f.title!.items.filter((x) => x.payoff).every((x) => x.status === "payoff_requested")).toBe(true);
    expect(f.checks.payoffs?.done).toBe(true);
    // The other drafts.
    expect(await makeDraft(me, l.id, "escrow_fees")).toMatchObject({ ok: true });
    expect(await makeDraft(me, l.id, "payoffs")).toMatchObject({ ok: false });
  });

  it("splits the conditional approval by who owes what, and the borrower's items go on the document checklist", async () => {
    const l = await loan();
    const r = await readIntoFile(me, l.id, "conditional_approval", { text: "approval text, long enough" }, NOW, fake);
    expect(r).toMatchObject({ ok: true, summary: expect.stringMatching(/3 conditions \(1 from the borrower, 1 from third parties, 1 for you/) });
    const j = (await journeyStore().get(l.id))!;
    expect(j.docs.map((x) => x.name)).toContain("Most recent pay stub");
    // Read twice: nothing doubles.
    await readIntoFile(me, l.id, "conditional_approval", { text: "approval text, long enough" }, NOW, fake);
    const f = (await loaStore().file(l.id))!;
    expect(f.conditions).toHaveLength(3);
    expect(f.deadlines.find((d) => d.key === "approval_expires")?.date).toBe("2026-12-31");
    for (const c of f.conditions) await setCondition(me, l.id, c.id, "cleared", NOW);
    expect((await loaStore().file(l.id))!.checks.conditions?.done).toBe(true);
  });

  it("reads escrow fees, and lists what needs the loan officer", async () => {
    const l = await loan();
    await readIntoFile(me, l.id, "purchase_agreement", { text: "psa text here, long enough" }, NOW, fake);
    let tasks = await loaTasks(me, NOW);
    // D71: the LOA drafts these on its own now (LO-Auth by default), so they wait for a tap instead of a reminder to draft them.
    expect(tasks.map((t) => t.title)).toEqual(expect.arrayContaining(["Review and send: Escrow fee estimate: 12 Elm St, Kirkland, WA 98033", "Review and send: Please open title: 12 Elm St, Kirkland, WA 98033", "Earnest money due"]));
    expect(tasks.find((t) => t.title === "Earnest money due")?.urgent).toBe(true);
    await readIntoFile(me, l.id, "escrow_fees", { text: "fees text, long enough" }, NOW, fake);
    expect((await loaStore().file(l.id))!.escrowFees).toMatchObject({ total: 2150 });
    tasks = await loaTasks(me, NOW);
    expect(tasks.map((t) => t.title)).not.toContain("Ask escrow for their fees");
    expect(tasks.map((t) => t.title)).not.toContain("Review and send: Escrow fee estimate: 12 Elm St, Kirkland, WA 98033");
  });

  it("keeps lenders' overlays and answers with the agency guides, the overlays and the file", async () => {
    const l = await loan();
    await readIntoFile(me, l.id, "purchase_agreement", { text: "psa text here, long enough" }, NOW, fake);
    expect(await addOverlay(me, { lender: "UWM", title: "", text: "short" }, NOW, async () => "x")).toMatchObject({ ok: false });
    const o = await addOverlay(me, { lender: "UWM", title: "Conventional", text: "UWM conventional overlay matrix ".repeat(4) }, NOW, async () => "Conventional: 2-4 units need 680 minimum credit score.");
    expect(o).toMatchObject({ ok: true, overlay: { lender: "UWM" } });
    let seen = { system: "", last: "" };
    const model: AskModel = async (system, messages) => {
      seen = { system, last: messages.at(-1)!.content };
      return { text: "Yes, with 5% of their own funds (Selling Guide B3-4.3-04). UWM wants a 680 score on 2-4 units.", sources: [{ title: "B3-4.3-04", url: "https://selling-guide.fanniemae.com/sel/b3-4.3-04/personal-gifts" }, { title: "Blog", url: "https://example.com/post" }] };
    };
    const r = await askLoa(me, { question: "Can they use a gift on a 2-unit? SSN 123-45-6789", loanId: l.id }, NOW, model);
    expect(r).toMatchObject({ ok: true, answer: { sources: [{ title: "B3-4.3-04" }] } });
    expect(seen.system).toMatch(/cite the section/);
    expect(seen.last).toMatch(/<data-d[0-9a-f]+ kind="lender_overlays" lender="UWM">Conventional: 2-4 units need 680/);
    expect(seen.last).toMatch(/kind="loan_file">.*closing 2026-12-18/);
    expect(seen.last).not.toContain("123-45-6789");
    expect(GUIDE_DOMAINS).toContain("selling-guide.fanniemae.com");
    expect(await askLoa(me, { question: "hi" }, NOW, null)).toMatchObject({ ok: false });
  });
});
