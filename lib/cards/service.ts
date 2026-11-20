/**
 * lib/cards/service.ts — cards by mail through Thanks.io (D53). SERVER-ONLY.
 *
 * The loan officer picks people (or a whole group), a card, a design from
 * their own Thanks.io library, a handwriting style and the words. Then:
 *  - The words get the same checks as every text and email (no rates or
 *    promises, nothing about who a home is for), and every card ends with a
 *    sign-off naming the loan officer, their NMLS number, the company and
 *    its NMLS number, and Equal Housing Opportunity. The return address is
 *    the company's.
 *  - People are left out, with the reason shown, if: there's no full mailing
 *    address, they're on hold (a previous employer's list), they asked for no
 *    cards by mail, or they got a card in the last 30 days.
 *  - Thanks.io prices it first (nothing is charged). The loan officer sees the
 *    count and the cost, then sends. Their own Thanks.io account pays.
 */
import { randomBytes } from "node:crypto";
import { accountStore, type User } from "@/lib/accounts/store";
import { companyDetails } from "@/lib/accounts/company";
import { mloById } from "@/lib/config";
import { canSee } from "@/lib/contacts/service";
import { contactStore, type Contact } from "@/lib/contacts/store";
import { checkTemplate, myValues } from "@/lib/templates/service";
import { fill, variablesOf } from "@/lib/templates/library";
import { incr } from "@/lib/m8/kv";
import { seal, unseal } from "@/lib/mail/seal";
import { CARD_FIELDS, CARD_MAX } from "./library";
import { cardStore, type CardAccount, type CardKind, type CardOrder, type PostcardSize, type Skipped } from "./store";
import { estimate, listDesigns, listStyles, sendMail, thanksExchange, thanksRefresh, ThanksError, type Design, type MailBody, type Recipient, type Style } from "./thanks";

export const MAX_CARDS = 500;
export const RECENT_DAYS = 30;
const DRAFT_TTL_MS = 30 * 60 * 1000;
const iso = (d: Date) => d.toISOString();

// ---- The connection ----

export async function connectThanks(user: User, code: string, origin: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const t = await thanksExchange(code, origin, now);
    if (!t.refresh) return { ok: false, error: "Thanks.io didn't give a lasting connection. Try again." };
    await cardStore().putAccount({ userId: user.id, refreshSealed: seal(t.refresh), accessSealed: seal(t.access), accessExpiresAt: t.expiresAt, connectedAt: iso(now), status: "connected", lastError: "" });
    await accountStore().audit({ at: iso(now), actor: user.email, action: "cards.connect", detail: {} });
    return { ok: true };
  } catch (e) {
    console.warn(`[cards] connect failed: ${e instanceof ThanksError ? e.code : "error"}`);
    return { ok: false, error: "Thanks.io didn't finish the connection. Try again." };
  }
}

export async function disconnectThanks(user: User, now = new Date()): Promise<boolean> {
  const a = await cardStore().account(user.id);
  if (!a) return false;
  await cardStore().removeAccount(user.id);
  await accountStore().audit({ at: iso(now), actor: user.email, action: "cards.disconnect", detail: {} });
  return true;
}

export async function thanksStatus(user: Pick<User, "id">): Promise<{ connected: boolean; reconnect: boolean; since: string | null }> {
  const a = await cardStore().account(user.id).catch(() => null);
  return { connected: a?.status === "connected", reconnect: a?.status === "needs_reconnect", since: a?.connectedAt ?? null };
}

const RECONNECT = "Reconnect Thanks.io: it stopped accepting Command Center's connection. Open Cards by mail and connect it again.";

