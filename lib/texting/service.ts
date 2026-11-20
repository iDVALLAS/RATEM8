/**
 * lib/texting/service.ts — Command Center sets up business texting for each
 * sponsoring company (D56). SERVER-ONLY.
 *
 * Carriers require every company that texts its clients to register a
 * "brand" (the company, with its EIN) and a "campaign" (what it texts and how
 * people agreed to it) — 10DLC. Before this, the owner did it by hand in the
 * Twilio Console for each company (D23). Now:
 *  1. A loan officer (or the owner) fills in the company's details once, on
 *     "Texting for your company", and confirms they may register it.
 *  2. The platform owner approves (the registration has fees), unless it's
 *     their own request.
 *  3. Command Center does the rest, step by step: a Twilio subaccount for
 *     the company (its numbers, opt-outs and costs kept apart), its business
 *     profile, the A2P messaging profile, the brand, a Messaging Service
 *     pointed at Command Center, a local number, and the campaign (Customer
 *     Care first: mortgage marketing campaigns are often refused, and a
 *     refusal is final). Steps that wait on the carriers are checked again
 *     each morning, or with "Check now".
 *  4. When the campaign is approved, the company's texts go from its own
 *     number. Until then texting stays off for it, and nothing goes out under
 *     another company's registration.
 * Every step is saved as it finishes, so a failure picks up where it left off.
 */
import { z } from "zod";
import type { User } from "@/lib/accounts/store";
import { accountStore } from "@/lib/accounts/store";
import { CONFIG, mloById } from "@/lib/config";
import { companyDetails, companyOfMlo } from "@/lib/accounts/company";
import { toE164 } from "@/lib/contacts/normalize";
import { seal, unseal } from "@/lib/mail/seal";
import { registrationWording, webhookUrls } from "@/lib/messaging/registration";
import { serviceForCompany } from "@/lib/messaging/twilio";
import { BUSINESS_TYPES, COMPANY_TYPES, JOB_POSITIONS, textingStore, type CompanyInfo, type TextingSetup } from "./store";
import * as tw from "./twilio-api";

const env = (k: string) => process.env[k]?.trim() || undefined;
const iso = (d: Date) => d.toISOString();

/** The platform's own Twilio account (it pays for every company's subaccount). */
export function parentCreds(): tw.Creds | null {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  return sid && token ? { sid, token } : null;
}

/** On with the Twilio keys and the platform's approved primary business profile (TWILIO_PRIMARY_PROFILE_SID). */
export const textSetupOn = () => !!parentCreds() && !!env("TWILIO_PRIMARY_PROFILE_SID") && env("CC_TEXT_SETUP") !== "false";

/** What the registration costs, as Twilio publishes it (approximate; shown before anyone approves). */
export const FEES = "Twilio charges about $4 to register the company and $15 to review the campaign, once; then roughly $2 to $10 a month for the campaign and about $1.15 a month for the number, plus a little under a cent per text. Check twilio.com/en-us/sms/pricing/us for today's prices.";

/** The company a loan officer's texts are registered under. */
export function companyFor(user: Pick<User, "mloId">): { company: string; name: string; address: string } | null {
  const m = mloById(user.mloId);
  const company = companyOfMlo(user.mloId);
  if (!m || !company) return null;
  const d = companyDetails(m);
  return { company, name: d.short || d.name, address: d.address };
}

// ---- The company's details ----

