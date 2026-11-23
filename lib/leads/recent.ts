/**
 * lib/leads/recent.ts — D87.2: the people behind Recent leads on Lead sources. SERVER-ONLY.
 *
 * Looks up only the contacts behind the newest lead events, by id, so the list never depends on how much of
 * the book a page read (it used to keep only leads whose contact was in the first 500 people by last name).
 * Own book only: a contact that isn't the owner's, or isn't a contact, is left out, as is a deleted one.
 */
import { contactStore, type Contact } from "@/lib/contacts/store";
import type { LeadEvent } from "./events";
import { recentEvents } from "./mode";

export async function recentLeads(owner: string, events: readonly LeadEvent[], max = 30): Promise<{ event: LeadEvent; contact: Contact }[]> {
  // A few extra, so deleted people don't leave the list short.
  const latest = recentEvents(events.filter((e) => e.ownerUserId === owner), max * 2);
  if (!latest.length) return [];
  const people = await contactStore().getMany(latest.map((e) => e.contactId));
  const byId = new Map(people.filter((c) => c.ownerUserId === owner && c.kind === "contact").map((c) => [c.id, c]));
  return latest.flatMap((event) => {
    const contact = byId.get(event.contactId);
    return contact ? [{ event, contact }] : [];
  }).slice(0, max);
}
