/**
 * lib/export/service.ts — "Download everything" (D53.1). SERVER-ONLY.
 *
 * Backs the tagline: a loan officer can take their whole book with them.
 * One zip of spreadsheets (and their receipt files) holding everything
 * Command Center keeps for them: contacts and agents, permission records,
 * every text, email and call logged, notes, reminders, drafts, loans,
 * campaigns, templates, call scripts, cards and expenses. Only their own
 * book. Nothing secret goes in (no connection tokens or loan-system keys).
 * D83: each expense's lead source, the lead-event log and the monthly
 * amounts per source. D86: the saved lead plan and its earlier versions.
 */
import type { User } from "@/lib/accounts/store";
import { CONFIG, mloById } from "@/lib/config";
import { contactStore, listAll, type Contact } from "@/lib/contacts/store";
import { allSince } from "@/lib/messaging/store";
import { conciergeStore } from "@/lib/concierge/store";
import { pipelineStore } from "@/lib/pipeline/store";
import { campaignStore } from "@/lib/campaigns/store";
import { templateStore } from "@/lib/templates/service";
import { scriptStore } from "@/lib/scripts/store";
import { cardStore } from "@/lib/cards/store";
import { videoStore } from "@/lib/videos/store";
import { expenseStore } from "@/lib/expenses/store";
import { leadEventStore } from "@/lib/leads/events";
import { monthlyStore } from "@/lib/leads/spend";
import { planStore } from "@/lib/leads/plan-store";
import { signatureFor } from "@/lib/profile/signature";
import { toCsv } from "./csv";
import { zip, type ZipFile } from "./zip";

/** Vercel caps a response at about 4.5 MB; receipts fill what's left of this. */
export const RECEIPT_BUDGET = 3 * 1024 * 1024;

const nameOf = (c: Contact | undefined) => (c ? [c.firstName, c.lastName].filter(Boolean).join(" ") : "");
const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "file";

export type ExportResult = { file: Buffer; filename: string; counts: Record<string, number>; receiptsLeftOut: number };