const httpsUrl = z.string().trim().max(200).refine((u) => /^https:\/\/[^\s/]+\.[^\s]+$/.test(u), "Use the full address, starting with https://");
export const InfoSchema = z.object({
  legalName: z.string().trim().min(2, "Enter the company's legal name, exactly as the IRS has it.").max(120),
  ein: z.string().trim().transform((s) => s.replace(/\D/g, "")).refine((s) => /^\d{9}$/.test(s), "The EIN is 9 digits."),
  businessType: z.enum(BUSINESS_TYPES, { message: "Pick the company's legal form. (A sole proprietorship can't register this way; it needs an EIN and an LLC or corporation.)" }),
  companyType: z.enum(COMPANY_TYPES),
  website: httpsUrl,
  privacyUrl: httpsUrl,
  street: z.string().trim().min(4, "Enter the street address.").max(120),
  city: z.string().trim().min(2, "Enter the city.").max(60),
  state: z.string().trim().toUpperCase().refine((s) => /^[A-Z]{2}$/.test(s), "Use the two-letter state."),
  zip: z.string().trim().refine((s) => /^\d{5}(-\d{4})?$/.test(s), "Enter a ZIP code."),
  repFirst: z.string().trim().min(1, "Enter the authorized person's first name.").max(60),
  repLast: z.string().trim().min(1, "Enter their last name.").max(60),
  repEmail: z.string().trim().toLowerCase().email("Enter their email."),
  repPhone: z.string().trim().transform((s) => toE164(s) ?? "").refine((s) => !!s, "Enter their US phone number."),
  repTitle: z.string().trim().min(2, "Enter their title.").max(60),
  repPosition: z.enum(JOB_POSITIONS),
  areaCode: z.string().trim().refine((s) => /^[2-9]\d{2}$/.test(s), "Enter a 3-digit area code for the company's number."),
});

export function readInfo(fd: FormData): Record<string, string> {
  return Object.fromEntries(Object.keys(InfoSchema.shape).map((k) => [k, String(fd.get(k) ?? "")]));
}

const blank = (company: string, name: string, info: CompanyInfo, by: string, now: Date): TextingSetup => ({
  company, companyName: name, info, status: "draft", requestedBy: by, requestedAt: iso(now), approvedBy: null, approvedAt: null,
  subaccountSid: null, subaccountTokenSealed: null, customerProfileSid: null, businessEndUserSid: null, repEndUserSid: null, addressSid: null, addressDocSid: null,
  primaryAssigned: false, profileSubmitted: false, trustProductSid: null, messagingEndUserSid: null, trustProductSubmitted: false,
  brandSid: null, brandStatus: null, serviceSid: null, phoneNumber: null, phoneNumberSid: null, numberAttached: false, campaignSid: null, campaignStatus: null,
  step: "", error: "", failures: 0, checkedAt: null, liveAt: null, log: [],
});

const note = (s: TextingSetup, text: string, now: Date) => {
  s.log = [...s.log, { at: iso(now), text }].slice(-40);
};

export type Mailer = (m: { to: string; subject: string; text: string }) => Promise<boolean>;

/**
 * Saves the company's details. With `submit`, sends them on: the owner's own
 * request starts right away; anyone else's waits for the owner (fees).
 */
export async function saveInfo(user: User, raw: Record<string, string>, submit: boolean, attest: boolean, now: Date, mail: Mailer): Promise<{ ok: true; setup: TextingSetup } | { ok: false; error: string }> {
  const co = companyFor(user);
  if (!co) return { ok: false, error: "Your account isn't linked to a loan officer record with a sponsoring company." };
  const parsed = InfoSchema.safeParse(raw);
  const cur = await textingStore().get(co.company);
  if (!parsed.success) {
    // Keep what they typed, so fixing one field doesn't mean typing the form again. It's re-checked before anything is sent.
    if (!cur || cur.status === "draft") {
      const keep = Object.fromEntries(Object.keys(InfoSchema.shape).map((k) => [k, String(raw[k] ?? "").slice(0, 200)])) as unknown as CompanyInfo;
      await textingStore().put(cur ? { ...cur, info: keep } : blank(co.company, co.name, keep, user.email, now));
    }
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  }
  if (cur && !["draft", "review", "attention", "stopped"].includes(cur.status)) return { ok: false, error: "This company's registration is already under way; its details can't change now." };
  if (submit && !attest) return { ok: false, error: `Confirm that you're allowed to register ${co.name} for business texting.` };
  const s = cur ? { ...cur, info: parsed.data as CompanyInfo, companyName: co.name } : blank(co.company, co.name, parsed.data as CompanyInfo, user.email, now);
  const isOwner = user.role === "owner";
  if (submit) {
    s.requestedBy = user.email;
    s.requestedAt = iso(now);
    s.error = "";
    s.failures = 0;
    if (isOwner) {
      s.status = "working";
      s.approvedBy = user.email;
      s.approvedAt = iso(now);
      note(s, `Started by ${user.email}.`, now);
    } else {
      s.status = "review";
      note(s, `Sent for approval by ${user.email}.`, now);
      const owner = env("MLO_OWNER_EMAIL");
      if (owner) await mail({ to: owner, subject: `Texting setup to approve: ${co.name}`, text: `${user.name || user.email} asked to register ${co.name} for business texting.\n\n${FEES}\n\nReview and approve: ${CONFIG.siteUrl.replace(/\/$/, "")}/mlo/texting\n\nMLO Command Center` }).catch(() => false);
    }
  }
  await textingStore().put(s);
  await accountStore().audit({ at: iso(now), actor: user.email, action: submit ? "texting.request" : "texting.save", detail: { company: co.company } });
  return { ok: true, setup: s };
}

