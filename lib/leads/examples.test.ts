import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { inflateRawSync } from "node:zlib";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryContactStore, setContactStoreForTests, type ConsentEntry, type Contact } from "@/lib/contacts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryConciergeStore, setConciergeStoreForTests } from "@/lib/concierge/store";
import { MemoryPipelineStore, setPipelineStoreForTests } from "@/lib/pipeline/store";
import { MemoryExpenseStore, setExpenseStoreForTests } from "@/lib/expenses/store";
import { snapshot } from "@/lib/agents/business";
import { buildExport } from "@/lib/export/service";
import { LEADS } from "@/lib/content/cc-pages";
import { EXAMPLES, exampleRow } from "./examples";
import { connectedSourceLabels, hasRealLeads, isRealLead, leadNamedYou, leadPageMode, leadSourceLabel, recentLeads, share, sourceCounts, type LeadLike } from "./mode";
import { AskBar, ExamplePlan, ExampleRecent, ExampleScorecard, RealRecent, RealScorecard } from "@/app/mlo/leads/LeadSections";

/** D82: example mode on Lead sources until real leads arrive. */

const NOW = new Date("2026-11-22T18:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const person = (over: Partial<LeadLike> = {}): LeadLike => ({ id: "c_1", kind: "contact", source: "added by hand", provenance: "personal", leadSource: null, createdAt: ago(1), ...over });
const delivered = (id: string, vendor: string, days = 1) => person({ id, source: `lead: ${vendor}`, provenance: "lead_vendor", createdAt: ago(days) });
const consent = (contactId: string, actor: string, over: Partial<ConsentEntry> = {}): ConsentEntry => ({ contactId, channel: "text", purpose: "marketing", granted: true, evidence: "web_form", proof: "form", at: ago(1), actor, ...over });

describe("which sections show examples (D82)", () => {
  it("an empty book is all example, with Add a lead source on top", () => {
    const m = leadPageMode({ contacts: [] });
    expect(m).toEqual({ hasRealLeads: false, ask: "example", scorecard: "example", plan: "example", recent: "example", addCard: "top", order: ["add", "ask", "scorecard", "plan", "recent"] });
  });

  it("the first delivered lead turns the scorecard and Recent leads real and moves the add card to section 4, compact; the plan stays an example", () => {
    const m = leadPageMode({ contacts: [person({ id: "c_a" }), delivered("c_b", "Zillow")] });
    expect(m).toEqual({ hasRealLeads: true, ask: "real", scorecard: "real", plan: "example", recent: "real", addCard: "compact", order: ["ask", "scorecard", "plan", "add", "recent"] });
    expect(m.order.indexOf("add")).toBe(3);
  });

  it("the plan card switches only on a saved plan (D86), with or without leads", () => {
    expect(leadPageMode({ contacts: [], savedPlan: true }).plan).toBe("real");
    expect(leadPageMode({ contacts: [], savedPlan: true }).scorecard).toBe("example");
    expect(leadPageMode({ contacts: [delivered("c_b", "Zillow")], savedPlan: false }).plan).toBe("example");
  });

  it("a lead event (D83) counts as a real lead on its own", () => {
    expect(hasRealLeads({ contacts: [], leadEvents: 0 })).toBe(false);
    expect(leadPageMode({ contacts: [], leadEvents: 1 })).toMatchObject({ scorecard: "real", recent: "real", addCard: "compact" });
  });

  it("imported vendor leads count (decision 4); past-client exports with a Lead source column, hand-added people and agents don't", () => {
    expect(isRealLead(person({ source: "import: zillow.csv", provenance: "lead_vendor", leadSource: "Zillow" }))).toBe(true);
    expect(isRealLead(person({ source: "import: vendor.csv", provenance: "lead_vendor" }))).toBe(true);
    expect(isRealLead(person({ source: "import: book.csv", provenance: "personal" }))).toBe(false);
    // "Past clients export" with a Lead Source column ("Referral", "Zillow" on a loan funded in 2022): not new leads.
    expect(isRealLead(person({ source: "import: Past clients.xlsx", provenance: "personal", leadSource: "Zillow" }))).toBe(false);
    expect(isRealLead(person({ source: "import: crm.csv", provenance: "unknown", leadSource: "Referral" }))).toBe(false);
    expect(isRealLead(person({ source: "added by hand", provenance: "lead_vendor", leadSource: "Zillow" }))).toBe(false);
    expect(isRealLead(person({ kind: "agent", source: "lead: Zillow" }))).toBe(false);
    expect(leadPageMode({ contacts: [person({ source: "import: book.csv", leadSource: "Zillow" })] }).scorecard).toBe("example");
    expect(leadPageMode({ contacts: [person({ source: "import: z.csv", provenance: "lead_vendor", leadSource: "Zillow" })] }).scorecard).toBe("real");
  });

  it("assistants see the page as before: the add card and their own Recent leads, no spend and no examples", () => {
    for (const contacts of [[], [delivered("c_b", "Zillow")]]) {
      expect(leadPageMode({ contacts, assistant: true })).toMatchObject({ ask: "off", scorecard: "off", plan: "off", recent: "real", addCard: "top", order: ["add", "recent"] });
    }
  });

  it("names each lead's source, newest leads first", () => {
    expect(leadSourceLabel(delivered("c_1", "LendingTree"), "Lead vendor file")).toBe("LendingTree");
    expect(leadSourceLabel(person({ source: "import: v.csv", provenance: "lead_vendor", leadSource: " Bankrate " }), "Lead vendor file")).toBe("Bankrate");
    expect(leadSourceLabel(person({ source: "import: v.csv", provenance: "lead_vendor" }), "Lead vendor file")).toBe("Lead vendor file");
    const r = recentLeads([delivered("c_old", "Zillow", 9), person({ id: "c_x" }), delivered("c_new", "Zillow", 1), person({ id: "c_i", source: "import: z.csv", provenance: "lead_vendor", leadSource: "Zillow", createdAt: ago(5) })]);
    expect(r.map((c) => c.id)).toEqual(["c_new", "c_i", "c_old"]);
    expect(recentLeads(Array.from({ length: 40 }, (_, i) => delivered(`c_${i}`, "Zillow", i)))).toHaveLength(30);
  });

  it("the real scorecard counts the last 90 days by source, and leads you can call from the delivered form only", () => {
    const contacts = [delivered("c_1", "Zillow"), delivered("c_2", "zillow", 10), delivered("c_3", "LendingTree"), delivered("c_4", "Zillow", 120), person({ id: "c_5" }), person({ id: "c_6", source: "import: v.csv", provenance: "lead_vendor", leadSource: "Bankrate" })];
    const entries = [
      consent("c_1", "lead:Zillow"),
      consent("c_3", "lo@x.com", { evidence: "written" }), // a later yes from the loan officer isn't the form naming them
      consent("c_6", "lo@x.com", { evidence: "attested" }), // an import's attested yes: false (decision 4)
      consent("c_2", "lead:Zillow", { mergedFrom: "c_old" }), // history from a merged record
      consent("c_2", "lead:Zillow", { granted: false, evidence: "revoked" }),
    ];
    expect(sourceCounts(contacts, entries, NOW, "Lead vendor file")).toEqual([
      { source: "Zillow", leads: 2, canCall: 1 },
      { source: "Bankrate", leads: 1, canCall: 0 },
      { source: "LendingTree", leads: 1, canCall: 0 },
    ]);
    expect(leadNamedYou("c_1", [consent("c_1", "lead:Zillow", { channel: "email" })])).toBe(false);
    expect(share(1, 2)).toBe(50);
    expect(share(0, 0)).toBe(0);
  });

  it("the add card's chips are the lead connections, not the loan system or the dialer", () => {
    expect(connectedSourceLabels(["Zillow", "ARIVE", "Dialer", "zillow", " LendingTree ", "Loan system", ""], ["Loan system", "Dialer", "ARIVE"])).toEqual(["Zillow", "LendingTree"]);
  });
});

describe("the example fixture (D82)", () => {
  it("holds the mockup's sample rows and works out the mockup's numbers", () => {
    expect(EXAMPLES.sources.map((s) => s.name)).toEqual(["Past clients & sphere", "Your web form", "Zillow", "LendingTree", "Bankrate"]);
    expect(EXAMPLES.sources.map((s) => exampleRow(s))).toEqual([
      { perLead: 7, canCallShare: 100, perLoan: 60, perCallable: 7 },
      { perLead: 30, canCallShare: 100, perLoan: 600, perCallable: 30 },
      { perLead: 90, canCallShare: 100, perLoan: 1800, perCallable: 90 },
      { perLead: 30, canCallShare: 20, perLoan: 2700, perCallable: 150 },
      { perLead: 60, canCallShare: 40, perLoan: null, perCallable: 150 },
    ]);
    expect(EXAMPLES.sources.find((s) => s.name === "LendingTree")!.note).toBe(`$${exampleRow(EXAMPLES.sources[3]).perCallable} per lead you can call`);
    expect(EXAMPLES.plan.split.reduce((n, x) => n + x.dollars, 0)).toBe(EXAMPLES.plan.monthly);
    expect(EXAMPLES.recent.map((r) => r.name)).toEqual(["Maria Lopez", "Dana Nguyen", "Sam Patel"]);
  });

  it("can't be changed at run time", () => {
    expect(Object.isFrozen(EXAMPLES)).toBe(true);
    expect(Object.isFrozen(EXAMPLES.sources[0])).toBe(true);
    expect(() => (EXAMPLES.sources as unknown as unknown[]).push({})).toThrow();
  });

  it("has no rates and nothing the copy rules ban", () => {
    const all = JSON.stringify(EXAMPLES) + JSON.stringify({ ...LEADS, rowTipLabel: null, plan: null, recent: null, add: null });
    expect(all).not.toMatch(/\d+(\.\d+)?\s*%\s*(APR|rate|interest)|\bAPR\b|interest rate/i);
    // Built in pieces: check:copy scans test files too.
    const banned = ["guaran" + "teed", "best " + "rates", "lowest " + "rates", "commis" + "sion", "referral " + "fee", "act " + "now", "hur" + "ry"];
    for (const b of banned) expect(all.toLowerCase()).not.toContain(b);
  });
});

describe("example sections (D82)", () => {
  const exampleNames = ["Maria Lopez", "Dana Nguyen", "Sam Patel"];

  it("every example section shows the EXAMPLE label and its line, and the plan's line fits once leads exist", () => {
    expect(LEADS.example.line).toBe("These are example numbers. Yours appear here after your first lead arrives.");
    for (const el of [createElement(ExampleScorecard), createElement(ExamplePlan, { afterLeads: false }), createElement(ExampleRecent)]) {
      const html = renderToStaticMarkup(el);
      expect(html).toContain(`<span class="cc-ex">${LEADS.example.label}</span>`);
      expect(html).toContain(LEADS.example.line);
      expect(html).toContain('data-example="true"');
    }
    const later = renderToStaticMarkup(createElement(ExamplePlan, { afterLeads: true }));
    expect(later).toContain(LEADS.example.planLine);
    expect(later).not.toContain(LEADS.example.line);
  });

  it("example rows never link into contacts, and every button is disabled (no pretend actions)", () => {
    for (const el of [createElement(ExampleScorecard), createElement(ExamplePlan, { afterLeads: false }), createElement(ExampleRecent), createElement(AskBar)]) {
      const html = renderToStaticMarkup(el);
      expect(html).not.toContain("/mlo/contacts");
      expect(html).not.toMatch(/<form/);
      const buttons = html.match(/<button[^>]*>/g) ?? [];
      const realButtons = buttons.filter((b) => !b.includes("cc-tip-btn")); // the permission i explains; it does nothing else
      for (const b of realButtons) expect(b, b).toContain('disabled=""');
    }
    const recent = renderToStaticMarkup(createElement(ExampleRecent));
    for (const n of exampleNames) expect(recent).toContain(n);
    expect(recent).toContain('aria-label="Why no permission yet for Dana Nguyen"');
  });

  it("the scorecard is a table on desktop and cards on phones, with the mockup's words", () => {
    const html = renderToStaticMarkup(createElement(ExampleScorecard));
    expect(html).toContain('<table class="mlo-table cc-score__tbl">');
    expect((html.match(/class="cc-scard"/g) ?? []).length).toBe(5);
    for (const w of ["$1,800", "$2,700", "None yet", "No loans yet", "Best value", "Scale up", "Watch", "Fix permission", "Pause?", "Business Manager:", "Log spend", 'aria-pressed="true"']) expect(html).toContain(w);
  });

  it("real sections carry no example rows", () => {
    const score = renderToStaticMarkup(createElement(RealScorecard, { rows: [{ source: "Zillow", leads: 3, canCall: 1 }] }));
    const recent = renderToStaticMarkup(createElement(RealRecent, { rows: [{ id: "c_1", name: "Eve Ng", source: "Zillow", at: "Nov 22, 9:00 AM", ok: false }] }));
    for (const html of [score, recent]) {
      expect(html).toContain('data-example="false"');
      expect(html).not.toContain("cc-ex");
      expect(html).not.toContain(LEADS.example.line);
      for (const n of [...exampleNames, EXAMPLES.banner, "LendingTree", "Bankrate", "$3,600"]) expect(html).not.toContain(n);
    }
    expect(score).toContain("1 · 33%");
    expect(recent).toContain('href="/mlo/contacts/c_1"');
  });
});

/** Every source file under app/, lib/ and components/ (relative paths). */
function sources(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|js)$/.test(e)) out.push(relative(process.cwd(), p));
    }
  };
  for (const d of ["app", "lib", "components"]) walk(join(process.cwd(), d));
  return out;
}
const importsOf = (src: string) => [...src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => m[1]);

