/**
 * lib/send-gate/for-contact.ts — the gate's answers for one contact, for the
 * contact page (D3). SERVER-ONLY (reads config and the user's record).
 */
import { mloById } from "@/lib/config";
import type { User } from "@/lib/accounts/store";
import type { ConsentSummary } from "@/lib/contacts/service";
import { CHANNELS, PURPOSES, type Channel, type Contact, type Purpose } from "@/lib/contacts/store";
import { decide, type GateDecision } from "./gate";

/** States a user may market loans in: their loan officer record's licenses. Staff without a record: none. */
export function licensedStatesFor(user: User): string[] {
  return mloById(user.mloId)?.licenses.map((l) => l.state) ?? [];
}

export function decisionsFor(user: User, c: Contact, consent: ConsentSummary, now = new Date()): Record<Channel, Record<Purpose, GateDecision>> {
  const out = {} as Record<Channel, Record<Purpose, GateDecision>>;
  for (const channel of CHANNELS) {
    out[channel] = {} as Record<Purpose, GateDecision>;
    for (const purpose of PURPOSES)
      out[channel][purpose] = decide({
        channel,
        purpose,
        manual: channel === "call",
        contact: { locked: c.locked, state: c.state, hasPhone: !!c.phone, hasEmail: !!c.email, relationship: c.relationship, loanClosedOn: c.loan?.closedOn ?? null },
        consent,
        licensedStates: licensedStatesFor(user),
        dnc: null, // D4 adds do-not-call scrubbing; until then marketing by phone is blocked.
        sent: { callsLast24h: 0, textsLast24h: 0, textsLast7d: 0 },
        now,
      });
  }
  return out;
}