/** The platform owner approves the fees; registration starts. */
export async function approveSetup(owner: User, company: string, now: Date): Promise<boolean> {
  if (owner.role !== "owner") return false;
  const s = await textingStore().get(company);
  if (!s || s.status !== "review") return false;
  s.status = "working";
  s.approvedBy = owner.email;
  s.approvedAt = iso(now);
  note(s, `Approved by ${owner.email}.`, now);
  await textingStore().put(s);
  await accountStore().audit({ at: iso(now), actor: owner.email, action: "texting.approve", detail: { company } });
  return true;
}

/** Stops texting for a company (its Twilio pieces stay; turning it back on resumes). */
export async function stopSetup(owner: User, company: string, now: Date): Promise<boolean> {
  if (owner.role !== "owner") return false;
  const s = await textingStore().get(company);
  if (!s) return false;
  s.status = s.status === "stopped" ? (s.campaignStatus === "VERIFIED" ? "live" : s.approvedAt ? "working" : "draft") : "stopped";
  note(s, `${s.status === "stopped" ? "Stopped" : "Turned back on"} by ${owner.email}.`, now);
  await textingStore().put(s);
  await accountStore().audit({ at: iso(now), actor: owner.email, action: "texting.stop", detail: { company, status: s.status } });
  return true;
}

// ---- Doing the steps ----

/** Collects every failure reason in Twilio's evaluation result. */
function reasons(results: unknown): string {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (o.passed === false && typeof o.failure_reason === "string") out.push(o.failure_reason);
      Object.values(o).forEach(walk);
    }
  };
  walk(results);
  return [...new Set(out)].slice(0, 4).join(" ") || "Twilio says the details don't meet its rules.";
}

class NeedsPerson extends Error {}

/** The campaign wording, from the same text the owner saw on Texting setup (D23). */
export function campaignFor(s: TextingSetup) {
  const w = registrationWording({ name: s.companyName, idLabel: "NMLS", idNumber: s.company });
  return {
    description: w.description,
    messageFlow: w.optIn,
    samples: w.samples.filter((x) => x.length >= 20).slice(0, 5),
    helpMessage: w.help,
    optOutMessage: w.optOutConfirmation,
    privacyUrl: s.info.privacyUrl,
  };
}

export const businessAttributes = (i: CompanyInfo) => ({
  business_name: i.legalName,
  business_identity: "direct_customer",
  business_type: i.businessType,
  business_industry: "FINANCIAL",
  business_registration_identifier: "EIN",
  business_registration_number: i.ein,
  business_regions_of_operation: "USA_AND_CANADA",
  website_url: i.website,
});
export const repAttributes = (i: CompanyInfo) => ({ first_name: i.repFirst, last_name: i.repLast, email: i.repEmail, phone_number: i.repPhone, business_title: i.repTitle, job_position: i.repPosition });
export const messagingAttributes = (i: CompanyInfo) => ({ company_type: i.companyType });

/**
 * Moves one company's registration as far as it can go right now. Safe to
 * call any time; finished steps are skipped.
 */