export async function buildExport(user: User, now = new Date()): Promise<ExportResult> {
  const owner = user.id;
  const nowIso = now.toISOString();
  // D87.2: the whole book, page by page (one read used to stop at 500 people).
  const book = await listAll({ ownerUserId: owner });
  const all = book.contacts.filter((c) => c.ownerUserId === owner);
  const byId = new Map(all.map((c) => [c.id, c]));
  const who = (id: string | null | undefined) => (id ? nameOf(byId.get(id)) : "");
  const contactRow = (c: Contact) => ({ name: nameOf(c), ...c });

  const consents = [];
  for (let i = 0; i < all.length; i += 500) consents.push(...(await contactStore().consentsFor(all.slice(i, i + 500).map((c) => c.id))));
  const [messages, notes, tasks, drafts, loans, campaigns, templates, scripts, cards, expenses, receipts, sig, videos, videoSends, leadEvents, monthly] = await Promise.all([
    // D87.3: every message, page by page (one read used to stop at the newest 5,000).
    allSince(owner, "1970-01-01T00:00:00.000Z"),
    conciergeStore().allMemory(owner, nowIso),
    conciergeStore().tasks(owner, false),
    conciergeStore().proposals(owner),
    pipelineStore().list(owner),
    campaignStore().campaigns(owner),
    templateStore().visible(owner),
    scriptStore().recent(owner, 5000),
    cardStore().ordersFor(owner, 5000),
    expenseStore().list(owner, null),
    expenseStore().receipts(owner),
    signatureFor(user).catch(() => ""),
    videoStore().videosFor(owner, 5000).catch(() => []),
    videoStore().sendsFor(owner, 20000).catch(() => []),
    leadEventStore().list(owner).catch(() => []),
    monthlyStore().list(owner).catch(() => []),
  ]);
  // D86: the saved lead plan, then its earlier versions (newest first), one row per part of the split.
  const savedPlan = await planStore().get(owner).catch(() => null);
  const planRows = savedPlan && savedPlan.ownerUserId === owner
    ? [{ ...savedPlan, version: "current" }, ...savedPlan.history.map((h, i) => ({ ...h, version: `earlier ${i + 1}` }))].flatMap((v) =>
        v.lines.map((l) => ({ version: v.version, savedAt: v.savedAt, startedAt: v.startedAt, budgetDollars: (v.budgetCents / 100).toFixed(0), targetDollars: (v.targetCents / 100).toFixed(0), part: l.label, sourceKey: l.key, kind: l.kind, dollars: (l.cents / 100).toFixed(0), madeBy: v.why })),
      )
    : [];
  const enrollments = (await Promise.all(campaigns.map((c) => campaignStore().enrollments(c.id)))).flat();
  const mine = templates.filter((t) => t.ownerUserId === owner);

  const files: ZipFile[] = [];
  const add = (name: string, rows: object[], opts: { first?: string[]; omit?: string[] } = {}) => {
    files.push({ name, data: toCsv(rows, { ...opts, omit: [...(opts.omit ?? []), "ownerUserId"] }) });
    return rows.length;
  };
  const counts: Record<string, number> = {
    contacts: add("contacts.csv", all.filter((c) => c.kind === "contact").map(contactRow), { first: ["name", "firstName", "lastName", "email", "phone", "street", "city", "state", "zip", "relationship"] }),
    agents: add("agents.csv", all.filter((c) => c.kind === "agent").map(contactRow), { first: ["name", "firstName", "lastName", "email", "phone"] }),
    permissions: add("permission-records.csv", consents.map((e) => ({ contact: who(e.contactId), ...e })), { first: ["contact", "channel", "purpose", "granted", "evidence", "proof", "at"] }),
    messages: add("messages.csv", messages.touches.map((t) => ({ contact: who(t.contactId), ...t })), { first: ["at", "contact", "channel", "direction", "purpose", "status", "body"] }),
    notes: add("notes.csv", notes.map((n) => ({ contact: who(n.contactId), ...n })), { first: ["createdAt", "contact", "kind", "fact", "quote", "source"] }),
    reminders: add("reminders.csv", tasks.map((t) => ({ contact: who(t.contactId), ...t })), { first: ["due", "contact", "title", "why", "done"] }),
    drafts: add("concierge-drafts.csv", drafts.map((p) => ({ contact: who(p.contactId), ...p })), { first: ["createdAt", "contact", "status"] }),
    loans: add("loans.csv", loans.map((l) => ({ contact: who(l.contactId), ...l })), { first: ["externalId", "contact"] }),
    campaigns: add("campaigns.csv", campaigns.map((c) => ({ ...c, steps: c.steps.map((s, i) => `Step ${i + 1} (${s.channel}, wait ${s.waitDays} days)${s.subject ? `: ${s.subject}` : ""}\n${s.body}`).join("\n\n") })), { first: ["name", "status", "kind", "purpose", "trigger"] }),
    campaignPeople: add("campaign-people.csv", enrollments.map((e) => ({ campaign: campaigns.find((c) => c.id === e.campaignId)?.name ?? "", contact: who(e.contactId), ...e })), { first: ["campaign", "contact", "status", "stepIndex", "nextAt"] }),
    templates: add("templates.csv", mine, { first: ["name"] }),
    scripts: add("call-scripts.csv", scripts.map((s) => ({ contact: who(s.contactId), ...s })), { first: ["contact"] }),
    cards: add("cards-by-mail.csv", cards.map((o) => ({ ...o, contactIds: undefined, people: o.contactIds.map(who).join("; ") })), { first: ["createdAt", "status", "kind", "people"], omit: ["contactIds"] }),
    videos: add("videos.csv", videos.map((v) => ({ createdAt: v.createdAt, title: v.title, seconds: v.durationSec, status: v.status, reason: v.reason, whatItSays: v.transcript, file: v.url ? `${CONFIG.siteUrl.replace(/\/$/, "")}/api/cc/videos/file/${encodeURIComponent(v.id)}` : "" })), { first: ["createdAt", "title", "status"] }),
    videoSends: add("video-sends.csv", videoSends.map((s) => ({ at: s.at, contact: s.contactName, channel: s.channel, video: videos.find((v) => v.id === s.videoId)?.title ?? "(deleted)", views: s.views, firstViewedAt: s.firstViewedAt, lastViewedAt: s.lastViewedAt })), { first: ["at", "contact", "video", "views"] }),
    expenses: add("expenses.csv", expenses.map((e) => ({ ...e, leadSource: e.leadSource ?? null })), { first: ["date", "kind", "amountCents", "miles", "vendor", "category", "leadSource", "purpose"] }),
    // D83: one row per lead delivered or imported (no personal data in the log; the name is looked up from the book).
    leadEvents: add("lead-events.csv", leadEvents.map((e) => ({ at: e.at, source: e.sourceLabel, sourceKey: e.sourceKey, contact: who(e.contactId), contactId: e.contactId, repeat: e.duplicate, formNamedYou: e.namesYou, vendorLeadId: e.externalId, from: e.origin, datedBy: e.datedBy })), { first: ["at", "source", "contact", "repeat", "formNamedYou"] }),
    leadPlan: add("lead-plan.csv", planRows, { first: ["version", "savedAt", "budgetDollars", "part", "dollars"] }),
    monthlyAmounts: add("lead-monthly-amounts.csv", monthly.map((m) => ({ source: m.sourceLabel, sourceKey: m.sourceKey, dollarsAMonth: (m.cents / 100).toFixed(2), lastDraftMonth: m.lastMonth, updatedAt: m.updatedAt })), { first: ["source", "dollarsAMonth"] }),
  };

  // Receipt files, newest first, as many as fit.
  let used = files.reduce((n, f) => n + Buffer.byteLength(f.data), 0);
  let left = 0;
  for (const r of [...receipts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (used + r.size > RECEIPT_BUDGET + 1024 * 1024) {
      left++;
      continue;
    }
    const full = await expenseStore().receipt(owner, r.id);
    if (!full) continue;
    const b64 = full.data.replace(/^data:[^,]*,/, "");
    const buf = Buffer.from(b64, "base64");
    used += buf.length;
    files.push({ name: `receipts/${full.createdAt.slice(0, 10)}-${safeName(full.name)}`, data: buf });
  }
  counts.receipts = receipts.length - left;

  const mlo = mloById(user.mloId);
  files.push({ name: "my-signature.txt", data: sig || "(none saved)" });
  files.push({
    name: "README.txt",
    data: [
      `MLO Command Center: everything for ${user.name || user.email}`,
      `Made ${now.toUTCString()}${mlo ? ` · ${mlo.name}` : ""}`,
      "",
      "Each .csv file opens in Excel, Numbers or Google Sheets. Most other CRMs can import contacts.csv and agents.csv directly.",
      "",
      ...Object.entries(counts).map(([k, n]) => `${k}: ${n}`),
      ...(book.capped ? ["", `This download holds the first ${book.contacts.length.toLocaleString("en-US")} of the ${book.total.toLocaleString("en-US")} people in your book (by last name).`] : []),
      ...(messages.capped ? ["", `messages.csv holds your newest ${messages.touches.length.toLocaleString("en-US")} messages. Older ones are not in this download.`] : []),
      ...(left ? ["", `${left} receipt file${left === 1 ? " is" : "s are"} too large to fit in this download. Download them one by one from Expenses.`] : []),
      "",
      "What each file holds:",
      "contacts.csv, agents.csv: everyone in your book, with addresses, tags, notes, loan details and do-not-call checks.",
      "permission-records.csv: every permission and opt-out on file, with its proof. Keep this: it's your record of consent.",
      "messages.csv: every text, email and call logged in Command Center, newest first.",
      "notes.csv, reminders.csv, concierge-drafts.csv: your Concierge's notes, reminders and drafts.",
      "loans.csv: loans synced from your loan system.",
      "campaigns.csv, campaign-people.csv, templates.csv, call-scripts.csv, cards-by-mail.csv: what you built and sent.",
      "videos.csv, video-sends.csv: your video messages (with a link to each file and what it says) and who watched.",
      "expenses.csv and receipts/: your business expenses, income and mileage (leadSource: the lead source a line of spend was for).",
      "lead-events.csv: every lead delivered to you or imported with a lead source, by source (repeat: they were already in your book; formNamedYou: that lead's consent wording named you or your company).",
      "lead-monthly-amounts.csv: the monthly amount you set for each lead source.",
      "lead-plan.csv: your saved 90-day lead plan, one row per part of its split, then each earlier version (madeBy: you saved it, or approved a Business Manager move or check-in).",
      "",
      "Not included, on purpose: passwords, connection keys and sign-in codes.",
    ].join("\r\n"),
  });

  const stamp = now.toISOString().slice(0, 10);
  return { file: zip(files, now), filename: `loanm8-everything-${stamp}.zip`, counts, receiptsLeftOut: left };
}
