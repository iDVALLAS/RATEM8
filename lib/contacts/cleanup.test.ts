import { describe, expect, it } from "vitest";
import { CLEANUP_TAGS, findSuggestions, fixFor, foldKey, isoWeek, nearSpelling, pairKey, undoChange, type Suggestion } from "./cleanup";
import { POSSIBLE_DUPLICATE_TAG } from "./tags";
import type { Contact } from "./store";

/** D88: the eight rules, what each fix changes and how it's undone (pure). */

let seq = 0;
const p = (over: Partial<Contact> = {}): Contact => {
  seq++;
  return {
    id: `c_${String(seq).padStart(5, "0")}`,
    ownerUserId: "lo1",
    kind: "contact",
    provenance: "personal",
    locked: false,
    source: "import: book.csv",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    firstName: `F${seq}`,
    lastName: `L${seq}`,
    email: `p${seq}@example.com`,
    phone: `+1206555${String(1000 + seq).slice(-4)}`,
    phone2: null,
    street: null,
    city: null,
    state: "WA",
    zip: null,
    relationship: "past_client",
    tags: [],
    notes: null,
    loan: null,
    agent: null,
    ...over,
  };
};
const only = (s: Suggestion[], id: string) => s.filter((x) => x.id === id);
const rule = (s: Suggestion[], r: Suggestion["rule"]) => s.filter((x) => x.rule === r);

describe("rule 1: tags that mean the same thing (D88)", () => {
  it("folds capitals, spacing, punctuation and a trailing plural, into the most-used spelling", () => {
    expect(foldKey("V.I.P")).toBe("vip");
    expect(foldKey(" VIPs ")).toBe("vip");
    expect(foldKey("Past-Clients")).toBe("pastclient");
    expect(foldKey("Class")).toBe("class");
    const book = [p({ tags: ["VIP"] }), p({ tags: ["VIP"] }), p({ tags: ["VIP"] }), p({ tags: ["vip"] }), p({ tags: ["V.I.P", "Golf"] }), p({ tags: ["VIPs"] })];
    const [s] = rule(findSuggestions({ contacts: book }), "tags");
    expect(s.target).toBe("VIP");
    expect(s.variants!.map((v) => v.label).sort()).toEqual(["V.I.P", "VIPs", "vip"]);
    expect(s.count).toBe(3);
    expect(s.people).toEqual([book[3].id, book[4].id, book[5].id]);
  });

  it("joins near spellings of 5+ letters, never with digits, short words or protected words", () => {
    expect(nearSpelling("refinance", "refinanse")).toBe(true);
    expect(nearSpelling("openhouse", "openhouses")).toBe(true);
    expect(nearSpelling("lead", "load")).toBe(false);
    expect(nearSpelling("pastclient2021", "pastclient2022")).toBe(false);
    const book = [p({ tags: ["Refinance"] }), p({ tags: ["Refinance"] }), p({ tags: ["Refinanse"] }), p({ tags: ["Past clients 2021"] }), p({ tags: ["Past clients 2022"] }), p({ tags: ["Lead"] }), p({ tags: ["Load"] }), p({ tags: ["Seniors"] }), p({ tags: ["senior"] }), p({ tags: ["lead:zillow"] }), p({ tags: ["lead:Zillow"] })];
    const tags = rule(findSuggestions({ contacts: book }), "tags");
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ target: "Refinance", variants: [{ label: "Refinanse", count: 1, where: "tag" }] });
  });

  it("leaves a book whose tags are each written one way alone", () => {
    expect(rule(findSuggestions({ contacts: [p({ tags: ["VIP", "Golf"] }), p({ tags: ["VIP"] })] }), "tags")).toEqual([]);
  });

  it("on a tie keeps the spelling with capitals", () => {
    expect(rule(findSuggestions({ contacts: [p({ tags: ["realtor"] }), p({ tags: ["Realtor"] })] }), "tags")[0].target).toBe("Realtor");
  });
});

