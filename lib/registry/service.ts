/**
 * lib/registry/service.ts — loan officers sign themselves up (D45).
 * SERVER-ONLY.
 *
 * 1. A loan officer fills in /sign-up: who they are, their NMLS ID, their
 *    sponsoring company and its NMLS ID and address, every state they're
 *    licensed in (all 50 states and DC), their links, and two statements.
 * 2. They confirm their email with a link (24 hours).
 * 3. The owner checks their NMLS record by hand (RETR can do this later)
 *    and approves on /mlo/signups. Approval is refused when their sponsor
 *    doesn't allow client contacts in an outside system.
 * 4. Approval makes their loan officer record (kept here, not in the code),
 *    creates their account and emails their sign-in link.
 *
 * Nothing here ever fetches NMLS Consumer Access: its terms forbid
 * automated lookups. The reviewer opens the link themselves.
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { inviteUser } from "@/lib/accounts/auth";
import { incr } from "@/lib/m8/kv";
import { US_STATES } from "@/lib/us-states";
import { resendMail, reportInbox, type Mailer } from "@/lib/pilot/service";
import { refreshRegistry, nmlsRecordUrl } from "./cache";
import { signUpStore, type SignUp, type SignUpLicense } from "./store";

export const CONFIRM_TTL_MS = 24 * 3_600_000;
export const STATE_CODES = US_STATES.map((s) => s.code);

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const iso = (n: number) => new Date(n).toISOString();
const https = z.string().trim().max(300).refine((v) => v === "" || /^https:\/\/[^\s<>"]+$/.test(v), "Links must start with https://");

export const SignUpInput = z.object({
  name: z.string().trim().min(3, "Enter your full name as it appears on your NMLS record.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  phone: z.string().trim().max(30).transform((v) => v.replace(/\D/g, "")).refine((v) => v === "" || v.length === 10 || (v.length === 11 && v.startsWith("1")), "Enter a 10-digit phone number."),
  nmls: z.string().trim().regex(/^\d{1,10}$/, "Your NMLS ID is the number on your NMLS record (digits only)."),
  sponsorName: z.string().trim().min(2, "Enter your sponsoring company's name.").max(120),
  sponsorNmls: z.string().trim().regex(/^\d{1,10}$/, "Enter your sponsoring company's NMLS ID (digits only)."),
  sponsorAddress: z.string().trim().min(8, "Enter your sponsoring company's mailing address. It goes in your email footer, as the law asks.").max(200),
  licenses: z.array(z.object({ state: z.enum(STATE_CODES as [string, ...string[]]), license: z.string().trim().max(40) })).min(1, "Pick at least one state you're licensed in.").max(60),
  calendly: https,
  applicationUrl: https,
  heardFrom: z.string().trim().max(120),
  sponsorAllows: z.enum(["yes", "no"], { message: "Tell us whether your sponsoring company allows this." }),
  attest: z.literal(true, { message: "Confirm your details are accurate and you hold the licenses you listed." }),
});
export type SignUpForm = z.input<typeof SignUpInput>;

/** Reads the sign-up form (one checkbox and one license box per state). */
export function formToInput(fd: FormData): SignUpForm {
  const licenses: SignUpLicense[] = STATE_CODES.filter((c) => fd.get(`st_${c}`) === "on").map((c) => ({ state: c, license: String(fd.get(`lic_${c}`) ?? "") }));
  const s = (k: string) => String(fd.get(k) ?? "");
  return { name: s("name"), email: s("email"), phone: s("phone"), nmls: s("nmls"), sponsorName: s("sponsorName"), sponsorNmls: s("sponsorNmls"), sponsorAddress: s("sponsorAddress"), licenses, calendly: s("calendly"), applicationUrl: s("applicationUrl"), heardFrom: s("heardFrom"), sponsorAllows: s("sponsorAllows") as "yes" | "no", attest: (fd.get("attest") === "on") as true };
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

/** Step 1. The answer never reveals whether the email already has an account. */
export async function submitSignUp(form: SignUpForm, origin: string, ipHash: string, now = Date.now(), send: Mailer = resendMail): Promise<SubmitResult> {
  const parsed = SignUpInput.safeParse(form);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const v = parsed.data;
  const hour = Math.floor(now / 3_600_000);
  const [byIp, byEmail] = await Promise.all([incr(`cc:signup:ip:${ipHash}:${hour}`, 3700), incr(`cc:signup:em:${sha(v.email).slice(0, 24)}:${hour}`, 3700)]);
  if (byIp > 5 || byEmail > 3) return { ok: false, error: "Too many sign-ups from here in an hour. Try again later." };

  if (await accountStore().userByEmail(v.email)) {
    await send({ to: v.email, subject: "You already have a LoanM8 Command Center account", text: `Someone (hopefully you) tried to sign up with this email, but it already has an account. Sign in here instead:\n\n${origin}/sign-in\n\nIf this wasn't you, you can ignore this email.` }).catch(() => false);
    return { ok: true };
  }
  const earlier = await signUpStore().byEmail(v.email);
  const open = earlier.find((s) => s.status === "pending");
  if (open) {
    await send({ to: v.email, subject: "Your LoanM8 Command Center sign-up is being reviewed", text: `We already have your sign-up from ${open.createdAt.slice(0, 10)} and it's waiting for review. You'll get an email when it's done.` }).catch(() => false);
    return { ok: true };
  }
  const t = token();
  const prior = earlier.find((s) => s.status === "unconfirmed");
  const record: SignUp = {
    id: prior?.id ?? `s_${randomBytes(9).toString("hex")}`,
    status: "unconfirmed",
    createdAt: iso(now),
    confirmedAt: null,
    decidedAt: null,
    decidedBy: null,
    note: "",
    name: v.name,
    email: v.email,
    phone: v.phone ? v.phone.slice(-10) : "",
    nmls: v.nmls,
    sponsorName: v.sponsorName,
    sponsorNmls: v.sponsorNmls,
    sponsorAddress: v.sponsorAddress,
    licenses: [...new Map(v.licenses.map((l) => [l.state, l])).values()],
    calendly: v.calendly,
    applicationUrl: v.applicationUrl,
    heardFrom: v.heardFrom,
    sponsorAllows: v.sponsorAllows === "yes",
    confirmHash: sha(t),
    confirmExpires: iso(now + CONFIRM_TTL_MS),
    mloId: null,
    userId: null,
    verifiedBy: null,
    verifiedAt: null,
  };
  await signUpStore().put(record);
  await send({ to: v.email, subject: "Confirm your email for LoanM8 Command Center", text: `Thanks for signing up for LoanM8 Command Center. Confirm your email here:\n\n${origin}/sign-up/confirm?t=${encodeURIComponent(t)}\n\nThe link works for 24 hours. After that, a person checks your NMLS record and you'll get an email when your account is ready. If you didn't sign up, ignore this email.` }).catch(() => false);
  return { ok: true };
}

/** Step 2. The confirm link: the sign-up joins the review queue and the owner is told. */
export async function confirmSignUp(rawToken: string, origin: string, now = Date.now(), send: Mailer = resendMail): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const s = rawToken ? await signUpStore().byConfirm(sha(rawToken)) : null;
  if (!s) return { ok: false, error: "That link isn't valid. It may have been used already." };
  if (s.status !== "unconfirmed") return { ok: true, name: s.name };
  if (!s.confirmExpires || Date.parse(s.confirmExpires) < now) return { ok: false, error: "That link has expired. Sign up again and we'll send a new one." };
  await signUpStore().put({ ...s, status: "pending", confirmedAt: iso(now), confirmHash: null, confirmExpires: null });
  const to = reportInbox();
  if (to) {
    await send({
      to,
      replyTo: s.email,
      subject: `New loan officer sign-up: ${s.name}, NMLS ${s.nmls}`,
      text: [
        `${s.name} (${s.email}) signed up for Command Center and confirmed their email.`,
        ``,
        `NMLS ID: ${s.nmls}`,
        `Sponsoring company: ${s.sponsorName}, NMLS ${s.sponsorNmls}`,
        `Licensed in: ${s.licenses.map((l) => l.state).join(", ")}`,
        `Their sponsor allows client contacts in an outside system: ${s.sponsorAllows ? "yes" : "NO"}`,
        ``,
        `Check their NMLS record: ${nmlsRecordUrl(s.nmls)}`,
        `Review and approve: ${origin}/mlo/signups`,
      ].join("\n"),
    }).catch(() => false);
  }
  return { ok: true, name: s.name };
}