export async function advance(company: string, now: Date, mail: Mailer): Promise<TextingSetup | null> {
  const s = await textingStore().get(company);
  if (!s || s.status !== "working") return s;
  const parent = parentCreds();
  const primary = env("TWILIO_PRIMARY_PROFILE_SID");
  const save = () => textingStore().put(s);
  s.checkedAt = iso(now);
  let step = "start";
  try {
    if (!parent || !primary) throw new NeedsPerson("Twilio isn't fully set up for the platform (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PRIMARY_PROFILE_SID).");
    const i = s.info;
    const name = `${s.companyName} (NMLS ${s.company})`;

    step = "subaccount";
    if (!s.subaccountSid) {
      const sub = await tw.createSubaccount(parent, `MLO CC ${s.companyName}`.slice(0, 64));
      s.subaccountSid = sub.sid;
      s.subaccountTokenSealed = seal(sub.token);
      note(s, "Made the company's own Twilio subaccount.", now);
      await save();
    }
    const sub: tw.Creds = { sid: s.subaccountSid, token: unseal(s.subaccountTokenSealed) ?? (await tw.subaccountToken(parent, s.subaccountSid)) };

    step = "check";
    if (!s.customerProfileSid) {
      const problems = await tw.preflight(sub, { customer_profile_business_information: Object.keys(businessAttributes(i)), authorized_representative_1: Object.keys(repAttributes(i)), us_a2p_messaging_profile_information: Object.keys(messagingAttributes(i)) });
      if (problems.length) throw new NeedsPerson(`Twilio's registration forms changed, so nothing was submitted: ${problems.join(" ")} Command Center needs an update.`);
    }

    step = "profile";
    if (!s.customerProfileSid) {
      s.customerProfileSid = (await tw.createCustomerProfile(sub, name, i.repEmail)).sid;
      await save();
    }
    if (!s.businessEndUserSid) {
      const eu = await tw.createEndUser(sub, `${name} business`, "customer_profile_business_information", businessAttributes(i));
      await tw.assignToProfile(sub, s.customerProfileSid, eu.sid);
      s.businessEndUserSid = eu.sid;
      await save();
    }
    if (!s.repEndUserSid) {
      const eu = await tw.createEndUser(sub, `${name} representative`, "authorized_representative_1", repAttributes(i));
      await tw.assignToProfile(sub, s.customerProfileSid, eu.sid);
      s.repEndUserSid = eu.sid;
      await save();
    }
    if (!s.addressSid) {
      s.addressSid = (await tw.createAddress(sub, { name: i.legalName, street: i.street, city: i.city, state: i.state, zip: i.zip })).sid;
      await save();
    }
    if (!s.addressDocSid) {
      const doc = await tw.createSupportingDocument(sub, `${name} address`, "customer_profile_address", { address_sids: s.addressSid });
      await tw.assignToProfile(sub, s.customerProfileSid, doc.sid);
      s.addressDocSid = doc.sid;
      await save();
    }
    if (!s.primaryAssigned) {
      await tw.assignToProfile(sub, s.customerProfileSid, primary);
      s.primaryAssigned = true;
      await save();
    }
    if (!s.profileSubmitted) {
      const ev = await tw.evaluateProfile(sub, s.customerProfileSid);
      if (ev.status !== "compliant") throw new NeedsPerson(`Twilio found a problem with the business details: ${reasons(ev.results)}`);
      await tw.submitProfile(sub, s.customerProfileSid);
      s.profileSubmitted = true;
      note(s, "Sent the business profile to Twilio for review.", now);
      await save();
    }

    step = "messaging-profile";
    if (!s.trustProductSid) {
      s.trustProductSid = (await tw.createTrustProduct(sub, `${name} A2P`, i.repEmail)).sid;
      await save();
    }
    if (!s.messagingEndUserSid) {
      const eu = await tw.createEndUser(sub, `${name} messaging profile`, "us_a2p_messaging_profile_information", messagingAttributes(i));
      await tw.assignToTrustProduct(sub, s.trustProductSid, eu.sid);
      await tw.assignToTrustProduct(sub, s.trustProductSid, s.customerProfileSid);
      s.messagingEndUserSid = eu.sid;
      await save();
    }
    if (!s.trustProductSubmitted) {
      const ev = await tw.evaluateTrustProduct(sub, s.trustProductSid);
      if (ev.status !== "compliant") throw new NeedsPerson(`Twilio found a problem with the messaging profile: ${reasons(ev.results)}`);
      await tw.submitTrustProduct(sub, s.trustProductSid);
      s.trustProductSubmitted = true;
      note(s, "Sent the messaging profile to Twilio for review.", now);
      await save();
    }

    step = "service";
    if (!s.serviceSid) {
      const hooks = webhookUrls(CONFIG.siteUrl.replace(/\/$/, ""));
      s.serviceSid = (await tw.createService(sub, `${s.companyName} client texts`, hooks.inbound, hooks.status)).sid;
      await save();
    }
    step = "number";
    if (!s.phoneNumberSid) {
      const n = await tw.buyNumber(sub, i.areaCode);
      s.phoneNumberSid = n.sid;
      s.phoneNumber = n.phone;
      note(s, `Got the company's texting number, ${n.phone}.`, now);
      await save();
    }
    if (!s.numberAttached) {
      await tw.attachNumber(sub, s.serviceSid, s.phoneNumberSid);
      s.numberAttached = true;
      await save();
    }

    step = "brand";
    if (!s.brandSid) {
      const profile = await tw.getProfile(sub, s.customerProfileSid);
      if (profile.status === "twilio-rejected") throw new NeedsPerson("Twilio turned down the business profile. Check the legal name, EIN and address match the IRS record exactly, then send it again.");
      const b = await tw.createBrand(sub, s.customerProfileSid, s.trustProductSid);
      s.brandSid = b.sid;
      s.brandStatus = b.status;
      note(s, "Registered the company with the carriers (the brand). This usually takes a few days.", now);
      await save();
    }
    const brand = await tw.getBrand(sub, s.brandSid);
    s.brandStatus = brand.status;
    if (brand.status === "FAILED" || brand.status === "SUSPENDED") throw new NeedsPerson(`The carriers didn't accept the company (${brand.status.toLowerCase()}): ${(brand.errors ?? []).map((e) => e.description).filter(Boolean).join(" ") || brand.failure_reason || "no reason given"}`);
    if (brand.status !== "APPROVED") {
      s.step = "brand";
      s.error = "";
      s.failures = 0;
      await save();
      return s;
    }

    step = "campaign";
    if (!s.campaignSid) {
      const k = await tw.createCampaign(sub, s.serviceSid, s.brandSid, campaignFor(s));
      s.campaignSid = k.sid;
      s.campaignStatus = k.campaign_status ?? "IN_PROGRESS";
      note(s, "Sent the texting campaign (Customer Care) for review. This usually takes one to three weeks.", now);
      await save();
    }
    const k = await tw.getCampaign(sub, s.serviceSid, s.campaignSid);
    s.campaignStatus = k.campaign_status ?? s.campaignStatus;
    if (s.campaignStatus === "FAILED") throw new NeedsPerson(`The carriers didn't accept the campaign: ${(k.errors ?? []).map((e) => e.description).filter(Boolean).join(" ") || "no reason given"}`);
    if (s.campaignStatus !== "VERIFIED") {
      s.step = "campaign";
      s.error = "";
      s.failures = 0;
      await save();
      return s;
    }

    s.status = "live";
    s.liveAt = iso(now);
    s.step = "";
    s.error = "";
    s.failures = 0;
    note(s, `Approved. ${s.companyName}'s texts now go from ${s.phoneNumber}.`, now);
    await save();
    await mail({ to: s.requestedBy, subject: `Texting is on for ${s.companyName}`, text: `The carriers approved ${s.companyName} for texting. Texts from Command Center now go from ${s.phoneNumber}.\n\nMLO Command Center` }).catch(() => false);
    return s;
  } catch (e) {
    const person = e instanceof NeedsPerson || (e instanceof tw.TwilioError && e.status >= 400 && e.status < 500 && e.status !== 429);
    s.step = step;
    s.error = e instanceof Error ? e.message.slice(0, 400) : "Something went wrong.";
    s.failures += 1;
    if (person || s.failures >= 5) {
      s.status = "attention";
      note(s, `Stopped at "${step}": ${s.error}`, now);
      await mail({ to: s.requestedBy, subject: `Texting setup for ${s.companyName} needs a look`, text: `Command Center stopped registering ${s.companyName} for texting.\n\n${s.error}\n\nOpen Texting for your company to fix the details and send it again: ${CONFIG.siteUrl.replace(/\/$/, "")}/mlo/text-setup\n\nMLO Command Center` }).catch(() => false);
    }
    await save();
    console.warn(`[texting] ${company} stopped at ${step}: ${e instanceof tw.TwilioError ? `${e.status} ${e.code ?? ""}` : e instanceof Error ? e.name : "error"}`);
    return s;
  }
}

