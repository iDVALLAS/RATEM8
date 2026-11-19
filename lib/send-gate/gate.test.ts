import { describe, expect, it } from "vitest";
import { decide, inWindow, type GateInput } from "./gate";
import { ruleFor } from "./rules";
import { summarize } from "@/lib/contacts/service";
import type { ConsentEntry, Channel, Evidence, Purpose } from "@/lib/contacts/store";

// Tuesday 2026-11-17, 10:00 AM Pacific = 18:00 UTC.
const TUE_10AM_PT = new Date("2026-11-17T18:00:00Z");
const consent = (...e: [Channel, Purpose, Evidence][]) =>
  summarize(e.map(([channel, purpose, evidence], i) => ({ contactId: "c", channel, purpose, granted: evidence !== "revoked", evidence, proof: "p", at: `2026-11-0${i + 1}T00:00:00Z`, actor: "a" }) as ConsentEntry));

const base = (over: Partial<GateInput> = {}): GateInput => ({
  channel: "text",
  purpose: "marketing",
  manual: false,
  contact: { locked: false, state: "WA", hasPhone: true, hasEmail: true, relationship: "past_client", ebrClosedOn: null },
  consent: consent(["text", "marketing", "web_form"]),
  licensedStates: ["WA", "OR"],
  dnc: { onList: false, checkedAt: "2026-11-10T00:00:00Z" },
  sent: { callsLast24h: 0, textsLast24h: 0, textsLast7d: 0 },
  now: TUE_10AM_PT,
  ...over,
});

