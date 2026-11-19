import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { resetMemoryCounters } from "@/lib/m8/kv";
import { mloById, resetExtraMlosForTests, ccAllMlos } from "@/lib/config";
import { companyCount, companyDetails, singleCompany } from "@/lib/accounts/company";
import { bookOf } from "@/lib/contacts/service";
import { licensedStatesFor } from "@/lib/send-gate/for-contact";
import { signature } from "@/lib/messaging/service";
import { emailFooter } from "@/lib/messaging/email";
import { myValues } from "@/lib/templates/service";
import type { Mail } from "@/lib/pilot/service";
import { newMemorySignUpStore, setSignUpStoreForTests, signUpStore } from "./store";
import { ensureRegistry, resetRegistryForTests } from "./cache";
import { approveSignUp, confirmSignUp, declineSignUp, formToInput, signUpFor, submitSignUp, updateOwnLinks, type SignUpForm } from "./service";

const T0 = Date.parse("2026-11-19T18:00:00Z");
const ORIGIN = "https://cc.example";
const owner: User = { id: "u_owner", email: "owner@example.com", name: "Pat Owner", role: "owner", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const lead: User = { id: "u_lead", email: "lead@example.com", name: "Tay Lead", role: "team_lead", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };

const form = (over: Partial<SignUpForm> = {}): SignUpForm => ({
  name: "Riley Quinn",
  email: "Riley@Brokerage.example",
  phone: "(305) 555-0199",
  nmls: "7654321",
  sponsorName: "Sunrise Mortgage Brokers LLC",
  sponsorNmls: "998877",
  sponsorAddress: "100 Ocean Dr, Miami, FL 33139",
  licenses: [{ state: "FL", license: "LO12345" }, { state: "GA", license: "" }],
  calendly: "https://cal.example/riley",
  applicationUrl: "",
  heardFrom: "a friend",
  sponsorAllows: "yes",
  attest: true,
  ...over,
});

let mail: Mail[];
let fetched: { to: string; text: string }[];
const send = async (m: Mail) => {
  mail.push(m);
  return true;
};
let accounts: MemoryAccountStore;
const saved = { ...process.env };
const linkFrom = (text: string) => decodeURIComponent(/t=([^\s]+)/.exec(text)![1]);

beforeEach(async () => {
  accounts = new MemoryAccountStore();
  setAccountStoreForTests(accounts);
  setSignUpStoreForTests(newMemorySignUpStore());
  resetMemoryCounters();
  resetRegistryForTests();
  resetExtraMlosForTests();
  mail = [];
  fetched = [];
  process.env.MLO_OWNER_EMAIL = "owner@example.com";
  process.env.RESEND_API_KEY = "re_test";
  process.env.MLO_NOTIFICATION_EMAIL = "alerts@example.com";
  process.env.LOANM8_FROM_EMAIL = "m8@example.com";
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
    const b = JSON.parse(init.body);
    fetched.push({ to: b.to[0], text: b.text });
    return new Response("{}", { status: 200 });
  }));
  await accounts.putUser(owner);
  await accounts.putUser(lead);
});
afterEach(() => {
  process.env = { ...saved };
  setAccountStoreForTests(null);
  setSignUpStoreForTests(null);
  resetExtraMlosForTests();
  vi.unstubAllGlobals();
});

async function signedUpAndConfirmed(over: Partial<SignUpForm> = {}) {
  expect(await submitSignUp(form(over), ORIGIN, "ip1", T0, send)).toEqual({ ok: true });
  const t = linkFrom(mail[mail.length - 1].text);
  expect((await confirmSignUp(t, ORIGIN, T0 + 60_000, send)).ok).toBe(true);
  const email = (over.email ?? form().email).toLowerCase();
  return (await signUpStore().byEmail(email)).find((x) => x.status === "pending")!;
}