/** Each morning: every registration still under way. */
export async function advanceAll(now: Date, mail: Mailer): Promise<{ checked: number; live: number }> {
  let checked = 0;
  let live = 0;
  for (const s of await textingStore().all()) {
    if (s.status !== "working") continue;
    const after = await advance(s.company, now, mail);
    checked++;
    if (after?.status === "live") live++;
  }
  return { checked, live };
}

/** "Send it again" after fixing details: back to working from the step that stopped. */
export async function retrySetup(user: User, company: string, now: Date): Promise<boolean> {
  const s = await textingStore().get(company);
  if (!s || s.status !== "attention") return false;
  if (user.role !== "owner" && companyFor(user)?.company !== company) return false;
  if (!s.approvedAt) return false;
  s.status = "working";
  s.error = "";
  s.failures = 0;
  // A refused profile has to be made again with the corrected details.
  if (!s.profileSubmitted) {
    s.customerProfileSid = s.businessEndUserSid = s.repEndUserSid = s.addressSid = s.addressDocSid = null;
    s.primaryAssigned = false;
  }
  note(s, `Sent again by ${user.email}.`, now);
  await textingStore().put(s);
  return true;
}

// ---- Sending and webhooks ----

/**
 * The Messaging Service (and the subaccount that owns it) a company's texts
 * go through: a service the owner set by hand for that company (D23) first,
 * then Command Center's registration once it's live, then the single shared
 * service while there's only one company.
 */
