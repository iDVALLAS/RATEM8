/**
 * lib/contacts/merge.ts — merging two records of one person (D77).
 * Client-safe and pure; lib/contacts/manage.ts does the writes.
 *
 * The record the loan officer keeps keeps its own values; its blanks are
 * filled from the other record. Permission never loosens:
 *  - a stop on either record stays (every channel and purpose it covers);
 *  - permission follows the phone or email it was given for, so a "yes" given
 *    for a number or address the merged record won't use doesn't carry over;
 *  - where both records hold an answer for the address that's kept, the
 *    stricter one is kept (no < your word < proof);
 *  - both records' history is kept: the other record's entries are copied in
 *    as history (`mergedFrom`), and what the merge keeps is appended as new
 *    entries. Nothing in the log is ever changed or removed.
 */
import { formatPhone } from "./normalize";
import { mergeTags, POSSIBLE_DUPLICATE_TAG } from "./tags";
import { CHANNELS, liveEntries, PURPOSES, type Channel, type ConsentEntry, type Contact, type Purpose } from "./store";

export const MAX_MERGED_TAGS = 30;
const PHONE: Channel[] = ["call", "ai_call", "text"];
const PROOF = new Set(["written", "recorded_call", "web_form", "text_reply"]);
export const nameOf = (c: Pick<Contact, "firstName" | "lastName" | "email" | "phone">) => `${c.firstName} ${c.lastName}`.trim() || c.email || formatPhone(c.phone) || "(no name)";

/** The kept record's fields after the merge (consent is the log, never here). */
export function mergeFields(keep: Contact, drop: Contact, at: string): Contact {
  const pick = <T,>(a: T | null | undefined, b: T | null | undefined): T | null => (a === null || a === undefined || a === "" ? (b ?? null) : a);
  const phone = keep.phone ?? drop.phone;
  const phone2 = keep.phone2 ?? [drop.phone, drop.phone2].find((p) => p && p !== phone) ?? null;
  const email = keep.email ?? drop.email;
  // Phone checks belong to the number: the kept number's checks.
  const phoneFrom = keep.phone ? keep : drop;
  // A phone or email the merged record can't hold isn't lost: it's noted (never used to send).
  const kept = new Set([phone, phone2, email].filter(Boolean));
  const extra = [drop.phone, drop.phone2, drop.email].filter((x): x is string => !!x && !kept.has(x)).map((x) => (x.startsWith("+") ? formatPhone(x) : x));
  const notes = [keep.notes, drop.notes && drop.notes !== keep.notes ? `From ${nameOf(drop)}'s record: ${drop.notes}` : null, extra.length ? `Also on ${nameOf(drop)}'s record: ${extra.join(", ")}` : null].filter(Boolean).join("\n").slice(-4000) || null;
  const pu = [keep.partnerUpdates, drop.partnerUpdates].filter((x): x is NonNullable<Contact["partnerUpdates"]> => !!x);
  // The client's say-so for agent updates: a "no" on either record wins.
  const partnerUpdates = pu.find((x) => !x.allowed) ?? keep.partnerUpdates ?? drop.partnerUpdates ?? null;
  const tags = mergeTags(keep.tags, drop.tags).filter((t) => t !== POSSIBLE_DUPLICATE_TAG).slice(0, MAX_MERGED_TAGS);
  return {
    ...keep,
    firstName: keep.firstName || drop.firstName,
    lastName: keep.lastName || drop.lastName,
    phone,
    phone2: phone2 === phone ? null : phone2,
    email,
    street: pick(keep.street, drop.street),
    city: pick(keep.city, drop.city),
    state: pick(keep.state, drop.state),
    zip: pick(keep.zip, drop.zip),
    leadSource: pick(keep.leadSource, drop.leadSource),
    referredBy: pick(keep.referredBy, drop.referredBy),
    loan: keep.loan ?? drop.loan ?? null,
    agent: keep.agent ?? drop.agent ?? null,
    // D93: the kept record's co-borrower, else the other's (information only).
    coBorrower: keep.coBorrower ?? drop.coBorrower ?? null,
    notes,
    tags,
    dnc: phoneFrom.dnc ?? null,
    rnd: phoneFrom.rnd ?? null,
    line: phoneFrom.line ?? null,
    // Strictest: a hold or "no cards" on either record stays.
    locked: keep.locked || drop.locked,
    provenance: keep.provenance === "unknown" ? drop.provenance : drop.provenance === "prior_employer" ? "prior_employer" : keep.provenance,
    noMail: !!(keep.noMail || drop.noMail) || undefined,
    partnerUpdates,
    createdAt: keep.createdAt < drop.createdAt ? keep.createdAt : drop.createdAt,
    updatedAt: at,
    mergedFrom: [...(keep.mergedFrom ?? []), { id: drop.id, name: nameOf(drop).slice(0, 120), at }, ...(drop.mergedFrom ?? [])].slice(0, 20),
  };
}