describe("rule 2: one lead source written different ways (D88)", () => {
  it("suggests the known spelling for one sourceKey, and the lead:<key> tag", () => {
    const book = [p({ leadSource: "Zillow.com" }), p({ leadSource: "Zillow.com" }), p({ leadSource: "zillow leads" }), p({ leadSource: "Zillow" }), p({ tags: ["lead:Zillow"] })];
    const [s] = rule(findSuggestions({ contacts: book }), "sources");
    expect(s).toMatchObject({ id: "sources:zillow", target: "Zillow", targetTag: "lead:zillow" });
    expect(s.variants!.map((v) => `${v.where}:${v.label}`).sort()).toEqual(["field:Zillow.com", "field:zillow leads", "tag:lead:Zillow"]);
    expect(s.people).toEqual([book[0].id, book[1].id, book[2].id, book[4].id]);
  });

  it("leaves one spelling, different sphere words and agents' values alone", () => {
    const book = [p({ leadSource: "zillow.com" }), p({ leadSource: "zillow.com" }), p({ leadSource: "Referral" }), p({ leadSource: "Past client" }), p({ leadSource: "SOI" }), p({ kind: "agent", relationship: "agent", leadSource: "Bankrate.com" }), p({ leadSource: "Bankrate" })];
    expect(rule(findSuggestions({ contacts: book }), "sources")).toEqual([]);
    // Two spellings of one sphere word do fold.
    const [s] = rule(findSuggestions({ contacts: [p({ leadSource: "Referral" }), p({ leadSource: "Referral" }), p({ leadSource: "referrals" })] }), "sources");
    expect(s).toMatchObject({ target: "Referral", variants: [{ label: "referrals" }] });
  });
});

describe("rule 3: possible duplicate people (D88)", () => {
  it("pairs a shared email, and a shared phone with the same first name", () => {
    const a = p({ firstName: "Ann", email: "ann@x.com" });
    const b = p({ firstName: "Annie", email: "ANN@x.com", phone: null });
    const c = p({ firstName: "Rob", phone: "+12065550101" });
    const d = p({ firstName: "Robert", phone: "+12065550101" });
    const [s] = only(findSuggestions({ contacts: [a, b, c, d] }), "duplicates");
    expect(s.pairs).toEqual([{ a: a.id, b: b.id, by: "email" }, { a: c.id, b: d.id, by: "phone" }]);
    expect(s.undoable).toBe(false);
  });

  it("pairs a Possible duplicate tag with a different first name; leaves spouses, kept-separate pairs, one import's rows, other kinds and shared lines alone", () => {
    const gia = p({ firstName: "Gia", phone: "+13605552101" });
    const jo = p({ firstName: "Jo", phone: "+13605552101" });
    const kim = p({ firstName: "Kim", phone: "+13605552104" });
    const kay = p({ firstName: "Kay", phone: "+13605552104", tags: [POSSIBLE_DUPLICATE_TAG] });
    const x1 = p({ firstName: "Lu", email: "lu@x.com", importId: "imp_1" });
    const x2 = p({ firstName: "Lu", email: "lu@x.com", importId: "imp_1" });
    const s1 = p({ firstName: "Sam", email: "sam@x.com" });
    const s2 = p({ firstName: "Sam", email: "sam@x.com" });
    const agent = p({ kind: "agent", relationship: "agent", firstName: "Gia", phone: "+13605552101" });
    const office = Array.from({ length: 8 }, () => p({ firstName: "Pat", phone: "+12065559999", kind: "agent", relationship: "agent" }));
    const [s] = only(findSuggestions({ contacts: [gia, jo, kim, kay, x1, x2, s1, s2, agent, ...office], separate: [pairKey(s2.id, s1.id)] }), "duplicates");
    expect(s.pairs).toEqual([{ a: kim.id, b: kay.id, by: "flagged" }]);
  });
});

describe("rule 4: missing basics (D88)", () => {
  it("finds no name, a state the ZIP gives, no state and a lead with no source", () => {
    const noName = p({ firstName: "", lastName: "" });
    const zip = p({ state: null, zip: "98101" });
    const none = p({ state: null, zip: null });
    const lead = p({ relationship: "lead" });
    const s = findSuggestions({ contacts: [noName, zip, none, lead] });
    expect(only(s, "basics:no_name")[0]).toMatchObject({ people: [noName.id], target: CLEANUP_TAGS.noName, fix: "tag" });
    expect(only(s, "basics:state_zip")[0]).toMatchObject({ people: [zip.id], fix: "fill_state" });
    expect(only(s, "basics:no_state")[0]).toMatchObject({ people: [none.id], target: CLEANUP_TAGS.noState });
    expect(only(s, "basics:lead_none")[0]).toMatchObject({ people: [lead.id], target: CLEANUP_TAGS.noSource });
  });

  it("leaves people already tagged, delivered leads, vendor files (rule 8) and leads with a source alone", () => {
    const s = findSuggestions({
      contacts: [
        p({ firstName: "", lastName: "", tags: ["needs a name"] }),
        p({ state: null, tags: [CLEANUP_TAGS.noState] }),
        p({ relationship: "lead", source: "lead: Zillow", tags: ["lead:zillow"] }),
        p({ relationship: "lead", provenance: "lead_vendor" }),
        p({ relationship: "lead", leadSource: "Open house" }),
        p({ relationship: "lead", tags: ["lead:bankrate"] }),
      ],
    });
    expect(rule(s, "basics")).toEqual([]);
  });
});