describe("send gate (D3)", () => {
  it("allows a marketing text with written permission, in hours, licensed, DNC-checked", () => {
    const d = decide(base());
    expect(d.allowed).toBe(true);
    expect(d.basis).toMatch(/text permission \(web_form\)/);
  });

  it("blocks held contacts and anyone who said stop, on every phone channel", () => {
    expect(decide(base({ contact: { ...base().contact, locked: true } })).reasons[0]).toMatch(/On hold/);
    const stopped = consent(["text", "marketing", "web_form"], ["call", "service", "revoked"]);
    for (const channel of ["text", "call", "ai_call"] as const) expect(decide(base({ channel, consent: stopped, manual: channel === "call" })).allowed).toBe(false);
  });

  it("needs written permission for marketing texts and AI calls; the loan officer's word isn't enough", () => {
    expect(decide(base({ consent: consent(["text", "marketing", "attested"]) })).reasons[0]).toMatch(/written permission/);
    expect(decide(base({ channel: "ai_call", consent: consent(["ai_call", "service", "attested"]), purpose: "service" })).reasons[0]).toMatch(/proof/);
    expect(decide(base({ channel: "ai_call", consent: consent(["ai_call", "marketing", "recorded_call"]) })).reasons[0]).toMatch(/written/);
    expect(decide(base({ channel: "ai_call", purpose: "service", consent: consent(["ai_call", "service", "recorded_call"]) })).allowed).toBe(true);
    expect(decide(base({ consent: consent() })).reasons[0]).toMatch(/No permission to text/);
  });

  it("lets a loan officer hand-dial their own past clients and recent closings (do-not-call still applies), never by text or AI", () => {
    const hand = { channel: "call" as const, manual: true, consent: consent() };
    expect(decide(base({ ...hand, contact: { ...base().contact, ebrClosedOn: "2025-12-01" } })).basis).toMatch(/established business relationship \(a loan closed with your current company/);
    // Owner decision 2026-11-18: your own past clients can be hand-dialed; a lead with an old loan can't.
    expect(decide(base({ ...hand, contact: { ...base().contact, ebrClosedOn: "2023-01-01" } })).basis).toMatch(/your own past client/);
    expect(decide(base({ ...hand, contact: { ...base().contact, relationship: "lead", ebrClosedOn: "2023-01-01" } })).allowed).toBe(false);
    // The do-not-call list still applies to past clients, unless the loan closed with your current company in 18 months.
    const listed = { dnc: { onList: true, checkedAt: base().dnc!.checkedAt } };
    expect(decide(base({ ...hand, ...listed })).reasons[0]).toMatch(/past client on the list needs written permission/);
    expect(decide(base({ ...hand, ...listed, contact: { ...base().contact, ebrClosedOn: "2025-12-01" } })).allowed).toBe(true);
    expect(decide(base({ ...hand, dnc: null })).reasons[0]).toMatch(/haven't been checked/);
    expect(decide(base({ consent: consent(), contact: { ...base().contact, ebrClosedOn: "2026-10-01" } })).allowed).toBe(false); // never for texts
    expect(decide(base({ channel: "ai_call", consent: consent(), contact: { ...base().contact, ebrClosedOn: "2026-10-01" } })).allowed).toBe(false); // never for AI calls
    expect(decide(base({ ...hand, purpose: "service" })).allowed).toBe(true);
    expect(decide(base({ channel: "text", manual: true })).allowed).toBe(false);
  });

  it("blocks marketing where the loan officer isn't licensed or the state is unknown", () => {
    expect(decide(base({ contact: { ...base().contact, state: "TX" }, clearances: { tx302: true, azPhone: false, caAiVoice: false } })).reasons[0]).toMatch(/aren't licensed in TX/);
    expect(decide(base({ contact: { ...base().contact, state: null } })).reasons[0]).toMatch(/property state isn't known/);
  });

  it("fails closed on do-not-call: stale check blocks; on-list needs written permission", () => {
    expect(decide(base({ dnc: null })).reasons[0]).toMatch(/haven't been checked/);
    expect(decide(base({ dnc: { onList: false, checkedAt: "2026-09-01T00:00:00Z" } })).allowed).toBe(false);
    expect(decide(base({ dnc: { onList: true, checkedAt: "2026-11-10T00:00:00Z" } })).allowed).toBe(true);
    expect(decide(base({ channel: "call", manual: true, consent: consent(["call", "marketing", "recorded_call"]), dnc: { onList: true, checkedAt: "2026-11-10T00:00:00Z" } })).allowed).toBe(false);
  });

  it("caps marketing frequency", () => {
    expect(decide(base({ sent: { callsLast24h: 0, textsLast24h: 1, textsLast7d: 1 } })).allowed).toBe(false);
    expect(decide(base({ sent: { callsLast24h: 0, textsLast24h: 0, textsLast7d: 3 } })).allowed).toBe(false);
    expect(decide(base({ channel: "call", manual: true, consent: consent(["call", "marketing", "written"]), sent: { callsLast24h: 3, textsLast24h: 0, textsLast7d: 0 } })).allowed).toBe(false);
  });

  it("keeps quiet hours in every time zone of the state, and says when the window opens", () => {
    const early = new Date("2026-11-17T16:30:00Z"); // 8:30 AM Pacific: our default window opens at 9
    const d = decide(base({ now: early }));
    expect(d.allowed).toBe(false);
    expect(d.retryAt).toBe("2026-11-17T17:00:00.000Z");
    // Texas: 9 AM Central is 8 AM in El Paso (Mountain), so not yet.
    expect(inWindow("TX", new Date("2026-11-17T15:00:00Z"), "service")).toBe(false);
    expect(inWindow("TX", new Date("2026-11-17T16:00:00Z"), "service")).toBe(true);
    // Every state is closed at 8:30 AM local.
    expect(inWindow("CT", new Date("2026-11-17T13:30:00Z"), "service")).toBe(false);
    // Louisiana: no marketing on Sunday; Texas Sunday from noon.
    const sun = new Date("2026-11-15T17:00:00Z"); // 11 AM Central
    expect(inWindow("LA", sun, "marketing")).toBe(false);
    expect(inWindow("TX", sun, "marketing")).toBe(false);
    expect(inWindow("TX", new Date("2026-11-15T19:00:00Z"), "marketing")).toBe(true);
  });

  it("flags all-party recording states for calls only, and allows email without prior consent", () => {
    expect(decide(base({ channel: "call", manual: true, purpose: "service", consent: consent() })).recordingNotice).toBe(true);
    expect(decide(base({ channel: "call", manual: true, purpose: "service", consent: consent(), now: new Date("2026-11-17T16:30:00Z") })).recordingNotice).toBe(false);
    expect(decide(base({ now: new Date("2026-11-17T16:30:00Z") })).reasons[0]).toBe("Outside 9 AM–8 PM their local time.");
    expect(decide(base({ contact: { ...base().contact, state: "OR" } })).recordingNotice).toBe(false);
    expect(ruleFor("AZ").allPartyRecording).toBe(false);
    const email = decide(base({ channel: "email", consent: consent(), now: new Date("2026-11-17T08:00:00Z") }));
    expect(email.allowed).toBe(true);
    expect(email.basis).toMatch(/unsubscribe/);
    expect(decide(base({ channel: "email", consent: consent(["email", "marketing", "revoked"]) })).allowed).toBe(false);
  });

  it("D13: applies the strictest of every state that may apply, and keeps the uncleared states closed", () => {
    const hand = { channel: "call" as const, manual: true, consent: consent() };
    const lic = { licensedStates: ["WA", "OR", "AZ", "CA", "TX", "CT"] };
    // Connecticut: a past client without written permission can't get a sales call...
    const ct = decide(base({ ...hand, ...lic, contact: { ...base().contact, state: "CT" } }));
    expect(ct.reasons[0]).toMatch(/Connecticut needs written permission/);
    // ...unless they're an existing customer of the current company, or gave written permission.
    expect(decide(base({ ...hand, ...lic, contact: { ...base().contact, state: "CT", ebrClosedOn: "2026-06-01" } })).allowed).toBe(true);
    // A Washington property with a Connecticut area code still gets Connecticut's rule.
    expect(decide(base({ ...hand, ...lic, contact: { ...base().contact, areaState: "CT" } })).reasons[0]).toMatch(/Connecticut/);
    // Texas and Arizona stay closed for sales calls and texts until cleared; service is unaffected.
    expect(decide(base({ ...hand, ...lic, contact: { ...base().contact, state: "TX" } })).reasons[0]).toMatch(/Texas: sales calls and texts need telephone-solicitor registration/);
    expect(decide(base({ ...hand, ...lic, contact: { ...base().contact, state: "AZ" } })).reasons[0]).toMatch(/Arizona/);
    expect(decide(base({ ...hand, ...lic, purpose: "service", contact: { ...base().contact, state: "TX" } })).reasons.join(" ")).not.toMatch(/Texas/);
    // California: no AI-voice calls until cleared, even with written permission.
    expect(decide(base({ ...lic, channel: "ai_call", consent: consent(["ai_call", "marketing", "written"]), contact: { ...base().contact, state: "CA" } })).reasons[0]).toMatch(/California/);
    // Washington: a no means no sales calls for a year.
    expect(decide(base({ ...hand, ...lic, contact: { ...base().contact, declinedCallAt: "2026-06-01T00:00:00Z" } })).reasons[0]).toMatch(/Washington doesn't allow another sales call for a year/);
    expect(decide(base({ ...hand, ...lic, contact: { ...base().contact, declinedCallAt: "2025-06-01T00:00:00Z" } })).allowed).toBe(true);
  });
});
