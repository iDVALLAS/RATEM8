import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { MemoryJourneyStore, setJourneyStoreForTests } from "@/lib/journey/store";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryAutomationStore, setAutomationStoreForTests } from "@/lib/automations/store";
import { ingest, readPayload } from "@/lib/pipeline/intake";
import { newMemoryLoaStore, setLoaStoreForTests } from "@/lib/loa/store";
import { readIntoFile, type PartySender } from "@/lib/loa/service";
import type { DocCall } from "@/lib/loa/readers";
import { buildMime } from "@/lib/mail/mime";
import { LETTERS, suggest, type Facts } from "./catalog";
import { isPdf, readFields, winAnsi } from "./pdf";
import { addForm, factsFor, fillPlan, formBytes, letterDraft, makeLetter, removeForm, saveFilled, sendForms } from "./service";
import { dbBox, newMemoryFormStore, setFormStoreForTests } from "./store";

const NOW = new Date("2026-11-20T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat Lee", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const other: User = { ...me, id: "lo2", email: "lo2@x.com" };
const PSA = { price: 650000, sellerCredits: 0, earnestMoney: 15000, property: { street: "12 Elm St", city: "Kirkland", state: "WA", zip: "98033" }, mutualAcceptance: "2026-11-18", earnestMoneyDue: null, inspectionEnds: null, financingContingencyEnds: null, appraisalContingencyEnds: null, closingDate: "2026-12-18", possession: null, parties: [{ role: "escrow", company: "Lake Escrow", name: "Dana Fox", email: "dana@lake-escrow.example", phone: "" }, { role: "title", company: "First Title", name: "Rae Kim", email: "rae@firsttitle.example", phone: "" }], notes: [] };
const read: DocCall = async () => ({ json: JSON.stringify(PSA), stop: "end_turn" });

async function blankForm(fields: [string, string?][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const form = doc.getForm();
  let y = 700;
  for (const [name, value] of fields) {
    const t = form.createTextField(name);
    if (value) t.setText(value);
    t.addToPage(doc.getPage(0), { x: 60, y, width: 300, height: 20 });
    y -= 30;
  }
  form.createCheckBox("SignedAuthorization").addToPage(doc.getPage(0), { x: 60, y, width: 12, height: 12 });
  return doc.save();
}

describe("LOA forms (D66)", () => {
  let box: ReturnType<typeof dbBox>;
  beforeEach(async () => {
    process.env.CC_LINK_SECRET = "test-secret";
    setJourneyStoreForTests(new MemoryJourneyStore());
    setContactStoreForTests(new MemoryContactStore());
    setTouchStoreForTests(new MemoryTouchStore());
    setConciergeStoreForTests(new MemoryConciergeStore());
    setPipelineStoreForTests(new MemoryPipelineStore());
    setAutomationStoreForTests(new MemoryAutomationStore());
    setLoaStoreForTests(newMemoryLoaStore());
    setFormStoreForTests(newMemoryFormStore());
    const a = new MemoryAccountStore();
    await a.putUser(me);
    await a.putUser(other);
    setAccountStoreForTests(a);
    box = dbBox();
  });
  afterEach(() => {
    for (const f of [setJourneyStoreForTests, setContactStoreForTests, setTouchStoreForTests, setConciergeStoreForTests, setPipelineStoreForTests, setAutomationStoreForTests, setAccountStoreForTests, setLoaStoreForTests, setFormStoreForTests]) f(null);
  });
  const loan = async (purpose = "Purchase") => {
    const l = await ingest("lo1", readPayload({ loanNumber: "L-1", borrowerName: "Ann Lee", borrowerPhone: "(206) 823-1234", loanStatus: "Application Taken", loanPurpose: purpose, loanAmount: 520000, applicationDate: "2026-11-19" })!, "arive", NOW);
    await readIntoFile(me, l.id, "purchase_agreement", { text: "x".repeat(200) }, NOW, read);
    return l;
  };

  it("matches form fields to the file, and never suggests the borrower's own numbers", () => {
    const f = { propertyAddress: "12 Elm St, Kirkland, WA 98033", propertyCity: "Kirkland", propertyState: "WA", propertyZip: "98033", borrowerName: "Ann Lee", loanNumber: "L-1", purpose: "Purchase", today: "11/20/2026" } as Facts;
    expect(suggest("Borrower Name", f)).toMatchObject({ value: "Ann Lee", from: "borrowerName" });
    expect(suggest("Loan No.", f)).toMatchObject({ value: "L-1" });
    expect(suggest("Property Address", f).value).toBe("12 Elm St, Kirkland, WA 98033");
    for (const n of ["SSN", "Social Security Number", "Taxpayer ID number", "Date of Birth", "Account Number", "Routing No", "Borrower Signature"]) expect(suggest(n, f)).toMatchObject({ value: "", sensitive: true });
    // The borrower's own current address is the property only on a refinance.
    expect(suggest("Current Address", f).value).toBe("");
    expect(suggest("Current Address", { ...f, purpose: "Refinance" }).value).toBe("12 Elm St, Kirkland, WA 98033");
  });

  it("writes letters from the file and saves them as PDFs on letterhead", async () => {
    const l = await loan();
    const facts = (await factsFor(me, l.id, NOW))!;
    expect(facts).toMatchObject({ borrowerName: "Ann Lee", loanNumber: "L-1", propertyAddress: "12 Elm St, Kirkland, WA 98033", salesPrice: "$650,000", closingDate: "12/18/2026", escrowCompany: "Lake Escrow", titleCompany: "First Title", loEmail: "lo1@x.com" });
    for (const letter of LETTERS) expect(letter.body(facts).length).toBeGreaterThan(100);
    const d = (await letterDraft(me, l.id, "title_order", NOW))!;
    expect(d.body).toMatch(/First Title/);
    expect(d.body).toMatch(/12 Elm St/);
    expect(await makeLetter(me, l.id, "title_order", { title: d.title, body: "SSN 123-45-6789 is on this letter" }, NOW, box)).toMatchObject({ ok: false });
    const r = await makeLetter(me, l.id, "title_order", { title: d.title, body: `${d.body}\n\n“Quoted” — and a long line ${"word ".repeat(400)}` }, NOW, box);
    expect(r.ok).toBe(true);
    const got = (await formBytes(me, r.ok ? r.form.id : "", box))!;
    expect(isPdf(got.bytes)).toBe(true);
    expect((await PDFDocument.load(got.bytes)).getPageCount()).toBeGreaterThan(1);
    expect(await formBytes(other, r.ok ? r.form.id : "", box)).toBeNull();
  });

  it("keeps blank forms in the library, refuses ones that already hold a Social Security number, and fills a copy per loan", async () => {
    const l = await loan();
    expect(await addForm(me, { loanId: null, name: "x.pdf", kind: "tax", bytes: new TextEncoder().encode("not a pdf") }, NOW, box)).toMatchObject({ ok: false });
    expect(await addForm(me, { loanId: null, name: "filled.pdf", kind: "tax", bytes: await blankForm([["Taxpayer name", "Ann Lee"], ["Notes", "SSN 123-45-6789"]]) }, NOW, box)).toMatchObject({ ok: false, error: expect.stringMatching(/Social Security/) });
    const add = await addForm(me, { loanId: null, name: "4506-C.pdf", kind: "tax", bytes: await blankForm([["Taxpayer Name"], ["SSN"], ["Loan Number"], ["Property Address"], ["Requester Name"]]) }, NOW, box);
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    expect(add.form.loanId).toBeNull();
    expect(add.form.fields).toContain("SSN");
    const plan = (await fillPlan(me, add.form.id, l.id, NOW, box))!;
    const by = (n: string) => plan.fields.find((x) => x.name === n)!;
    expect(by("Taxpayer Name").value).toBe("Ann Lee");
    expect(by("SSN")).toMatchObject({ sensitive: true, value: "" });
    expect(by("Requester Name").value).toBeTruthy();
    expect(await saveFilled(me, add.form.id, l.id, { "Taxpayer Name": "Ann Lee", "Loan Number": "123-45-6789" }, NOW, box)).toMatchObject({ ok: false });
    const filled = await saveFilled(me, add.form.id, l.id, { "Taxpayer Name": "Ann Lee", "Loan Number": "L-1", SSN: "999-99-9999", "Property Address": "12 Elm St" }, NOW, box);
    expect(filled).toMatchObject({ ok: true, filled: 3 });
    if (!filled.ok) return;
    expect(filled.form.loanId).toBe(l.id);
    const out = await readFields((await formBytes(me, filled.form.id, box))!.bytes);
    expect(out.find((x) => x.name === "Taxpayer Name")?.value).toBe("Ann Lee");
    expect(out.find((x) => x.name === "SSN")?.value).toBe("");
    // Another loan officer can't use or remove it.
    expect(await fillPlan(other, add.form.id, l.id, NOW, box)).toBeNull();
    expect(await removeForm(other, add.form.id, NOW, box)).toBe(false);
    expect(await removeForm(me, add.form.id, NOW, box)).toBe(true);
  });

  it("sends picked forms as attachments and notes it on the file", async () => {
    const l = await loan();
    const d = (await letterDraft(me, l.id, "escrow_open", NOW))!;
    const r = await makeLetter(me, l.id, "escrow_open", d, NOW, box);
    if (!r.ok) throw new Error(r.error);
    const send = vi.fn<PartySender>(async () => ({ ok: true, via: "lo1@x.com" }));
    expect(await sendForms(me, l.id, { to: "dana@lake-escrow.example", subject: "Open escrow", body: "Attached.", formIds: [] }, NOW, send, box)).toMatchObject({ ok: false });
    expect(await sendForms(me, l.id, { to: "dana@lake-escrow.example", subject: "Open escrow", body: "Attached, thank you.", formIds: [r.form.id] }, NOW, send, box)).toMatchObject({ ok: true, count: 1 });
    const att = send.mock.calls[0][4]!;
    expect(att[0]).toMatchObject({ contentType: "application/pdf", filename: expect.stringMatching(/\.pdf$/) });
    expect(isPdf(att[0].content)).toBe(true);
  });

  it("builds an email with attachments, and keeps file names out of the headers' way", () => {
    const raw = buildMime({ fromName: "Pat", fromEmail: "pat@x.com", to: "dana@lake-escrow.example", subject: "Forms", text: "Hi", attachments: [{ filename: 'Title "order"\r\nBcc: x@y.z.pdf', contentType: "application/pdf", content: new Uint8Array([37, 80, 68, 70]) }] }, NOW);
    expect(raw).toMatch(/multipart\/mixed; boundary=/);
    expect(raw).toMatch(/Content-Disposition: attachment; filename="Title order Bcc: x@y.z.pdf"/);
    expect(raw).not.toMatch(/\r\nBcc:/);
    expect(winAnsi("“A” — b…")).toBe('"A" - b...');
  });
});
