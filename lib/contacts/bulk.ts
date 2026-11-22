/**
 * lib/contacts/bulk.ts — the Contacts list's bulk bar (D73 tags; D78 the rest).
 * SERVER-ONLY.
 *
 * Who a bulk action reaches (`resolveTarget`):
 *  - the people picked (ids): every one is read and checked with `canSee`
 *    first, and one outside the viewer's book refuses the whole request
 *    before anything changes;
 *  - "Select all N matching": the list's rule run again on the server, in
 *    the viewer's scope (an assistant's is the book of the officer they
 *    assist), read in full before anything changes.
 *
 * The actions: add to a campaign (only people the contact rules allow for
 * its messages; every step is checked again when it goes out), assign to a
 * team member (owners and team leads only, inside one company), download a
 * formula-safe spreadsheet, and delete (type DELETE; never assistants; the
 * permission and stop history stays on file). The audit log keeps counts only.
 */
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { companyOfMlo, singleCompany } from "@/lib/accounts/company";
import { campaignStore } from "@/lib/campaigns/store";
import { contactListsCopy as lc } from "@/lib/content/contact-lists";
import { contactTagsCopy as tc } from "@/lib/content/contact-tags";
import { cleanRule, type ListRule } from "./filter";
import { MAX_LIST_PEOPLE, peopleIn } from "./lists";
import { canSee, summarize } from "./service";
import { contactsCsv } from "./sheet";
import { contactStore, type Contact } from "./store";

/** Ids sent from a page selection (one page is 50). */
export const MAX_BULK_IDS = 500;
/** People one "Select all N matching" request changes. */
export const MAX_BULK_MATCHING = MAX_LIST_PEOPLE;

/** D73's filter shape (still accepted); D78 sends the list's whole rule. */
export type LegacyFilter = { kind: "contact" | "agent"; q?: string; rel?: string; tag?: string; imp?: string };
export type BulkTarget = { ids: string[] } | { rule: ListRule } | { filter: LegacyFilter };

export const legacyRule = (f: LegacyFilter): ListRule => cleanRule({ kind: f.kind, q: f.q, relationship: f.rel as ListRule["relationship"], tagsAny: f.tag ? [f.tag] : undefined, importId: f.imp });

type Resolved = { ok: true; people: Contact[]; by: "selection" | "filter" } | { ok: false; error: string };

export async function resolveTarget(actor: User, target: BulkTarget, now = new Date()): Promise<Resolved> {
  if (actor.status !== "active") return { ok: false, error: tc.noContact };
  const store = contactStore();
  if ("ids" in target) {
    const ids = [...new Set(target.ids)];
    if (!ids.length) return { ok: false, error: tc.pickPeople };
    if (ids.length > MAX_BULK_IDS) return { ok: false, error: tc.tooManyPicked(MAX_BULK_IDS) };
    const people: Contact[] = [];
    for (const id of ids) {
      const c = await store.get(id);
      // One person outside the viewer's book refuses everything, before anything changes.
      if (!c || !canSee(actor, c)) return { ok: false, error: tc.notYours };
      people.push(c);
    }
    return { ok: true, people, by: "selection" };
  }
  const rule = "rule" in target ? cleanRule(target.rule) : legacyRule(target.filter);
  const people = await peopleIn(actor, rule, MAX_BULK_MATCHING + 1, now);
  if (people.length > MAX_BULK_MATCHING) return { ok: false, error: lc.tooBig(MAX_BULK_MATCHING) };
  if (people.some((c) => !canSee(actor, c))) return { ok: false, error: tc.notYours };
  return { ok: true, people, by: "filter" };
}

/** Stops a person's running campaigns (they left the book, or were deleted). */
async function stopCampaigns(contactId: string, reason: string, at: string): Promise<number> {
  let n = 0;
  for (const e of await campaignStore().activeForContact(contactId)) {
    await campaignStore().putEnrollment({ ...e, status: "stopped", endedAt: at, reason });
    n++;
  }
  return n;
}