/** Reads our own zips back (local headers). */
function unzip(buf: Buffer): string {
  let p = 0;
  let out = "";
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8);
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const body = buf.subarray(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size);
    out += (method === 8 ? inflateRawSync(body) : Buffer.from(body)).toString("utf8") + "\n";
    p += 30 + nameLen + extra + size;
  }
  return out;
}

describe("example rows never leave the page (D82)", () => {
  const files = sources();
  const marks = ["Maria Lopez", "Dana Nguyen", "Sam Patel", "a third of Zillow"];

  it("only the Lead sources page imports the fixture, and nothing in lib/ imports the page's files", () => {
    const importers = files.filter((f) => importsOf(readFileSync(f, "utf8")).some((m) => /(^|\/)leads\/examples$/.test(m) || m === "./examples"));
    const allowed = new Set(["app/mlo/leads/LeadSections.tsx", "lib/leads/examples.test.ts"]);
    expect(importers.filter((f) => !allowed.has(f))).toEqual([]);
    expect(importers).toContain("app/mlo/leads/LeadSections.tsx");
    const intoPage = files.filter((f) => !f.startsWith("app/mlo/leads/") && importsOf(readFileSync(f, "utf8")).some((m) => /app\/mlo\/leads|LeadSections/.test(m)));
    expect(intoPage.filter((f) => f !== "lib/leads/examples.test.ts")).toEqual([]);
    // The switch never reads the fixture, so the Concierge (D85) can use it without the examples.
    expect(importsOf(readFileSync("lib/leads/mode.ts", "utf8"))).toEqual([]);
  });

  it("the sample names and lines exist only in the fixture", () => {
    for (const f of files) {
      if (f === "lib/leads/examples.ts" || f === "lib/leads/examples.test.ts") continue;
      const src = readFileSync(f, "utf8");
      for (const m of marks) expect(src.includes(m), `${f} contains ${m}`).toBe(false);
    }
  });

  describe("with an empty book", () => {
    const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
    let contacts: MemoryContactStore;
    beforeEach(() => {
      contacts = new MemoryContactStore();
      setContactStoreForTests(contacts);
      setTouchStoreForTests(new MemoryTouchStore());
      setAccountStoreForTests(new MemoryAccountStore());
      setConciergeStoreForTests(new MemoryConciergeStore());
      setPipelineStoreForTests(new MemoryPipelineStore());
      setExpenseStoreForTests(new MemoryExpenseStore());
    });
    afterEach(() => {
      for (const f of [setContactStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setConciergeStoreForTests, setPipelineStoreForTests, setExpenseStoreForTests]) f(null);
    });

    it("showing the examples writes nothing, and the Business Manager's snapshot and Download everything hold none of them", async () => {
      for (const el of [createElement(ExampleScorecard), createElement(ExamplePlan, { afterLeads: false }), createElement(ExampleRecent)]) renderToStaticMarkup(el);
      const all: Contact[] = (await contacts.list({})).contacts;
      expect(all).toEqual([]);
      const s = await snapshot(me, NOW);
      expect(s.sources).toEqual([]);
      const ex = await buildExport(me, NOW);
      const text = JSON.stringify(s) + unzip(ex.file);
      for (const n of [...marks, ...EXAMPLES.sources.slice(1).map((x) => x.name), "$3,600", "3600", "2700"]) expect(text.includes(n), n).toBe(false);
      expect(ex.counts.contacts).toBe(0);
    });
  });
});
