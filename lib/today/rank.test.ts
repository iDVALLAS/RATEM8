import { describe, expect, it } from "vitest";
import { cardsFor, daysToAnniversary, rankToday, type TodayFacts } from "./rank";
import { summarize } from "@/lib/contacts/service";
import type { Contact, ConsentEntry } from "@/lib/contacts/store";

const NOW = new Date("2026-11-18T18:00:00Z");
const contact = (over: Partial<Contact> = {}): Contact => ({
  id: "c1", ownerUserId: "lo1", kind: "contact", provenance: "personal", locked: false, source: "t", createdAt: "", updatedAt: "",
  firstName: "Ann", lastName: "Lee", email: null, phone: "+12065551234", phone2: null, street: null, city: null, state: "WA", zip: null,
  relationship: "past_client", tags: [], notes: null, loan: null, agent: null, ...over,
});
const granted = (channel: ConsentEntry["channel"]) => summarize([{ contactId: "c1", channel, purpose: "service", granted: true, evidence: "written", proof: "p", at: "2026-01-01T00:00:00Z", actor: "a" }]);
const facts = (over: Partial<TodayFacts> = {}): TodayFacts => ({ contact: contact(), consent: summarize([]), last: null, ...over });

describe("Today ranking (D5)", () => {
  it("counts days to the next anniversary", () => {
    expect(daysToAnniversary("2021-11-18", NOW)).toBe(0);
    expect(daysToAnniversary("2020-11-25", NOW)).toBe(7);
    expect(daysToAnniversary("2020-11-17", NOW)).toBe(364);
  });

  it("puts an unanswered reply first", () => {
    const cards = rankToday([
      facts({ contact: contact({ id: "a", loan: { closedOn: "2020-11-20", amount: null, noteRate: null } }) }),
      facts({ contact: contact({ id: "b", firstName: "Bo" }), last: { direction: "in", at: "2026-11-18T15:00:00Z", body: "Can we talk about a HELOC?" } }),
    ], NOW, null);
    expect(cards[0]).toMatchObject({ contactId: "b", kind: "reply", next: "reply" });
    expect(cards[1]).toMatchObject({ contactId: "a", kind: "anniversary" });
    expect(cards[1].title).toMatch(/6-year home anniversary is in 2 days/);
  });

  it("flags a rate gap only against a priced example, and says it isn't a quote", () => {
    const f = facts({ contact: contact({ loan: { closedOn: "2023-06-01", amount: 500000, noteRate: 7.25 } }) });
    expect(cardsFor(f, NOW, null).some((c) => c.kind === "rate_gap")).toBe(false);
    const card = cardsFor(f, NOW, { rate: 6.125, label: "30-year refinance", pricedAt: "2026-11-18T15:00:00Z" }).find((c) => c.kind === "rate_gap")!;
    expect(card.reason).toMatch(/1\.125 lower; a dated example, not their quote/);
    expect(cardsFor(facts({ contact: contact({ loan: { closedOn: null, amount: null, noteRate: 6.5 } }) }), NOW, { rate: 6.125, label: "x", pricedAt: "" })).toHaveLength(1); // only ask_permission, no rate gap
  });

  it("never suggests anyone on hold or who said stop, except to answer them", () => {
    expect(cardsFor(facts({ contact: contact({ locked: true }), last: { direction: "in", at: "2026-11-18T15:00:00Z", body: "hi" } }), NOW, null)).toEqual([]);
    const stopped = summarize([{ contactId: "c1", channel: "text", purpose: "service", granted: false, evidence: "revoked", proof: "STOP", at: "2026-11-01T00:00:00Z", actor: "a" }]);
    expect(cardsFor(facts({ consent: stopped, contact: contact({ loan: { closedOn: "2020-11-20", amount: null, noteRate: null } }) }), NOW, null)).toEqual([]);
  });

  it("suggests check-ins with permission after 90 quiet days, asking past clients without it, and introducing top agents", () => {
    expect(cardsFor(facts({ consent: granted("text") }), NOW, null)[0]).toMatchObject({ kind: "check_in", next: "text" });
    expect(cardsFor(facts(), NOW, null)[0]).toMatchObject({ kind: "ask_permission", next: "record_permission" });
    const agent = contact({ kind: "agent", relationship: "agent", agent: { brokerage: "Windermere", units: 24, volume: null, buyerUnits: null, listingUnits: null, avgPrice: null, topLender: "Big Bank" } });
    expect(cardsFor(facts({ contact: agent }), NOW, null)[0].reason).toMatch(/24 closings in 12 months at Windermere, usually with Big Bank/);
  });
});