const ownerOnly = (u: User) => u.status === "active" && u.role === "owner";

export async function listSignUps(actor: User): Promise<SignUp[]> {
  if (!ownerOnly(actor)) return [];
  return signUpStore().list();
}

/** Step 3. A person checked the NMLS record; this makes the record and the account. */
export async function approveSignUp(actor: User, id: string, checked: boolean, origin: string, now = Date.now()): Promise<{ ok: true; emailed: boolean } | { ok: false; error: string }> {
  if (!ownerOnly(actor)) return { ok: false, error: "Only the owner can approve sign-ups." };
  const s = await signUpStore().get(id);
  if (!s || s.status !== "pending") return { ok: false, error: "That sign-up isn't waiting for review." };
  if (!s.sponsorAllows) return { ok: false, error: "Their sponsoring company doesn't allow client contacts in an outside system. Talk to the company about a company-wide plan instead." };
  if (!checked) return { ok: false, error: "Open their NMLS record and confirm it matches before approving." };
  if (await accountStore().userByEmail(s.email)) return { ok: false, error: "That email already has an account." };
  const approved: SignUp = { ...s, status: "approved", decidedAt: iso(now), decidedBy: actor.email, mloId: `mlo-s${s.id.slice(2, 12)}`, verifiedBy: "human", verifiedAt: iso(now) };
  await signUpStore().put(approved);
  await refreshRegistry();
  const r = await inviteUser(actor, { email: s.email, name: s.name, role: "lo", mloId: approved.mloId }, origin, now);
  if (!r.ok) {
    await signUpStore().put(s);
    await refreshRegistry();
    return { ok: false, error: r.error };
  }
  const user = await accountStore().userByEmail(s.email);
  await signUpStore().put({ ...approved, userId: user?.id ?? null });
  await accountStore().audit({ at: iso(now), actor: actor.email, action: "signup.approve", detail: { signupId: id, mloId: approved.mloId, verifiedBy: "human" } });
  return { ok: true, emailed: r.emailed };
}

