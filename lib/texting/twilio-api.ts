/**
 * lib/texting/twilio-api.ts — the Twilio calls that register a company for
 * business texting (D56). SERVER-ONLY. Plain REST, no client library.
 *
 * Call names and fields follow Twilio's published OpenAPI definitions
 * (twilio/twilio-oai: trusthub v1, messaging v1, api 2010-04-01). The
 * Trust Hub form fields can change, so before submitting, preflight() asks
 * Twilio for the current fields of each form and the two policies, and
 * stops with a plain message if anything Command Center sends is unknown.
 */
const API = "https://api.twilio.com/2010-04-01";
const HUB = "https://trusthub.twilio.com/v1";
const MSG = "https://messaging.twilio.com/v1";

const env = (k: string) => process.env[k]?.trim() || undefined;

/** Trust Hub policies: the ISV's secondary customer profile, and the A2P messaging profile. */
export const POLICY_SECONDARY = () => env("TWILIO_POLICY_SECONDARY_PROFILE") ?? "RNdfbf3fae0e1107f8aded0e7cead80bf5";
export const POLICY_A2P = () => env("TWILIO_POLICY_A2P_PROFILE") ?? "RNb0d4771c2c98518d916a3d4cd70a8f8b";

export type Creds = { sid: string; token: string };
export type Form = Record<string, string | string[] | boolean | undefined | null>;

export class TwilioError extends Error {
  constructor(
    public status: number,
    public code: number | null,
    message: string,
  ) {
    super(message);
    this.name = "TwilioError";
  }
}

let fetcher: typeof fetch = (...a) => fetch(...a);
export const setTwilioFetchForTests = (f: typeof fetch | null) => void (fetcher = f ?? ((...a) => fetch(...a)));

const authOf = (c: Creds) => `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString("base64")}`;

export function encodeForm(form: Form): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.append(k, typeof v === "boolean" ? String(v) : v);
  }
  return p;
}