/** Add to a campaign: the people the contact rules allow for its messages. */
export async function bulkEnroll(actor: User, target: BulkTarget, campaignId: string, now = new Date()) {
  const r = await resolveTarget(actor, target, now);
  if (!r.ok) return r;
  const { enrollReachable } = await import("@/lib/campaigns/service");
  const out = await enrollReachable(actor, campaignId, r.people, now);
  if (!out) return { ok: false as const, error: lc.noCampaign };
  return { ok: true as const, report: out };
}

export const CAN_ASSIGN: User["role"][] = ["owner", "team_lead"];

/** The loan officers people can be assigned to: active, with a book (not assistants), in the actor's company. */
export async function assignees(actor: User): Promise<User[]> {
  if (!CAN_ASSIGN.includes(actor.role) || actor.status !== "active") return [];
  const all = await accountStore().listUsers();
  return all.filter((u) => u.status === "active" && u.role !== "assistant" && sameCompany(actor, u)).sort((a, b) => a.name.localeCompare(b.name));
}
const sameCompany = (a: User, b: User) => singleCompany() || (!!companyOfMlo(a.mloId) && companyOfMlo(a.mloId) === companyOfMlo(b.mloId));

/** Assign to a team member: owners and team leads only. The people move to that loan officer's book. */
export async function bulkAssign(actor: User, target: BulkTarget, toUserId: string, now = new Date()): Promise<{ ok: true; moved: number; skipped: number; name: string } | { ok: false; error: string }> {
  if (!CAN_ASSIGN.includes(actor.role)) return { ok: false, error: lc.noAssign };
  const to = await accountStore().userById(toUserId);
  if (!to || to.status !== "active" || to.role === "assistant") return { ok: false, error: lc.badMember };
  if (!sameCompany(actor, to)) return { ok: false, error: lc.otherCompany };
  const r = await resolveTarget(actor, target, now);
  if (!r.ok) return r;
  const at = now.toISOString();
  let moved = 0;
  let skipped = 0;
  let stopped = 0;
  for (const c of r.people) {
    if (c.ownerUserId === to.id) {
      skipped++;
      continue;
    }
    await contactStore().put({ ...c, ownerUserId: to.id, updatedAt: at });
    stopped += await stopCampaigns(c.id, "Moved to another loan officer's book.", at);
    moved++;
  }
  await accountStore().audit({ at, actor: actor.email, action: "contacts.assign", detail: { to: to.id, moved, skipped, stopped, by: r.by } });
  return { ok: true, moved, skipped, name: to.name || to.email };
}

/** Download a spreadsheet (CSV), formula-safe. */
export async function bulkCsv(actor: User, target: BulkTarget, now = new Date()): Promise<{ ok: true; csv: string; count: number } | { ok: false; error: string }> {
  const r = await resolveTarget(actor, target, now);
  if (!r.ok) return r;
  const store = contactStore();
  const rows: { contact: Contact; summary: ReturnType<typeof summarize> }[] = [];
  for (let i = 0; i < r.people.length; i += 500) {
    const part = r.people.slice(i, i + 500);
    const log = await store.consentsFor(part.map((c) => c.id));
    for (const c of part) rows.push({ contact: c, summary: summarize(log.filter((e) => e.contactId === c.id)) });
  }
  await accountStore().audit({ at: now.toISOString(), actor: actor.email, action: "contacts.download", detail: { count: rows.length, by: r.by } });
  return { ok: true, csv: contactsCsv(rows), count: rows.length };
}

/** Delete, after typing DELETE. Never assistants. The permission and stop history stays (append-only). */
export async function bulkDelete(actor: User, target: BulkTarget, confirm: string, now = new Date()): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  if (actor.role === "assistant") return { ok: false, error: lc.noDelete };
  if (confirm.trim() !== lc.deleteWord) return { ok: false, error: lc.typeDelete };
  const r = await resolveTarget(actor, target, now);
  if (!r.ok) return r;
  const at = now.toISOString();
  for (const c of r.people) {
    await stopCampaigns(c.id, "Deleted from your contacts.", at);
    await contactStore().remove(c.id, { keepConsents: true });
  }
  await accountStore().audit({ at, actor: actor.email, action: "contacts.delete.bulk", detail: { deleted: r.people.length, by: r.by } });
  return { ok: true, deleted: r.people.length };
}
