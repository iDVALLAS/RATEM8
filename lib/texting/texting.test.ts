import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { companyOfMlo, setCompanyCountForTests } from "@/lib/accounts/company";
import { sendSms, twilioSignature, validTwilioRequest } from "@/lib/messaging/twilio";
import { newMemoryTextingStore, setTextingStoreForTests, textingStore } from "./store";
import { advance, advanceAll, approveSetup, campaignFor, retrySetup, saveInfo, stepsOf, textSender, webhookToken } from "./service";
import { setTwilioFetchForTests } from "./twilio-api";

const NOW = new Date("2026-11-20T18:00:00Z");
const owner: User = { id: "own", email: "owner@x.com", name: "Owner", role: "owner", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const lo: User = { ...owner, id: "lo2", email: "lo2@x.com", name: "Pat", role: "lo", mloId: "mlo-002" };
const CO = companyOfMlo("mlo-001")!;
const SUB = "AC" + "1".repeat(32);

const INFO = {
  legalName: "Example Lending LLC", ein: "12-3456789", businessType: "Limited Liability Corporation", companyType: "private", website: "https://example-lending.com", privacyUrl: "https://example-lending.com/privacy",
  street: "1 Main St", city: "Kirkland", state: "wa", zip: "98033", repFirst: "Sam", repLast: "Lee", repEmail: "sam@example-lending.com", repPhone: "(425) 821-0199", repTitle: "Managing Member", repPosition: "CEO", areaCode: "425",
};

type Call = { method: string; url: string; body: URLSearchParams; auth: string };
function fakeTwilio(state: { brand: string; campaign: string; evaluation?: string; fields?: Record<string, string[]>; fail?: (url: string) => number | null }) {
  const calls: Call[] = [];
  let n = 0;
  setTwilioFetchForTests((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: new URLSearchParams(String(init?.body ?? "")), auth: String((init?.headers as Record<string, string>)?.Authorization ?? "") });
    const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s });
    const failed = state.fail?.(url);
    if (failed) return j(failed, { code: 20500, message: "Internal error" });
    const sid = (p: string) => `${p}${String(++n).padStart(32, "0")}`;
    if (url.endsWith("/2010-04-01/Accounts.json")) return j(201, { sid: SUB, auth_token: "subtoken" });
    if (url.includes("/EndUserTypes")) {
      const f = state.fields ?? {
        customer_profile_business_information: ["business_name", "business_identity", "business_type", "business_industry", "business_registration_identifier", "business_registration_number", "business_regions_of_operation", "website_url", "social_media_profile_urls"],
        authorized_representative_1: ["first_name", "last_name", "email", "phone_number", "business_title", "job_position"],
        us_a2p_messaging_profile_information: ["company_type", "stock_exchange", "stock_ticker"],
      };
      return j(200, { end_user_types: Object.entries(f).map(([machine_name, keys]) => ({ machine_name, fields: keys.map((k) => ({ machine_name: k })) })) });
    }
    if (url.includes("/Policies/")) return j(200, { sid: "RN" });
    if (url.endsWith("/Evaluations")) return j(201, { status: state.evaluation ?? "compliant", results: [{ passed: false, failure_reason: "The EIN doesn't match the legal name." }] });
    if (method === "GET" && /\/CustomerProfiles\/BU/.test(url)) return j(200, { status: "pending-review" });
    if (url.endsWith("/CustomerProfiles") || url.endsWith("/TrustProducts")) return j(201, { sid: sid("BU") });
    if (url.endsWith("/EndUsers")) return j(201, { sid: sid("IT") });
    if (url.endsWith("/SupportingDocuments")) return j(201, { sid: sid("RD") });
    if (url.endsWith("/EntityAssignments")) return j(201, { sid: sid("BV") });
    if (/\/(CustomerProfiles|TrustProducts)\/BU\w+$/.test(url)) return j(200, { status: "pending-review" });
    if (url.endsWith("/Addresses.json")) return j(201, { sid: sid("AD") });
    if (url.endsWith("/a2p/BrandRegistrations")) return j(201, { sid: sid("BN"), status: "PENDING" });
    if (url.includes("/a2p/BrandRegistrations/")) return j(200, { status: state.brand, errors: state.brand === "FAILED" ? [{ description: "Tax ID mismatch." }] : [] });
    if (url.endsWith("/v1/Services")) return j(201, { sid: sid("MG") });
    if (url.includes("/AvailablePhoneNumbers/")) return j(200, { available_phone_numbers: [{ phone_number: "+14255550123" }] });
    if (url.endsWith("/IncomingPhoneNumbers.json")) return j(201, { sid: sid("PN"), phone_number: "+14255550123" });
    if (url.endsWith("/PhoneNumbers")) return j(201, { sid: "PN" });
    if (url.endsWith("/Compliance/Usa2p")) return j(201, { sid: sid("QE"), campaign_status: "IN_PROGRESS" });
    if (url.includes("/Compliance/Usa2p/")) return j(200, { campaign_status: state.campaign, errors: state.campaign === "FAILED" ? [{ description: "Opt-in not clear." }] : [] });
    return j(404, { message: `unexpected ${method} ${url}` });
  }) as typeof fetch);
  return calls;
}