describe("Loan officer sign-up (D45)", () => {
  it("reads one checkbox and license box per state, for any of the 51", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ name: "A B", email: "a@b.co", st_FL: "on", lic_FL: "X1", st_DC: "on", st_WA: "", attest: "on", sponsorAllows: "yes" })) fd.set(k, v);
    const f = formToInput(fd);
    expect(f.licenses).toEqual([{ state: "DC", license: "" }, { state: "FL", license: "X1" }]);
    expect(f.attest).toBe(true);
  });

  it("checks the form", async () => {
    expect((await submitSignUp(form({ licenses: [] }), ORIGIN, "ip", T0, send)).ok).toBe(false);
    expect((await submitSignUp(form({ nmls: "12ab" }), ORIGIN, "ip", T0, send)).ok).toBe(false);
    expect((await submitSignUp(form({ sponsorNmls: "" }), ORIGIN, "ip", T0, send)).ok).toBe(false);
    expect((await submitSignUp(form({ sponsorAddress: "" }), ORIGIN, "ip", T0, send)).ok).toBe(false);
    expect((await submitSignUp(form({ calendly: "http://insecure.example" }), ORIGIN, "ip", T0, send)).ok).toBe(false);
    expect((await submitSignUp(form({ attest: false as unknown as true }), ORIGIN, "ip", T0, send)).ok).toBe(false);
    expect((await submitSignUp(form({ licenses: [{ state: "ZZ", license: "" }] }), ORIGIN, "ip", T0, send)).ok).toBe(false);
    expect(mail).toHaveLength(0);
  });

  it("stores it unconfirmed and emails a 24-hour confirm link", async () => {
    await submitSignUp(form(), ORIGIN, "ip", T0, send);
    const [s] = await signUpStore().list();
    expect(s.status).toBe("unconfirmed");
    expect(s.email).toBe("riley@brokerage.example");
    expect(s.phone).toBe("3055550199");
    expect(mail[0].to).toBe("riley@brokerage.example");
    expect(mail[0].text).toContain(`${ORIGIN}/sign-up/confirm?t=`);
    expect(s.confirmHash).not.toContain(linkFrom(mail[0].text));
  });

  it("never reveals an existing account, and tells that person to sign in instead", async () => {
    await accounts.putUser({ ...owner, id: "u_x", email: "riley@brokerage.example", role: "lo", mloId: null });
    expect(await submitSignUp(form(), ORIGIN, "ip", T0, send)).toEqual({ ok: true });
    expect(await signUpStore().list()).toHaveLength(0);
    expect(mail[0].subject).toMatch(/already have/);
  });

  it("limits sign-ups per hour", async () => {
    for (let i = 0; i < 3; i++) expect((await submitSignUp(form({ email: `r${i}@x.example` }), ORIGIN, "same-ip", T0, send)).ok).toBe(true);
    await submitSignUp(form({ email: "r3@x.example" }), ORIGIN, "same-ip", T0, send);
    await submitSignUp(form({ email: "r4@x.example" }), ORIGIN, "same-ip", T0, send);
    expect((await submitSignUp(form({ email: "r5@x.example" }), ORIGIN, "same-ip", T0, send)).ok).toBe(false);
  });

  it("confirming joins the review queue and tells the owner, with the NMLS record link", async () => {
    const s = await signedUpAndConfirmed();
    expect(s.status).toBe("pending");
    const toOwner = mail.find((m) => m.to === "owner@example.com")!;
    expect(toOwner.replyTo).toBe("riley@brokerage.example");
    expect(toOwner.text).toContain("https://www.nmlsconsumeraccess.org/EntityDetails.aspx/INDIVIDUAL/7654321");
    expect(toOwner.text).toContain("FL, GA");
    expect(toOwner.text).toContain(`${ORIGIN}/mlo/signups`);
  });

  it("refuses an expired or unknown confirm link", async () => {
    await submitSignUp(form(), ORIGIN, "ip", T0, send);
    const t = linkFrom(mail[0].text);
    expect((await confirmSignUp("nope", ORIGIN, T0, send)).ok).toBe(false);
    expect((await confirmSignUp(t, ORIGIN, T0 + 25 * 3_600_000, send)).ok).toBe(false);
  });
});