export async function declineSignUp(actor: User, id: string, rawNote: string, now = Date.now(), send: Mailer = resendMail): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ownerOnly(actor)) return { ok: false, error: "Only the owner can decline sign-ups." };
  const s = await signUpStore().get(id);
  if (!s || s.status !== "pending") return { ok: false, error: "That sign-up isn't waiting for review." };
  const note = String(rawNote ?? "").trim().slice(0, 1000);
  await signUpStore().put({ ...s, status: "declined", decidedAt: iso(now), decidedBy: actor.email, note });
  await accountStore().audit({ at: iso(now), actor: actor.email, action: "signup.decline", detail: { signupId: id } });
  await send({ to: s.email, replyTo: actor.email, subject: "Your LoanM8 Command Center sign-up", text: `Thanks for signing up for LoanM8 Command Center. We couldn't approve it this time.${note ? `\n\n${note}` : ""}\n\nReply to this email with any questions.` }).catch(() => false);
  return { ok: true };
}

/** The sign-up behind a signed-up loan officer's record (null for loan officers in the code file). */
export async function signUpFor(user: User): Promise<SignUp | null> {
  if (!user.mloId?.startsWith("mlo-s")) return null;
  const all = await signUpStore().list("approved");
  return all.find((s) => s.mloId === user.mloId) ?? null;
}

const Links = z.object({ calendly: https, applicationUrl: https, phone: SignUpInput.shape.phone });

/** A signed-up loan officer keeps their own links and phone current. Licensing changes go through review. */
export async function updateOwnLinks(user: User, input: { calendly: string; applicationUrl: string; phone: string }, now = Date.now()): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await signUpFor(user);
  if (!s) return { ok: false, error: "Your details are set by the owner. Report a problem to change them." };
  const p = Links.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the links." };
  await signUpStore().put({ ...s, calendly: p.data.calendly, applicationUrl: p.data.applicationUrl, phone: p.data.phone ? p.data.phone.slice(-10) : "" });
  await refreshRegistry();
  await accountStore().audit({ at: iso(now), actor: user.email, action: "signup.links", detail: { mloId: user.mloId } });
  return { ok: true };
}