async function call<T = Record<string, unknown>>(method: "GET" | "POST", url: string, creds: Creds, form?: Form): Promise<T> {
  const res = await fetcher(url, {
    method,
    headers: { Authorization: authOf(creds), ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? encodeForm(form) : undefined,
    cache: "no-store",
  });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new TwilioError(res.status, typeof out.code === "number" ? out.code : null, String(out.message ?? `Twilio answered ${res.status}`).slice(0, 300));
  return out as T;
}

type Sid = { sid: string };

// ---- Accounts ----

/** A subaccount for one company, under the platform's account. Returns its SID and auth token. */
export async function createSubaccount(parent: Creds, friendlyName: string): Promise<Creds> {
  const a = await call<{ sid: string; auth_token: string }>("POST", `${API}/Accounts.json`, parent, { FriendlyName: friendlyName.slice(0, 64) });
  return { sid: a.sid, token: a.auth_token };
}

export async function subaccountToken(parent: Creds, sid: string): Promise<string> {
  const a = await call<{ auth_token: string }>("GET", `${API}/Accounts/${sid}.json`, parent);
  return a.auth_token;
}

// ---- Trust Hub ----

export const createCustomerProfile = (c: Creds, name: string, email: string) => call<Sid>("POST", `${HUB}/CustomerProfiles`, c, { FriendlyName: name, Email: email, PolicySid: POLICY_SECONDARY() });
export const createEndUser = (c: Creds, name: string, type: string, attributes: Record<string, unknown>) => call<Sid>("POST", `${HUB}/EndUsers`, c, { FriendlyName: name, Type: type, Attributes: JSON.stringify(attributes) });
export const createSupportingDocument = (c: Creds, name: string, type: string, attributes: Record<string, unknown>) => call<Sid>("POST", `${HUB}/SupportingDocuments`, c, { FriendlyName: name, Type: type, Attributes: JSON.stringify(attributes) });
export const assignToProfile = (c: Creds, profile: string, objectSid: string) => call<Sid>("POST", `${HUB}/CustomerProfiles/${profile}/EntityAssignments`, c, { ObjectSid: objectSid });
export const evaluateProfile = (c: Creds, profile: string) => call<{ status: string; results?: unknown }>("POST", `${HUB}/CustomerProfiles/${profile}/Evaluations`, c, { PolicySid: POLICY_SECONDARY() });
export const submitProfile = (c: Creds, profile: string) => call<{ status: string }>("POST", `${HUB}/CustomerProfiles/${profile}`, c, { Status: "pending-review" });
export const getProfile = (c: Creds, profile: string) => call<{ status: string }>("GET", `${HUB}/CustomerProfiles/${profile}`, c);

export const createTrustProduct = (c: Creds, name: string, email: string) => call<Sid>("POST", `${HUB}/TrustProducts`, c, { FriendlyName: name, Email: email, PolicySid: POLICY_A2P() });
export const assignToTrustProduct = (c: Creds, product: string, objectSid: string) => call<Sid>("POST", `${HUB}/TrustProducts/${product}/EntityAssignments`, c, { ObjectSid: objectSid });
export const evaluateTrustProduct = (c: Creds, product: string) => call<{ status: string; results?: unknown }>("POST", `${HUB}/TrustProducts/${product}/Evaluations`, c, { PolicySid: POLICY_A2P() });
export const submitTrustProduct = (c: Creds, product: string) => call<{ status: string }>("POST", `${HUB}/TrustProducts/${product}`, c, { Status: "pending-review" });

/** The company's business address, in the account that will own the number. */
export function createAddress(c: Creds, a: { name: string; street: string; city: string; state: string; zip: string }) {
  return call<Sid>("POST", `${API}/Accounts/${c.sid}/Addresses.json`, c, { CustomerName: a.name, Street: a.street, City: a.city, Region: a.state, PostalCode: a.zip, IsoCountry: "US" });
}

/** The field names Twilio currently expects for each kind of form, and whether the two policies exist. */
export async function preflight(c: Creds, sent: Record<string, string[]>): Promise<string[]> {
  const problems: string[] = [];
  const types = await call<{ end_user_types?: { machine_name: string; fields?: { machine_name?: string }[] }[] }>("GET", `${HUB}/EndUserTypes?PageSize=100`, c);
  for (const [type, keys] of Object.entries(sent)) {
    const t = types.end_user_types?.find((x) => x.machine_name === type);
    if (!t) {
      problems.push(`Twilio no longer has the "${type}" form.`);
      continue;
    }
    const known = new Set((t.fields ?? []).map((f) => f.machine_name).filter(Boolean));
    const unknown = known.size ? keys.filter((k) => !known.has(k)) : [];
    if (unknown.length) problems.push(`Twilio's "${type}" form no longer has: ${unknown.join(", ")}.`);
  }
  for (const p of [POLICY_SECONDARY(), POLICY_A2P()]) {
    try {
      await call("GET", `${HUB}/Policies/${p}`, c);
    } catch {
      problems.push(`Twilio policy ${p} wasn't found.`);
    }
  }
  return problems;
}

// ---- Brand, Messaging Service, number, campaign ----

export const createBrand = (c: Creds, profile: string, a2p: string) => call<{ sid: string; status: string }>("POST", `${MSG}/a2p/BrandRegistrations`, c, { CustomerProfileBundleSid: profile, A2PProfileBundleSid: a2p, BrandType: "STANDARD" });
export const getBrand = (c: Creds, brand: string) => call<{ status: string; errors?: { description?: string }[]; failure_reason?: string | null }>("GET", `${MSG}/a2p/BrandRegistrations/${brand}`, c);

export const createService = (c: Creds, name: string, inbound: string, status: string) =>
  call<Sid>("POST", `${MSG}/Services`, c, { FriendlyName: name.slice(0, 64), InboundRequestUrl: inbound, InboundMethod: "POST", StatusCallback: status, StickySender: true, SmartEncoding: true, UseInboundWebhookOnNumber: false });

/** The first local number with texting in the area code (or nearby when none). */
export async function buyNumber(c: Creds, areaCode: string): Promise<{ sid: string; phone: string }> {
  const search = async (q: string) => (await call<{ available_phone_numbers?: { phone_number: string }[] }>("GET", `${API}/Accounts/${c.sid}/AvailablePhoneNumbers/US/Local.json?${q}&SmsEnabled=true&VoiceEnabled=true&PageSize=5`, c)).available_phone_numbers ?? [];
  const found = (await search(`AreaCode=${encodeURIComponent(areaCode)}`))[0] ?? (await search("")).at(0);
  if (!found) throw new TwilioError(404, null, "No numbers with texting were available.");
  const n = await call<{ sid: string; phone_number: string }>("POST", `${API}/Accounts/${c.sid}/IncomingPhoneNumbers.json`, c, { PhoneNumber: found.phone_number });
  return { sid: n.sid, phone: n.phone_number };
}
export const attachNumber = (c: Creds, service: string, numberSid: string) => call<Sid>("POST", `${MSG}/Services/${service}/PhoneNumbers`, c, { PhoneNumberSid: numberSid });

export type Campaign = {
  description: string;
  messageFlow: string;
  samples: string[];
  helpMessage: string;
  optOutMessage: string;
  privacyUrl: string;
};
export const createCampaign = (c: Creds, service: string, brand: string, k: Campaign) =>
  call<{ sid: string; campaign_status?: string }>("POST", `${MSG}/Services/${service}/Compliance/Usa2p`, c, {
    BrandRegistrationSid: brand,
    Description: k.description,
    MessageFlow: k.messageFlow,
    MessageSamples: k.samples,
    UsAppToPersonUsecase: "CUSTOMER_CARE",
    HasEmbeddedLinks: true,
    HasEmbeddedPhone: true,
    DirectLending: true,
    AgeGated: false,
    HelpMessage: k.helpMessage,
    OptOutMessage: k.optOutMessage,
    HelpKeywords: ["HELP", "INFO"],
    OptOutKeywords: ["STOP", "QUIT", "END", "CANCEL", "UNSUBSCRIBE", "REVOKE", "OPTOUT"],
    PrivacyPolicyUrl: k.privacyUrl,
  });
export const getCampaign = (c: Creds, service: string, campaign: string) => call<{ campaign_status?: string; errors?: { description?: string; error_code?: number }[] }>("GET", `${MSG}/Services/${service}/Compliance/Usa2p/${campaign}`, c);
