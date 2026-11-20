/**
 * lib/pilot/invite.ts — inviting loan officers to the pilot (D61).
 * SERVER-ONLY.
 *
 * The owner pastes names and emails on the Pilot page. Each person gets an
 * email with their own sign-up link (signed, 14 days, for that email only).
 * The link fills in their name and email; because it reached their inbox,
 * their email counts as confirmed, so the sign-up goes straight to review
 * marked "Invited". The NMLS check by a person still happens on Sign-ups,
 * as for everyone (one click once checked).
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { signUpStore } from "@/lib/registry/store";
import { resendMail, type Mailer } from "./service";

export const INVITE_TTL_MS = 14 * 86_400_000;
export const MAX_INVITES = 25;
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[A-Za-z]{2,}$/;

function key(): Buffer | null {
  const s = process.env.CC_LINK_SECRET?.trim() || process.env.DATABASE_URL?.trim();
  return s ? createHash("sha256").update(`cc-pilot-invite:${s}`).digest() : null;
}
const sign = (k: Buffer, payload: string) => createHmac("sha256", k).update(payload).digest("base64url").slice(0, 32);

export type Invite = { email: string; name: string; by: string; byName: string; exp: number };

export function inviteToken(inv: Invite): string | null {
  const k = key();
  if (!k) return null;
  const payload = Buffer.from(JSON.stringify({ e: inv.email, n: inv.name, b: inv.by, bn: inv.byName, x: inv.exp })).toString("base64url");
  return `${payload}.${sign(k, payload)}`;
}

/** The invite a link carries, if it's genuine and not expired. */
export function readInvite(token: string | null | undefined, now = Date.now()): Invite | null {
  const k = key();
  if (!k || !token || token.length > 1200) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const want = Buffer.from(sign(k, payload));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const o = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e?: string; n?: string; b?: string; bn?: string; x?: number };
    if (!o.e || !o.x || o.x < now) return null;
    return { email: o.e, name: o.n ?? "", by: o.b ?? "", byName: o.bn ?? "", exp: o.x };
  } catch {
    return null;
  }
}

/** "Ann Lee, ann@x.com", "Ann Lee <ann@x.com>" or just "ann@x.com", one per line (commas or semicolons between people work too). */
export function parseInviteLines(text: string): { people: { name: string; email: string }[]; bad: string[] } {
  const people: { name: string; email: string }[] = [];
  const bad: string[] = [];
  const chunks = text.split(/\n|;/).flatMap((line) => {
    const emails = line.match(/[^\s@<>,;]+@[^\s@<>,;]+/g) ?? [];
    return emails.length > 1 ? line.split(",") : [line];
  });
  for (const raw of chunks.map((x) => x.trim()).filter(Boolean)) {
    const found = raw.match(/[^\s@<>,;]+@[^\s@<>,;]+/)?.[0] ?? "";
    const email = found.toLowerCase().replace(/[.)]+$/, "");
    if (!EMAIL.test(email)) {
      bad.push(raw.slice(0, 80));
      continue;
    }
    const name = raw.replace(found, "").replace(/[<>(),"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!people.some((p) => p.email === email)) people.push({ name, email });
  }
  return { people, bad };
}

export type InviteResult = { email: string; ok: boolean; note: string };

/** Emails each person their own sign-up link. Owner and team leads only. */
export async function sendPilotInvites(actor: User, text: string, origin: string, now = Date.now(), send: Mailer = resendMail): Promise<{ ok: true; results: InviteResult[]; bad: string[] } | { ok: false; error: string }> {
  if (actor.status !== "active" || (actor.role !== "owner" && actor.role !== "team_lead")) return { ok: false, error: "Only the owner or a team lead can invite people." };
  if (!key()) return { ok: false, error: "Invites need CC_LINK_SECRET set in Vercel." };
  const { people, bad } = parseInviteLines(text);
  if (!people.length) return { ok: false, error: bad.length ? `No email addresses found in: ${bad.slice(0, 3).join("; ")}` : "Paste at least one email address." };
  if (people.length > MAX_INVITES) return { ok: false, error: `Up to ${MAX_INVITES} people at a time.` };
  const results: InviteResult[] = [];
  for (const p of people) {
    if (await accountStore().userByEmail(p.email)) {
      results.push({ email: p.email, ok: false, note: "already has an account" });
      continue;
    }
    const t = inviteToken({ email: p.email, name: p.name, by: actor.email, byName: actor.name, exp: now + INVITE_TTL_MS });
    const link = `${origin.replace(/\/$/, "")}/sign-up?invite=${encodeURIComponent(t!)}`;
    const hi = p.name ? `Hi ${p.name.split(" ")[0]},` : "Hi,";
    const sent = await send({
      to: p.email,
      replyTo: actor.email,
      subject: `${actor.name} invited you to the MLO Command Center pilot`,
      text: [
        hi,
        "",
        `${actor.name} invited you to try MLO Command Center, a CRM built for licensed loan officers, as part of its pilot.`,
        "",
        `Sign up here (about 3 minutes; have your NMLS ID, and your sponsoring company's name, NMLS ID and mailing address handy):`,
        link,
        "",
        "Once a person checks your NMLS record, you'll get an email with your sign-in link. This invite works for 14 days.",
        "",
        "MLO Command Center",
      ].join("\n"),
    }).catch(() => false);
    results.push({ email: p.email, ok: sent, note: sent ? "invited" : "the email didn't go out (check that email sending is set up)" });
    await accountStore().audit({ at: new Date(now).toISOString(), actor: actor.email, action: "pilot.invite", detail: { email: p.email, sent } });
  }
  return { ok: true, results, bad };
}

/** Sign-ups that came from an invite and are waiting, for the Pilot page. */
export async function invitedWaiting(): Promise<number> {
  return (await signUpStore().list()).filter((s) => s.status === "pending" && s.invitedBy).length;
}