describe("rule 5: phones or emails that won't work (D88)", () => {
  it("finds values kept as written, and stored values the checks reject", () => {
    const a = p({ phone2: null, notes: "Mobile (as written): 555-123-467" });
    const b = p({ email: null, notes: "Email (as written): ann@gmail" });
    const c = p({ phone: "2065551234" });
    const [s] = only(findSuggestions({ contacts: [a, b, c] }), "reach");
    expect(s.people).toEqual([a.id, b.id, c.id]);
    expect(s.reasons![a.id]).toEqual({ code: "phone", raw: "555-123-467" });
    expect(s.reasons![b.id]).toEqual({ code: "email", raw: "ann@gmail" });
  });

  it("leaves dates, ZIPs, fixed fields and already-tagged people alone", () => {
    const s = findSuggestions({
      contacts: [
        p({ notes: "Close Date (as written): 13/45/2020\nZIP (as written): 981" }),
        p({ notes: "Email (as written): ann@gmail" }), // they have an email now
        p({ phone2: "+12065550199", notes: "Mobile (as written): 555-123-467" }), // both phones filled since
        p({ phone2: null, notes: "Mobile (as written): 555-123-467", tags: [CLEANUP_TAGS.reach] }),
      ],
    });
    expect(rule(s, "reach")).toEqual([]);
  });
});

describe("rule 6: past clients still labeled as leads (D88)", () => {
  it("finds a lead with a closed date or a closed loan, not a dead loan or a past client", () => {
    const a = p({ relationship: "lead", loan: { closedOn: "2024-05-01", amount: null, noteRate: null } });
    const b = p({ relationship: "lead" });
    const c = p({ relationship: "lead" });
    const d = p({ relationship: "past_client", loan: { closedOn: "2024-05-01", amount: null, noteRate: null } });
    const loans = [{ contactId: b.id, closed: true, dead: false }, { contactId: c.id, closed: true, dead: true }];
    const [s] = only(findSuggestions({ contacts: [a, b, c, d], loans }), "past_clients");
    expect(s.people).toEqual([a.id, b.id]);
  });
});

describe("rule 7: agents filed as clients (D88)", () => {
  it("finds agent words in tags, notes or the file, a brokerage, or an agent's email", () => {
    const tag = p({ relationship: "sphere", tags: ["Realtor"] });
    const note = p({ relationship: "other", notes: "Company: Keller Williams Realty" });
    const file = p({ relationship: "other", source: "import: Realtors 2025.csv" });
    const agent = p({ kind: "agent", relationship: "agent", email: "kay@kw.com", firstName: "Kay" });
    const match = p({ relationship: "lead", email: "kay@kw.com", firstName: "Kay" });
    const [s] = only(findSuggestions({ contacts: [tag, note, file, agent, match] }), "agents");
    expect(s.people).toEqual([tag.id, note.id, file.id, match.id]);
    expect(s.reasons![tag.id].code).toBe("tag");
    expect(s.reasons![note.id]).toEqual({ code: "note", raw: "Company: Keller Williams Realty" });
    expect(s.reasons![match.id].code).toBe("agent_match");
  });

  it("never suggests a past client, someone with a loan, or words that don't say agent", () => {
    const s = findSuggestions({
      contacts: [
        p({ relationship: "past_client", tags: ["Realtor"] }),
        p({ relationship: "lead", tags: ["Realtor"], loan: { closedOn: "2023-01-01", amount: null, noteRate: null } }),
        p({ relationship: "lead", leadSource: "Realtor referral", notes: "Title: Nurse" }),
        p({ relationship: "lead", source: "import: Agent referrals.csv" }),
      ],
      loans: [],
    });
    expect(rule(s, "agents")).toEqual([]);
  });
});

describe("rule 8: imported leads with no source (D88)", () => {
  it("groups a vendor file's people with no lead source, by import, with the file's name", () => {
    const a = p({ provenance: "lead_vendor", relationship: "lead", importId: "imp_a" });
    const b = p({ provenance: "lead_vendor", relationship: "lead", importId: "imp_a" });
    const c = p({ provenance: "lead_vendor", relationship: "lead", importId: "imp_b" });
    const s = rule(findSuggestions({ contacts: [a, b, c, p({ provenance: "lead_vendor", leadSource: "Zillow" }), p({ provenance: "lead_vendor", source: "lead: Bankrate" })], imports: [{ id: "imp_a", files: ["leads-nov.csv"] }] }), "lead_no_source");
    expect(s.map((x) => [x.id, x.people.length, x.importLabel])).toEqual([["lead_no_source:imp_a", 2, "leads-nov.csv"], ["lead_no_source:imp_b", 1, null]]);
    expect(s[0].needsInput).toBe("leadSource");
  });
});