async function accessFor(userId: string, now: Date): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const a = await cardStore().account(userId);
  if (!a) return { ok: false, error: "Connect your Thanks.io account first." };
  if (a.status !== "connected") return { ok: false, error: RECONNECT };
  const cached = unseal(a.accessSealed);
  if (cached && a.accessExpiresAt && Date.parse(a.accessExpiresAt) - 60_000 > now.getTime()) return { ok: true, token: cached };
  const refresh = unseal(a.refreshSealed);
  const broken = async (why: string) => {
    await cardStore().putAccount({ ...a, status: "needs_reconnect", lastError: why, accessSealed: null, accessExpiresAt: null } satisfies CardAccount);
    return { ok: false as const, error: RECONNECT };
  };
  if (!refresh) return broken("The saved connection couldn't be read.");
  try {
    const t = await thanksRefresh(refresh, now);
    await cardStore().putAccount({ ...a, accessSealed: seal(t.access), accessExpiresAt: t.expiresAt, refreshSealed: t.refresh ? seal(t.refresh) : a.refreshSealed });
    return { ok: true, token: t.access };
  } catch (e) {
    const code = e instanceof ThanksError ? e.code : "error";
    if (code === "invalid_grant" || code === "invalid_client" || (e instanceof ThanksError && e.status === 401)) return broken("The permission was removed or expired.");
    return { ok: false, error: "Thanks.io didn't answer. Try again in a minute." };
  }
}

async function withToken<T>(user: Pick<User, "id">, now: Date, fn: (t: string) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const a = await accessFor(user.id, now);
  if (!a.ok) return a;
  try {
    return { ok: true, value: await fn(a.token) };
  } catch (e) {
    if (e instanceof ThanksError && e.status === 401) {
      const acct = await cardStore().account(user.id);
      if (acct) await cardStore().putAccount({ ...acct, status: "needs_reconnect", lastError: "Thanks.io refused the saved connection.", accessSealed: null, accessExpiresAt: null });
      return { ok: false, error: RECONNECT };
    }
    if (e instanceof ThanksError && e.status === 402) return { ok: false, error: "Thanks.io has paused your account's API access over a payment problem. Update the card on file in Thanks.io." };
    const msg = e instanceof ThanksError && e.status === 422 ? `Thanks.io said: ${e.code.slice(0, 200)}` : "Thanks.io didn't answer. Try again in a minute.";
    return { ok: false, error: msg };
  }
}

export const designsFor = (user: Pick<User, "id">, kind: CardKind, size: PostcardSize | null, now = new Date()) => withToken<Design[]>(user, now, (t) => listDesigns(t, kind, size));
export const stylesFor = (user: Pick<User, "id">, now = new Date()) => withToken<Style[]>(user, now, (t) => listStyles(t));

// ---- The words ----

/** The required lines at the end of every card. */
export function cardSignoff(user: User): string {
  const m = mloById(user.mloId);
  const co = companyDetails(m);
  const who = m ? `${m.name}, NMLS #${m.nmls}` : user.name;
  return `${who}\n${co.short}${co.nmls ? `, NMLS #${co.nmls}` : ""} · Equal Housing Opportunity`;
}

export function checkCardMessage(raw: string): { ok: true; text: string } | { ok: false; error: string } {
  const text = raw.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 10) return { ok: false, error: "Write a short message for the card." };
  if (text.length > CARD_MAX) return { ok: false, error: `Keep it under ${CARD_MAX} characters so it fits the card in handwriting.` };
  if (/%[A-Z_]+%/.test(text)) return { ok: false, error: "Use {first} for their first name." };
  const unknown = variablesOf(text).filter((v) => !(CARD_FIELDS as readonly string[]).includes(v));
  if (unknown.length) return { ok: false, error: `{${unknown[0]}} isn't a field cards can fill in. Use {first} or {myFirst}.` };
  const c = checkTemplate(text);
  if (!c.ok) return { ok: false, error: `The message can't go on a card: it ${c.reason}.` };
  return { ok: true, text };
}

/** Thanks.io fills %FIRST_NAME% from each recipient's name; the rest is filled here. */
export function finalMessage(user: User, text: string): string {
  const mine = myValues(user);
  const filled = fill(text.replace(/\{first\}/g, "%FIRST_NAME%"), { myFirst: mine.myFirst });
  return `${filled}\n\n${cardSignoff(user)}`;
}

// ---- Who gets one ----