describe("Approval (D45)", () => {
  it("needs the owner and the NMLS check, and refuses when the sponsor doesn't allow outside systems", async () => {
    const s = await signedUpAndConfirmed();
    expect((await approveSignUp(lead, s.id, true, ORIGIN, T0)).ok).toBe(false);
    expect((await approveSignUp(owner, s.id, false, ORIGIN, T0)).ok).toBe(false);
    const no = await signedUpAndConfirmed({ email: "no@x.example", sponsorAllows: "no" });
    const r = await approveSignUp(owner, no.id, true, ORIGIN, T0);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/company-wide plan/);
  });

  it("makes their record and account and sends the sign-in link; their own company goes on every message", async () => {
    const s = await signedUpAndConfirmed();
    const r = await approveSignUp(owner, s.id, true, ORIGIN, T0);
    expect(r).toEqual({ ok: true, emailed: true });
    expect(fetched.some((m) => m.to === "riley@brokerage.example" && /api\/cc\/verify\?t=/.test(m.text))).toBe(true);
    const user = (await accounts.userByEmail("riley@brokerage.example"))!;
    expect(user.role).toBe("lo");
    const mlo = mloById(user.mloId)!;
    expect(mlo.name).toBe("Riley Quinn");
    expect(mlo.source).toBe("signup");
    expect(licensedStatesFor(user)).toEqual(["FL", "GA"]);
    expect(companyDetails(mlo)).toMatchObject({ name: "Sunrise Mortgage Brokers LLC", nmls: "998877", address: "100 Ocean Dr, Miami, FL 33139" });
    const N = ["NM", "LS #"].join("");
    expect(signature(user)).toBe(`Riley at Sunrise Mortgage Brokers LLC, ${N}${form().nmls}. Reply STOP to opt out.`);
    const footer = emailFooter(user, null);
    expect(footer).toContain(`Sunrise Mortgage Brokers LLC, ${N}${form().sponsorNmls}`);
    expect(footer).toContain("100 Ocean Dr, Miami, FL 33139");
    expect(footer).not.toContain("Home Trust");
    expect(myValues(user)).toMatchObject({ company: "Sunrise Mortgage Brokers LLC", companyNmls: "998877", bookingLink: "https://cal.example/riley" });
    const after = (await signUpStore().get(s.id))!;
    expect(after).toMatchObject({ status: "approved", verifiedBy: "human", decidedBy: "owner@example.com", userId: user.id });
    expect((await accounts.recentAudit(10)).some((e) => e.action === "signup.approve")).toBe(true);
  });

  it("a loan officer at another company ends the owner's view of every book", async () => {
    expect(singleCompany()).toBe(true);
    expect(bookOf(owner)).toBeUndefined();
    const s = await signedUpAndConfirmed();
    await approveSignUp(owner, s.id, true, ORIGIN, T0);
    expect(companyCount()).toBe(2);
    expect(singleCompany()).toBe(false);
    expect(bookOf(owner)).toBe("u_owner");
  });

  it("someone at the owner's own sponsor keeps one company", async () => {
    const home = ccAllMlos()[0].licenses[0].sponsor.idNumber;
    const s = await signedUpAndConfirmed({ sponsorNmls: home });
    await approveSignUp(owner, s.id, true, ORIGIN, T0);
    expect(singleCompany()).toBe(true);
  });

  it("fails closed: with a database and nothing loaded yet, it assumes more than one company", () => {
    process.env.DATABASE_URL = "postgres://example.invalid/db";
    resetExtraMlosForTests();
    expect(companyCount()).toBeGreaterThanOrEqual(2);
    expect(singleCompany()).toBe(false);
  });

  it("reloads approved records on a fresh server", async () => {
    const s = await signedUpAndConfirmed();
    await approveSignUp(owner, s.id, true, ORIGIN, T0);
    const id = (await accounts.userByEmail("riley@brokerage.example"))!.mloId;
    resetExtraMlosForTests();
    resetRegistryForTests();
    expect(mloById(id)).toBeUndefined();
    await ensureRegistry();
    expect(mloById(id)?.name).toBe("Riley Quinn");
  });

  it("declines with a note, emailed to them", async () => {
    const s = await signedUpAndConfirmed();
    mail = [];
    expect((await declineSignUp(owner, s.id, "Your NMLS record shows a different sponsor.", T0, send)).ok).toBe(true);
    expect(mail[0].to).toBe("riley@brokerage.example");
    expect(mail[0].text).toContain("different sponsor");
    expect((await signUpStore().get(s.id))!.status).toBe("declined");
    expect((await approveSignUp(owner, s.id, true, ORIGIN, T0)).ok).toBe(false);
  });

  it("lets a signed-up loan officer keep their own links current, and nobody else", async () => {
    const s = await signedUpAndConfirmed();
    await approveSignUp(owner, s.id, true, ORIGIN, T0);
    const user = (await accounts.userByEmail("riley@brokerage.example"))!;
    expect((await updateOwnLinks(user, { calendly: "https://cal.example/new", applicationUrl: "https://apply.example/riley", phone: "305 555 0100" }, T0)).ok).toBe(true);
    expect(mloById(user.mloId)?.calendly).toBe("https://cal.example/new");
    expect(mloById(user.mloId)?.applicationUrl).toBe("https://apply.example/riley");
    expect((await signUpFor(user))?.phone).toBe("3055550100");
    expect((await updateOwnLinks(user, { calendly: "javascript:alert(1)", applicationUrl: "", phone: "" }, T0)).ok).toBe(false);
    expect((await updateOwnLinks(owner, { calendly: "https://x.example", applicationUrl: "", phone: "" }, T0)).ok).toBe(false);
  });
});
