import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { resetMemoryCounters } from "@/lib/m8/kv";
import { newMemorySignUpStore, setSignUpStoreForTests, signUpStore } from "@/lib/registry/store";
import { submitSignUp, type SignUpForm } from "@/lib/registry/service";
import type { Mail } from "./service";
import { INVITE_TTL_MS, inviteToken, invitedWaiting, parseInviteLines, readInvite, sendPilotInvites } from "./invite";

const T0 = Date.parse("2026-11-20T18:00:00Z");
const ORIGIN = "https://cc.example";
const owner: User = { id: "u_owner", email: "owner@example.com", name: "Pat Owner", role: "owner", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const lo: User = { ...owner, id: "u_lo", email: "lo@example.com", role: "lo" };
const form = (over: Partial<SignUpForm> = {}): SignUpForm => ({
  name: "Riley Quinn", email: "riley@brokerage.example", phone: "", nmls: "7654321", sponsorName: "Sunrise Mortgage Brokers LLC", sponsorNmls: "998877",
  sponsorAddress: "100 Ocean Dr, Miami, FL 33139", licenses: [{ state: "FL", license: "" }], calendly: "", applicationUrl: "", heardFrom: "", sponsorAllows: "yes", attest: true, ...over,
});

describe("Pilot invites (D61)", () => {
  const saved = { ...process.env };
  let mail: Mail[];
  const send = async (m: Mail) => (mail.push(m), true);
  let accounts: MemoryAccountStore;
  beforeEach(async () => {
    process.env.CC_LINK_SECRET = "test-secret";
    process.env.MLO_OWNER_EMAIL = "owner@example.com";
    accounts = new MemoryAccountStore();
    await accounts.putUser(owner);
    setAccountStoreForTests(accounts);
    setSignUpStoreForTests(newMemorySignUpStore());
    resetMemoryCounters();
    mail = [];
  });
  afterEach(() => {
    process.env = { ...saved };
    setAccountStoreForTests(null);
    setSignUpStoreForTests(null);
  });

  it("reads names and emails however they're pasted", () => {
    const r = parseInviteLines("Ann Lee, ann@example.com\nBo <BO@Example.com>\ncy@example.com; Di Ray di@example.com\nnot an email\nann@example.com");
    expect(r.people).toEqual([{ name: "Ann Lee", email: "ann@example.com" }, { name: "Bo", email: "bo@example.com" }, { name: "", email: "cy@example.com" }, { name: "Di Ray", email: "di@example.com" }]);
    expect(r.bad).toEqual(["not an email"]);
  });

  it("signs each invite for one email, and it expires", () => {
    const t = inviteToken({ email: "ann@example.com", name: "Ann", by: "owner@example.com", byName: "Pat", exp: T0 + INVITE_TTL_MS })!;
    expect(readInvite(t, T0)).toMatchObject({ email: "ann@example.com", name: "Ann", byName: "Pat" });
    expect(readInvite(t, T0 + INVITE_TTL_MS + 1)).toBeNull();
    const [payload, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), e: "eve@example.com" })).toString("base64url");
    expect(readInvite(`${forged}.${mac}`, T0)).toBeNull();
    expect(readInvite("junk", T0)).toBeNull();
  });

  it("emails each person their own link; only the owner or a team lead can", async () => {
    expect(await sendPilotInvites(lo, "ann@example.com", ORIGIN, T0, send)).toMatchObject({ ok: false });
    await accounts.putUser({ ...lo, email: "taken@example.com", id: "u2" });
    const r = await sendPilotInvites(owner, "Ann Lee, ann@example.com\ntaken@example.com", ORIGIN, T0, send);
    expect(r).toMatchObject({ ok: true, results: [{ email: "ann@example.com", ok: true }, { email: "taken@example.com", ok: false, note: "already has an account" }] });
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: "ann@example.com", replyTo: "owner@example.com", subject: "Pat Owner invited you to the MLO Command Center pilot" });
    const link = /https:\/\/cc\.example\/sign-up\?invite=(\S+)/.exec(mail[0].text)![1];
    expect(readInvite(decodeURIComponent(link), T0)).toMatchObject({ email: "ann@example.com", name: "Ann Lee" });
    delete process.env.CC_LINK_SECRET;
    delete process.env.DATABASE_URL;
    expect(await sendPilotInvites(owner, "x@example.com", ORIGIN, T0, send)).toMatchObject({ ok: false, error: expect.stringMatching(/CC_LINK_SECRET/) });
  });

  it("an invited sign-up skips the email step and goes straight to review, marked invited", async () => {
    const t = inviteToken({ email: "riley@brokerage.example", name: "Riley Quinn", by: "owner@example.com", byName: "Pat", exp: T0 + INVITE_TTL_MS })!;
    expect(await submitSignUp(form(), ORIGIN, "ip", T0, send, t)).toEqual({ ok: true, invited: true });
    const [s] = await signUpStore().list();
    expect(s).toMatchObject({ status: "pending", invitedBy: "owner@example.com", confirmHash: null });
    expect(mail.at(-1)).toMatchObject({ to: "owner@example.com", subject: expect.stringMatching(/^Invited loan officer signed up: Riley Quinn/) });
    expect(await invitedWaiting()).toBe(1);
    // The invite only works for the email it was sent to.
    setSignUpStoreForTests(newMemorySignUpStore());
    expect(await submitSignUp(form({ email: "someone@else.example" }), ORIGIN, "ip2", T0, send, t)).toEqual({ ok: true });
    expect((await signUpStore().list())[0]).toMatchObject({ status: "unconfirmed", invitedBy: null });
  });
});