describe("Command Center registers each company for texting (D56)", () => {
  const saved = { ...process.env };
  const mails: { to: string; subject: string; text: string }[] = [];
  const mail = async (m: { to: string; subject: string; text: string }) => (mails.push(m), true);
  beforeEach(async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC" + "0".repeat(32);
    process.env.TWILIO_AUTH_TOKEN = "parenttoken";
    process.env.TWILIO_PRIMARY_PROFILE_SID = "BU" + "9".repeat(32);
    process.env.MLO_OWNER_EMAIL = "owner@x.com";
    process.env.CC_LINK_SECRET = "test-secret";
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    for (const k of Object.keys(process.env)) if (k.startsWith("TWILIO_MESSAGING_SERVICE_SID_")) delete process.env[k];
    setAccountStoreForTests(new MemoryAccountStore());
    setTextingStoreForTests(newMemoryTextingStore());
    setCompanyCountForTests(2);
    mails.length = 0;
  });
  afterEach(() => {
    process.env = { ...saved };
    setTwilioFetchForTests(null);
    setAccountStoreForTests(null);
    setTextingStoreForTests(null);
    setCompanyCountForTests(null);
    vi.unstubAllGlobals();
  });

  it("checks the details, and a loan officer's request waits for the owner", async () => {
    expect(await saveInfo(lo, { ...INFO, ein: "123" }, true, true, NOW, mail)).toMatchObject({ ok: false, error: "The EIN is 9 digits." });
    // What they typed is kept as a draft, so one wrong field doesn't mean typing the form again.
    expect(await textingStore().get(CO)).toMatchObject({ status: "draft", info: { legalName: INFO.legalName, ein: "123" } });
    expect(await saveInfo(lo, { ...INFO, website: "example.com" }, true, true, NOW, mail)).toMatchObject({ ok: false });
    expect(await saveInfo(lo, INFO, true, false, NOW, mail)).toMatchObject({ ok: false });
    const r = await saveInfo(lo, INFO, true, true, NOW, mail);
    expect(r).toMatchObject({ ok: true, setup: { status: "review", company: CO, info: { ein: "123456789", state: "WA", repPhone: "+14258210199" } } });
    expect(mails[0]).toMatchObject({ to: "owner@x.com" });
    expect(mails[0].subject).toMatch(/^Texting setup to approve/);
    expect(await approveSetup(lo, CO, NOW)).toBe(false);
    expect(await approveSetup(owner, CO, NOW)).toBe(true);
    expect((await textingStore().get(CO))?.status).toBe("working");
  });

  it("does every Twilio step in a subaccount, waits for the carriers, then turns texting on", async () => {
    const state = { brand: "PENDING", campaign: "IN_PROGRESS" };
    const calls = fakeTwilio(state);
    await saveInfo(owner, INFO, true, true, NOW, mail);
    let s = await advance(CO, NOW, mail);
    expect(s).toMatchObject({ status: "working", step: "brand", subaccountSid: SUB, profileSubmitted: true, trustProductSubmitted: true, phoneNumber: "+14255550123", numberAttached: true, brandStatus: "PENDING", campaignSid: null });
    expect(s!.subaccountTokenSealed).not.toContain("subtoken");
    // Trust Hub and messaging calls run as the company's subaccount; the subaccount itself is made by the platform.
    const sub = `Basic ${Buffer.from(`${SUB}:subtoken`).toString("base64")}`;
    expect(calls.find((c) => c.url.endsWith("/Accounts.json"))!.auth).not.toBe(sub);
    expect(calls.filter((c) => c.url.includes("trusthub") || c.url.includes("messaging.twilio")).every((c) => c.auth === sub)).toBe(true);
    const biz = calls.find((c) => c.url.endsWith("/EndUsers") && c.body.get("Type") === "customer_profile_business_information")!;
    expect(JSON.parse(biz.body.get("Attributes")!)).toMatchObject({ business_registration_identifier: "EIN", business_registration_number: "123456789", business_industry: "FINANCIAL" });
    expect(calls.filter((c) => c.url.endsWith("/EntityAssignments")).map((c) => c.body.get("ObjectSid"))).toContain(process.env.TWILIO_PRIMARY_PROFILE_SID);
    const svc = calls.find((c) => c.url.endsWith("/v1/Services"))!;
    expect(svc.body.get("InboundRequestUrl")).toMatch(/\/api\/twilio\/inbound$/);
    expect(await textSender(CO, false)).toBeNull();

    // Nothing is made twice.
    const before = calls.length;
    s = await advance(CO, NOW, mail);
    expect(calls.slice(before).every((c) => c.method === "GET")).toBe(true);

    state.brand = "APPROVED";
    s = await advance(CO, NOW, mail);
    expect(s).toMatchObject({ status: "working", step: "campaign", campaignStatus: "IN_PROGRESS" });
    const camp = calls.find((c) => c.url.endsWith("/Compliance/Usa2p"))!;
    expect(camp.body.get("UsAppToPersonUsecase")).toBe("CUSTOMER_CARE");
    expect(camp.body.get("DirectLending")).toBe("true");
    expect(camp.body.getAll("MessageSamples").length).toBeGreaterThanOrEqual(2);
    expect(camp.body.getAll("OptOutKeywords")).toContain("STOP");

    state.campaign = "VERIFIED";
    const r = await advanceAll(NOW, mail);
    expect(r).toEqual({ checked: 1, live: 1 });
    expect(await textSender(CO, false)).toMatchObject({ account: SUB });
    expect(mails.at(-1)?.subject).toMatch(/^Texting is on/);
    expect(stepsOf(await textingStore().get(CO)).every((x) => x.done)).toBe(true);
  });

  it("stops before submitting anything when Twilio's forms changed", async () => {
    const calls = fakeTwilio({ brand: "PENDING", campaign: "IN_PROGRESS", fields: { customer_profile_business_information: ["business_name"], authorized_representative_1: ["first_name"], us_a2p_messaging_profile_information: ["company_type"] } });
    await saveInfo(owner, INFO, true, true, NOW, mail);
    const s = await advance(CO, NOW, mail);
    expect(s).toMatchObject({ status: "attention", step: "check" });
    expect(s!.error).toMatch(/forms changed/);
    expect(calls.some((c) => c.url.endsWith("/CustomerProfiles"))).toBe(false);
  });

  it("asks a person when Twilio or the carriers say no, and can be sent again", async () => {
    const state = { brand: "PENDING", campaign: "IN_PROGRESS", evaluation: "noncompliant" };
    fakeTwilio(state);
    await saveInfo(owner, INFO, true, true, NOW, mail);
    let s = await advance(CO, NOW, mail);
    expect(s).toMatchObject({ status: "attention", step: "profile" });
    expect(s!.error).toMatch(/EIN doesn't match/);
    expect(mails.at(-1)?.subject).toMatch(/needs a look/);
    state.evaluation = "compliant";
    expect(await retrySetup(lo, CO, NOW)).toBe(true);
    s = await advance(CO, NOW, mail);
    expect(s).toMatchObject({ status: "working", step: "brand" });
    state.brand = "FAILED";
    s = await advance(CO, NOW, mail);
    expect(s).toMatchObject({ status: "attention", step: "brand" });
    expect(s!.error).toMatch(/Tax ID mismatch/);
  });

  it("retries Twilio outages each morning, and asks a person after five", async () => {
    fakeTwilio({ brand: "PENDING", campaign: "IN_PROGRESS", fail: (u) => (u.endsWith("/Accounts.json") ? 503 : null) });
    await saveInfo(owner, INFO, true, true, NOW, mail);
    for (let i = 1; i <= 4; i++) expect(await advance(CO, NOW, mail)).toMatchObject({ status: "working", failures: i });
    expect(await advance(CO, NOW, mail)).toMatchObject({ status: "attention", failures: 5 });
  });

  it("sends from the company's own subaccount, and reads its signed replies", async () => {
    fakeTwilio({ brand: "APPROVED", campaign: "VERIFIED" });
    await saveInfo(owner, INFO, true, true, NOW, mail);
    await advance(CO, NOW, mail);
    const sender = await textSender(CO, false);
    expect(sender?.account).toBe(SUB);
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => (seen.push(String(u)), new Response(JSON.stringify({ sid: "SM1", status: "queued" }), { status: 201 })));
    expect(await sendSms("+14255550100", "Hi", null, sender!.service, sender!.account)).toMatchObject({ ok: true });
    expect(seen[0]).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SUB}/Messages.json`);
    // A reply to that number is signed with the subaccount's token.
    const token = await webhookToken(SUB);
    expect(token).toBe("subtoken");
    const params = { AccountSid: SUB, From: "+14255550100", Body: "STOP" };
    const sig = twilioSignature("subtoken", "https://x.example/api/twilio/inbound", params);
    expect(validTwilioRequest("https://x.example/api/twilio/inbound", params, sig)).toBe(false);
    expect(validTwilioRequest("https://x.example/api/twilio/inbound", params, sig, token)).toBe(true);
    expect(await webhookToken("AC" + "2".repeat(32))).toBeNull();
    // A Messaging Service the owner set by hand for the company still wins.
    process.env[`TWILIO_MESSAGING_SERVICE_SID_${CO}`] = "MGmanual";
    expect(await textSender(CO, false)).toEqual({ service: "MGmanual", account: null });
  });

  it("registers the campaign from the company's own wording", async () => {
    await saveInfo(owner, INFO, false, false, NOW, mail);
    const k = campaignFor((await textingStore().get(CO))!);
    expect(k.description.length).toBeGreaterThanOrEqual(40);
    expect(k.messageFlow.length).toBeGreaterThanOrEqual(40);
    expect(k.samples.every((x) => x.length >= 20)).toBe(true);
    expect(k.optOutMessage).not.toMatch(/START/);
  });
});