/** "135 Lake St S, Ste 230, Kirkland, WA 98033" → Thanks.io's return fields. */
export function returnAddress(address: string): Pick<MailBody, "return_address" | "return_address2" | "return_city" | "return_state" | "return_postal_code"> | null {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const m = parts[parts.length - 1].match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!m) return null;
  const city = parts[parts.length - 2];
  const [street, ...rest] = parts.slice(0, -2);
  return { return_address: street, ...(rest.length ? { return_address2: rest.join(", ") } : {}), return_city: city, return_state: m[1], return_postal_code: m[2] };
}

const nameOf = (c: Contact) => [c.firstName, c.lastName].filter(Boolean).join(" ").trim();

export function recipientFor(c: Contact): Recipient | null {
  if (!c.street?.trim() || !c.city?.trim() || !c.state || !/^\d{5}(-\d{4})?$/.test(c.zip?.trim() ?? "")) return null;
  return { name: nameOf(c) || "Current Resident", address: c.street.trim(), city: c.city.trim(), province: c.state, postal_code: c.zip!.trim(), country: "US" };
}

async function recentlySent(contactId: string, now: Date): Promise<boolean> {
  const last = (await cardStore().ordersForContact(contactId, 1))[0];
  return !!last?.sentAt && now.getTime() - Date.parse(last.sentAt) < RECENT_DAYS * 86_400_000;
}

// ---- Price it, then send it ----

export type PrepareInput = { kind: CardKind; size: PostcardSize | null; designId: number; designImage: string; styleId: number | null; message: string; contactIds: string[] };
export type PrepareResult = { ok: true; order: CardOrder } | { ok: false; error: string; skipped?: Skipped[] };

export async function prepareCards(user: User, input: PrepareInput, now = new Date()): Promise<PrepareResult> {
  if (input.kind !== "notecard" && input.kind !== "postcard") return { ok: false, error: "Pick a notecard or a postcard." };
  const size = input.kind === "postcard" ? (input.size === "6x9" ? "6x9" : "4x6") : null;
  if (!Number.isInteger(input.designId) || input.designId <= 0) return { ok: false, error: "Pick a design for the front." };
  const msg = checkCardMessage(input.message);
  if (!msg.ok) return { ok: false, error: msg.error };
  const ids = [...new Set(input.contactIds)].slice(0, MAX_CARDS + 1);
  if (!ids.length) return { ok: false, error: "Pick at least one person." };
  if (ids.length > MAX_CARDS) return { ok: false, error: `Up to ${MAX_CARDS} cards at a time.` };
  const usesFirst = /\{first\}/.test(msg.text);
  const send: { c: Contact; r: Recipient }[] = [];
  const skipped: Skipped[] = [];
  for (const id of ids) {
    const c = await contactStore().get(id);
    if (!c || !canSee(user, c) || c.ownerUserId !== user.id) continue;
    const name = nameOf(c) || "(no name)";
    const r = recipientFor(c);
    const why = c.locked ? "on hold (a previous employer's list)" : c.noMail ? "asked for no cards by mail" : !r ? "no full mailing address" : usesFirst && !c.firstName?.trim() ? "no first name for {first}" : (await recentlySent(c.id, now)) ? `got a card in the last ${RECENT_DAYS} days` : null;
    if (why || !r) skipped.push({ contactId: c.id, name, reason: why ?? "no full mailing address" });
    else send.push({ c, r: usesFirst ? r : { ...r } });
  }
  if (!send.length) return { ok: false, error: "Nobody picked can get a card right now.", skipped };
  const order: CardOrder = {
    id: `cd_${randomBytes(9).toString("base64url")}`,
    ownerUserId: user.id,
    kind: input.kind,
    size,
    imageTemplateId: input.designId,
    imageUrl: /^https:\/\//.test(input.designImage) ? input.designImage : "",
    styleId: input.styleId && input.styleId > 0 ? input.styleId : null,
    message: msg.text,
    finalMessage: finalMessage(user, msg.text),
    contactIds: send.map((s) => s.c.id),
    skipped,
    estimateCents: 0,
    balanceCents: null,
    coveredByBalance: null,
    testMode: false,
    status: "draft",
    orderId: null,
    error: "",
    createdAt: iso(now),
    sentAt: null,
  };
  const body = await bodyFor(user, order, send.map((s) => s.r));
  const est = await withToken(user, now, (t) => estimate(t, order.kind, body));
  if (!est.ok) return { ok: false, error: est.error, skipped };
  Object.assign(order, { estimateCents: est.value.totalCents, balanceCents: est.value.balanceCents, coveredByBalance: est.value.covered, testMode: est.value.testMode });
  await cardStore().putOrder(order);
  return { ok: true, order };
}