export async function textSender(company: string | null, single: boolean): Promise<{ service: string; account: string | null } | null> {
  const own = company ? serviceForCompany(company, false) : null;
  if (own) return { service: own, account: null };
  if (company) {
    const s = await textingStore().get(company).catch(() => null);
    if (s?.status === "live" && s.serviceSid && s.subaccountSid) return { service: s.serviceSid, account: s.subaccountSid };
  }
  const shared = serviceForCompany(null, single);
  return shared ? { service: shared, account: null } : null;
}

/** The auth token a subaccount signs its webhooks with, for a company registered here. */
export async function webhookToken(accountSid: string): Promise<string | null> {
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) return null;
  const s = await textingStore().bySubaccount(accountSid).catch(() => null);
  // Even a stopped company's replies are read, so STOP is always honored.
  return s ? unseal(s.subaccountTokenSealed) : null;
}

/** The steps, in order, and whether each is done. */
export function stepsOf(s: TextingSetup | null) {
  return [
    { label: "Details filled in and confirmed", done: !!s && s.status !== "draft" },
    { label: "Approved (the registration has fees)", done: !!s?.approvedAt },
    { label: "The company's own Twilio account", done: !!s?.subaccountSid },
    { label: "Business profile sent to Twilio", done: !!s?.profileSubmitted },
    { label: "Messaging profile sent to Twilio", done: !!s?.trustProductSubmitted },
    { label: `A texting number${s?.phoneNumber ? ` (${s.phoneNumber})` : ""}`, done: !!s?.numberAttached },
    { label: `The carriers approve the company (usually days)${s?.brandStatus && s.brandStatus !== "APPROVED" ? `: ${s.brandStatus.toLowerCase().replace(/_/g, " ")}` : ""}`, done: s?.brandStatus === "APPROVED" },
    { label: `The carriers approve the campaign (usually one to three weeks)${s?.campaignStatus && s.campaignStatus !== "VERIFIED" ? `: ${s.campaignStatus.toLowerCase().replace(/_/g, " ")}` : ""}`, done: s?.campaignStatus === "VERIFIED" },
    { label: "Texting is on", done: s?.status === "live" },
  ];
}

