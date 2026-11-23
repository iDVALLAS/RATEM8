/**
 * lib/leads/sync.ts — D83: keeps a loan officer's lead-event log complete.
 * SERVER-ONLY.
 *
 * Runs lazily: when the loan officer opens Lead sources, and in the morning
 * run. Never a step the owner has to take. The first run rebuilds the log
 * before D83 (audit rows and `lead:` contacts) and marks it done; every run
 * adds an event for each imported lead that has none yet. Event ids are
 * fixed, so running it twice (or two runs at once) never doubles a lead.
 */
import { accountStore, type User } from "@/lib/accounts/store";
import { contactStore, listAll, type Contact } from "@/lib/contacts/store";
import { consentNamesUs } from "./intake";
import { eventId, leadEventStore, type LeadEvent } from "./events";
import { isImportedLead, planLeadEvents } from "./backfill";

export const HISTORY_MARK = "history-v1";

export async function syncLeadEvents(user: User, opts: { now?: Date; contacts?: Contact[] } = {}): Promise<{ events: LeadEvent[]; added: number }> {
  const now = opts.now ?? new Date();
  const owner = user.id;
  const store = leadEventStore();
  const [history, existing] = await Promise.all([store.marked(owner, HISTORY_MARK).then((m) => !m), store.list(owner)]);
  const have = new Set(existing.map((e) => e.id));
  // D87.2: the whole book (one read used to stop at 500 people, so later imported leads never got an event).
  const contacts = opts.contacts ?? (await listAll({ ownerUserId: owner, kind: "contact" })).contacts;
  const mine = contacts.filter((c) => c.ownerUserId === owner && c.kind === "contact");
  // Imported leads with no event yet, and (the first time) everyone delivered to the lead address.
  const todo = mine.filter((c) => (isImportedLead(c) && !have.has(eventId(owner, c.id, "import"))) || (history && c.source.startsWith("lead:")));
  if (!history && !todo.length) return { events: existing, added: 0 };
  const entries = [];
  for (let i = 0; i < todo.length; i += 500) entries.push(...(await contactStore().consentsFor(todo.slice(i, i + 500).map((c) => c.id))));
  const audit = history ? await accountStore().auditFor("lead.inbound", owner, 50000) : [];
  const plan = planLeadEvents({ owner, contacts: history ? mine : todo, entries, audit, namesUs: (t) => consentNamesUs(t, user), history, now }).filter((e) => !have.has(e.id));
  const added = await store.addMany(plan);
  if (history) await store.mark(owner, HISTORY_MARK, now.toISOString());
  return { events: added ? await store.list(owner) : existing, added };
}