type Rank = -1 | 0 | 1 | 2;
/** stop (-1) < nothing on file (0) < your word (1) < proof (2). Lower is stricter. */
const rank = (e: ConsentEntry): Rank => (e.evidence === "revoked" ? -1 : !e.granted ? 0 : PROOF.has(e.evidence) ? 2 : 1);
const latest = (log: ConsentEntry[], ch: Channel, p: Purpose) => liveEntries(log).filter((e) => e.channel === ch && e.purpose === p).sort((a, b) => a.at.localeCompare(b.at)).pop() ?? null;
const addressOf = (c: Pick<Contact, "phone" | "email">, ch: Channel) => (PHONE.includes(ch) ? c.phone : c.email);

export type PairOutcome = { channel: Channel; purpose: Purpose; state: "stop" | "none" | "word" | "proof"; from: "keep" | "drop" | null };
export type ConsentMerge = {
  /** The other record's entries, copied into the kept record as history. */
  copies: ConsentEntry[];
  /** What the merge keeps, appended to the kept record's own log. */
  appended: ConsentEntry[];
  outcome: PairOutcome[];
};

/**
 * The kept record's consent after a merge. `merged` is the kept record as it
 * will be (its phone and email decide which "yes" still applies).
 */
export function mergeConsent(keep: Contact, keepLog: ConsentEntry[], drop: Contact, dropLog: ConsentEntry[], merged: Pick<Contact, "phone" | "email">, at: string, actor: string): ConsentMerge {
  const label = nameOf(drop).slice(0, 80);
  // Copied as they are (the page labels them "From <name>'s record"); the originals stay under the other record's id.
  const copies: ConsentEntry[] = dropLog.map((e) => ({ ...e, contactId: keep.id, importId: null, mergedFrom: e.mergedFrom ?? drop.id }));
  const appended: ConsentEntry[] = [];
  const outcome: PairOutcome[] = [];
  for (const ch of CHANNELS) {
    for (const p of PURPOSES) {
      const k = latest(keepLog, ch, p);
      const d = latest(dropLog, ch, p);
      const to = addressOf(merged, ch);
      // A stop always carries; otherwise only answers given for the address that's kept count.
      const counts = (rec: Contact, e: ConsentEntry | null) => !!e && (rank(e) === -1 || (!!to && addressOf(rec, ch) === to));
      const cands = ([["keep", k], ["drop", d]] as const).filter(([who, e]) => counts(who === "keep" ? keep : drop, e)) as unknown as ["keep" | "drop", ConsentEntry][];
      cands.sort((a, b) => rank(a[1]) - rank(b[1]) || a[1].at.localeCompare(b[1].at));
      const pick = cands[0] ?? null;
      const want = pick ? pick[1] : null;
      const wantRank: Rank = want ? rank(want) : 0;
      outcome.push({ channel: ch, purpose: p, state: wantRank === -1 ? "stop" : wantRank === 0 ? "none" : wantRank === 1 ? "word" : "proof", from: pick ? pick[0] : null });
      // The kept record already says this (same answer and kind of proof): nothing to add.
      const kRank: Rank = k ? rank(k) : 0;
      if (want ? k && k.granted === want.granted && k.evidence === want.evidence : kRank === 0) continue;
      if (!want || wantRank === 0) {
        appended.push({ contactId: keep.id, channel: ch, purpose: p, granted: false, evidence: "reset", proof: `Merged with ${label}'s record: no permission on file for ${PHONE.includes(ch) ? "this number" : "this address"}`.slice(0, 500), at, actor });
      } else if (wantRank === -1) {
        appended.push({ contactId: keep.id, channel: ch, purpose: p, granted: false, evidence: "revoked", proof: `Merged with ${label}'s record: they said stop (${want.at.slice(0, 10)}): ${want.proof}`.slice(0, 500), at, actor });
      } else {
        // A "yes" keeps its own date (so it never looks newer than it is), unless the kept record has a later entry to follow.
        const when = k && k.at >= want.at ? new Date(Date.parse(k.at) + 1).toISOString() : want.at;
        appended.push({ contactId: keep.id, channel: ch, purpose: p, granted: true, evidence: want.evidence, proof: `${want.proof} (kept at merge${pick![0] === "drop" ? `, from ${label}'s record` : ""})`.slice(0, 500), at: when, actor });
      }
    }
  }
  return { copies, appended, outcome };
}
