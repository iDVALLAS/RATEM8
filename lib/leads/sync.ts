/**
 * lib/leads/sync.ts — D83: keeps a loan officer's lead-event log complete.
 * SERVER-ONLY.
 *
 * Runs lazily: when the loan officer opens Lead sources, and in the morning
 * run. Never a step the owner has to take. The first run rebuilds the log
 * before D83 (audit rows and `lead:` contacts) and marks it done; every run
 * adds an event for each imported lead that has none yet. Event ids are
 * fixed, so running it twice (or two runs at once) never doubles a lead.
 *
 * D87.3 (owner decision 6): once per loan officer (`CALLABLE_MARK`), the
 * imported leads' events already in the log are re-read, so an imported lead
 * whose import recorded the person's yes to texts or calls counts as one
 * "you can call". Only events with origin "import" change; a delivered lead's
 * `namesYou` stays as its delivery froze it. Two runs at once compute the same
 * values from the same records, so overlapping re-reads agree.
 */
import { accountStore, type User } from "@/lib/accounts/store";
import { contactStore, listAll, type Contact } from "@/lib/contacts/store";
import { eventId, leadEventStore, type LeadEvent } from "./events";
import { importedLeadCallable, isImportedLead, planLeadEvents, type BackfillEntry } from "./backfill";

export const HISTORY_MARK = "history-v1";
/** D87.3: the one-time re-read of imported leads' "you can call" (owner decision 6). */
export const CALLABLE_MARK = "imports-callable-v1";

export async function syncLeadEvents(user: User, opts: { now?: Date; contacts?: Contact[] } = {}): Promise<{ events: LeadEvent[]; added: number; reread: number }> {
  const now = opts.now ?? new Date();
  const owner = user.id;
  const store = leadEventStore();
  const [history, reread, existing] = await Promise.all([store.marked(owner, HISTORY_MARK).then((m) => !m), store.marked(owner, CALLABLE_MARK).then((m) => !m), store.list(owner)]);
  const byId = new Map(existing.map((e) => [e.id, e]));
  // D87.2: the whole book (one read used to stop at 500 people, so later imported leads never got an event).
  const contacts = opts.contacts ?? (await listAll({ ownerUserId: owner, kind: "contact" })).contacts;
  const mine = contacts.filter((c) => c.ownerUserId === owner && c.kind === "contact");
  // Imported leads with no event yet, and (the first time) everyone delivered to the lead address.
  const todo = mine.filter((c) => (isImportedLead(c) && !byId.has(eventId(owner, c.id, "import"))) || (history && c.source.startsWith("lead:")));
  // D87.3: (once) imported leads whose own import event is already in the log, still pointing at them.
  const again = reread ? mine.filter((c) => isImportedLead(c) && byId.get(eventId(owner, c.id, "import"))?.contactId === c.id) : [];
  if (!history && !reread && !todo.length) return { events: existing, added: 0, reread: 0 };
  const read = [...new Map([...todo, ...again].map((c) => [c.id, c])).values()];
  const entries: BackfillEntry[] = [];
  for (let i = 0; i < read.length; i += 500) entries.push(...(await contactStore().consentsFor(read.slice(i, i + 500).map((c) => c.id))));
  const audit = history ? await accountStore().auditFor("lead.inbound", owner, 50000) : [];
  const plan = planLeadEvents({ owner, contacts: history ? mine : todo, entries, audit, history, now }).filter((e) => !byId.has(e.id));
  const added = await store.addMany(plan);
  if (history) await store.mark(owner, HISTORY_MARK, now.toISOString());
  let changed = 0;
  if (reread) {
    const entriesOf = new Map<string, BackfillEntry[]>();
    for (const e of entries) entriesOf.set(e.contactId, [...(entriesOf.get(e.contactId) ?? []), e]);
    const changes = again.flatMap((c) => {
      const ev = byId.get(eventId(owner, c.id, "import"))!;
      const namesYou = importedLeadCallable(c, entriesOf.get(c.id) ?? []);
      return ev.origin === "import" && ev.namesYou !== namesYou ? [{ id: ev.id, namesYou }] : [];
    });
    changed = await store.setImportedNamesYou(owner, changes);
    await store.mark(owner, CALLABLE_MARK, now.toISOString());
  }
  return { events: added || changed ? await store.list(owner) : existing, added, reread: changed };
}