describe("fixes and undo (D88)", () => {
  it("a tag merge changes only the variant spellings, and undo takes back only what it did", () => {
    const book = [p({ tags: ["VIP"] }), p({ tags: ["VIP"] }), p({ tags: ["vip", "Golf"] })];
    const [s] = rule(findSuggestions({ contacts: book }), "tags");
    const r = fixFor(s, book[2], {}, "2026-11-23T00:00:00.000Z")!;
    expect(r.next.tags).toEqual(["VIP", "Golf"]);
    expect(r.change).toEqual({ id: book[2].id, before: {}, after: {}, addedTags: ["VIP"], droppedTags: ["vip"] });
    expect(fixFor(s, book[0])).toBeNull();
    // A tag added since stays; the fix's own change goes back.
    const later = { ...r.next, tags: [...r.next.tags, "Boat"] };
    expect(undoChange(later, r.change, "2026-11-24T00:00:00.000Z").next.tags).toEqual(["Golf", "Boat", "vip"]);
  });

  it("a field goes back only while it still holds the fix's value; a move to Agents goes back whole", () => {
    const lead = p({ relationship: "lead", loan: { closedOn: "2024-05-01", amount: null, noteRate: null } });
    const [past] = only(findSuggestions({ contacts: [lead] }), "past_clients");
    const r = fixFor(past, lead)!;
    expect(r.change.after).toEqual({ relationship: "past_client" });
    expect(undoChange(r.next, r.change, "x").next.relationship).toBe("lead");
    expect(undoChange({ ...r.next, relationship: "sphere" }, r.change, "x")).toMatchObject({ restored: 0, kept: 1 });
    const realtor = p({ relationship: "sphere", tags: ["Realtor"], notes: "Company: Keller Williams Realty" });
    const [ag] = only(findSuggestions({ contacts: [realtor] }), "agents");
    const m = fixFor(ag, realtor)!;
    expect(m.next).toMatchObject({ kind: "agent", relationship: "agent", agent: { brokerage: "Keller Williams Realty" } });
    expect(undoChange(m.next, m.change, "x").next).toMatchObject({ kind: "contact", relationship: "sphere", agent: null });
    // Edited since (relationship changed): nothing of the move goes back.
    expect(undoChange({ ...m.next, relationship: "other" }, m.change, "x").next.kind).toBe("agent");
  });

  it("a lead-source fix needs a typed source and never overwrites one", () => {
    const a = p({ provenance: "lead_vendor", importId: "imp_a" });
    const [s] = rule(findSuggestions({ contacts: [a] }), "lead_no_source");
    expect(fixFor(s, a, { leadSource: "   " })).toBeNull();
    expect(fixFor(s, a, { leadSource: "  Bankrate  " })!.next.leadSource).toBe("Bankrate");
    expect(fixFor(s, { ...a, leadSource: "Zillow" }, { leadSource: "Bankrate" })).toBeNull();
  });
});

describe("fingerprints and weeks (D88)", () => {
  it("stays the same for the same records and changes when one does", () => {
    const book = [p({ tags: ["VIP"] }), p({ tags: ["vip"] })];
    const a = rule(findSuggestions({ contacts: book }), "tags")[0];
    expect(rule(findSuggestions({ contacts: book.map((c) => ({ ...c, updatedAt: "2026-02-02T00:00:00.000Z", notes: "x" })) }), "tags")[0].fingerprint).toBe(a.fingerprint);
    expect(rule(findSuggestions({ contacts: [...book, p({ tags: ["VIPs"] })] }), "tags")[0].fingerprint).not.toBe(a.fingerprint);
    expect(rule(findSuggestions({ contacts: [book[0], { ...book[1], tags: ["V.I.P"] }] }), "tags")[0].fingerprint).not.toBe(a.fingerprint);
  });

  it("names ISO weeks on the Pacific calendar", () => {
    expect(isoWeek(new Date("2026-11-23T18:00:00Z"))).toBe("2026-W48");
    expect(isoWeek(new Date("2026-11-30T07:00:00Z"))).toBe("2026-W48"); // still Sunday night in Pacific
    expect(isoWeek(new Date("2026-11-30T09:00:00Z"))).toBe("2026-W49");
    expect(isoWeek(new Date("2027-01-01T20:00:00Z"))).toBe("2026-W53");
  });
});