async function bodyFor(user: User, o: CardOrder, recipients: Recipient[]): Promise<MailBody> {
  const m = mloById(user.mloId);
  const ret = returnAddress(companyDetails(m).address);
  return {
    recipients,
    message: o.finalMessage,
    image_template_id: o.imageTemplateId,
    ...(o.styleId ? { handwriting_style_id: o.styleId } : {}),
    ...(o.kind === "postcard" && o.size ? { size: o.size } : {}),
    ...(ret ? { return_name: (m?.name ?? user.name).slice(0, 60), ...ret } : {}),
    email_lookup: false,
    metadata: { source: "loanm8-command-center", order: o.id },
  };
}

export async function sendCards(user: User, orderId: string, now = new Date()): Promise<{ ok: true; count: number; testMode: boolean } | { ok: false; error: string }> {
  const o = await cardStore().order(orderId);
  if (!o || o.ownerUserId !== user.id) return { ok: false, error: "That card order wasn't found." };
  if (o.status !== "draft") return { ok: false, error: o.status === "sent" ? "Those cards were already sent." : "That order can't be sent. Start again." };
  if (now.getTime() - Date.parse(o.createdAt) > DRAFT_TTL_MS) return { ok: false, error: "That price check is over 30 minutes old. Check the price again." };
  // One send per order, even with a double click or two tabs.
  if ((await incr(`cards:send:${o.id}`, 86_400).catch(() => 1)) > 1) return { ok: false, error: "Those cards are already on their way." };
  // Re-check each person now: they may have opted out or got a card meanwhile.
  const recipients: Recipient[] = [];
  const kept: string[] = [];
  for (const id of o.contactIds) {
    const c = await contactStore().get(id);
    const r = c && c.ownerUserId === user.id && !c.locked && !c.noMail ? recipientFor(c) : null;
    if (c && r && !(await recentlySent(c.id, now))) {
      recipients.push(r);
      kept.push(c.id);
    }
  }
  if (!recipients.length) {
    await cardStore().putOrder({ ...o, status: "failed", error: "Nobody left to send to." });
    return { ok: false, error: "Nobody on this order can get a card now." };
  }
  await cardStore().putOrder({ ...o, status: "sending" });
  const body = await bodyFor(user, { ...o }, recipients);
  const r = await withToken(user, now, (t) => sendMail(t, o.kind, body));
  if (!r.ok) {
    await cardStore().putOrder({ ...o, status: "failed", error: r.error });
    return { ok: false, error: r.error };
  }
  await cardStore().putOrder({ ...o, contactIds: kept, status: "sent", orderId: r.value.orderId, sentAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: "cards.send", detail: { order: o.id, kind: o.kind, count: kept.length, thanksOrder: r.value.orderId } });
  return { ok: true, count: kept.length, testMode: o.testMode };
}

export async function discardCards(user: User, orderId: string): Promise<boolean> {
  const o = await cardStore().order(orderId);
  if (!o || o.ownerUserId !== user.id || o.status !== "draft") return false;
  await cardStore().putOrder({ ...o, status: "discarded" });
  return true;
}

/** Their say: no cards by mail (or cards again). */
export async function setNoMail(user: User, contactId: string, noMail: boolean, now = new Date()): Promise<boolean> {
  const c = await contactStore().get(contactId);
  if (!c || !canSee(user, c)) return false;
  await contactStore().put({ ...c, noMail, updatedAt: iso(now) });
  await accountStore().audit({ at: iso(now), actor: user.email, action: noMail ? "cards.nomail" : "cards.mail_ok", detail: { contactId } });
  return true;
}
