import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch, recordConsent, summarize } from "@/lib/contacts/service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { MemoryTouchStore, setTouchStoreForTests } from "@/lib/messaging/store";
import { mloById } from "@/lib/config";
import { encodeWav, readWav, VM_RATE } from "./audio";
import { newMemoryVoicemailStore, setVoicemailStoreForTests, voicemailStore } from "./store";
import { addVoicemail, companyLineTwiml, dropStatus, dropTwiml, dropVoicemail, keyTwiml, optOutLineTwiml, spoken, type Dialer } from "./service";

const TUE_10AM_PT = new Date("2026-11-17T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const rec = { firstName: "Ann", lastName: "Lee", email: null, phone: "+12068231234", phone2: null, street: null, city: null, state: "WA", zip: null, relationship: "past_client", tags: [], notes: null, loan: null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[] };
const wav = (sec: number) => encodeWav(new Float32Array(Math.round(sec * VM_RATE)).fill(0.1));
const blob = { put: async (p: string) => `https://abc.public.blob.vercel-storage.com/${p}`, del: async () => undefined };
const says = (text: string, rates: number[] = []) => async (_p: Uint8Array, _o: number, _f: typeof fetch, rate = 16_000) => (rates.push(rate), { text, cues: [] });
const M = mloById("mlo-001")!;

describe("Voicemail drops (D57)", () => {
  const saved = { ...process.env };
  let contacts: MemoryContactStore;
  let touches: MemoryTouchStore;
  beforeEach(async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC" + "0".repeat(32);
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    process.env.GOOGLE_CLOUD_API_KEY = "g";
    process.env.TWILIO_CALLER_ID = "+14258210000";
    delete process.env.TWILIO_OPTOUT_NUMBER;
    contacts = new MemoryContactStore();
    touches = new MemoryTouchStore();
    setContactStoreForTests(contacts);
    setTouchStoreForTests(touches);
    const accounts = new MemoryAccountStore();
    await accounts.putUser(me);
    setAccountStoreForTests(accounts);
    setVoicemailStoreForTests(newMemoryVoicemailStore());
    await importBatch(me, "contacts", [rec], "a.csv", "personal", TUE_10AM_PT);
  });
  afterEach(() => {
    process.env = { ...saved };
    for (const f of [setContactStoreForTests, setTouchStoreForTests, setAccountStoreForTests, setVoicemailStoreForTests]) f(null);
  });
  const ann = async () => (await contacts.list({})).contacts[0];
  const save = async (text = "Hi Ann, your appraisal came in. Give me a call when you have a minute.") => {
    const r = await addVoicemail(me, "Appraisal", wav(10), TUE_10AM_PT, blob, says(text));
    if (!r.ok) throw new Error(r.error);
    return r.voicemail;
  };
  const calls: Parameters<Dialer>[0][] = [];
  const dial: Dialer = async (c) => (calls.push(c), { ok: true, sid: `CA${calls.length}` });
  const ready = async () => true;

  it("makes and reads the phone network's WAV, and nothing else", () => {
    const w = wav(1.5);
    expect(readWav(w)).toMatchObject({ rate: 8000 });
    expect(readWav(w)!.pcm.length).toBe(24_000);
    const other = encodeWav(new Float32Array(100), 16_000);
    expect(readWav(other)).toBeNull();
    expect(readWav(new Uint8Array(10))).toBeNull();
  });

  it("checks the words at 8 kHz before saving, and keeps nothing that fails", async () => {
    const rates: number[] = [];
    expect(await addVoicemail(me, "x", wav(10), TUE_10AM_PT, blob, says("Hi, rates just dropped to 5.5% so call me.", rates))).toMatchObject({ ok: false });
    expect(rates).toEqual([8000]);
    expect(await voicemailStore().voicemailsFor(me.id)).toEqual([]);
    expect(await addVoicemail(me, "x", wav(70), TUE_10AM_PT, blob, says("Hi."))).toMatchObject({ ok: false });
    expect(await addVoicemail(me, "x", wav(1), TUE_10AM_PT, blob, says("Hi."))).toMatchObject({ ok: false });
    expect(await addVoicemail(me, "x", new Uint8Array(500), TUE_10AM_PT, blob, says("Hi."))).toMatchObject({ ok: false });
    expect(await addVoicemail(me, "x", wav(10), TUE_10AM_PT, blob, says(""))).toMatchObject({ ok: false });
    const v = await save();
    expect(v).toMatchObject({ status: "ok", seconds: 10, url: expect.stringMatching(/^https:\/\/abc\.public\.blob\.vercel-storage\.com\/voicemail\/lo1\//) });
  });

  it("leaves a voicemail only when the contact rules allow a recorded-voice call", async () => {
    const v = await save();
    const c = await ann();
    calls.length = 0;
    let r = await dropVoicemail(me, { voicemailId: v.id, contactIds: [c.id], purpose: "service" }, TUE_10AM_PT, dial, ready);
    expect(r).toMatchObject({ ok: true, results: [{ ok: false, reason: expect.stringMatching(/No permission for recorded or AI-voice calls/) }] });
    expect(calls).toHaveLength(0);
    await recordConsent(me, c.id, { channel: "ai_call", purpose: "service", granted: true, evidence: "written", proof: "signed application" }, TUE_10AM_PT);
    r = await dropVoicemail(me, { voicemailId: v.id, contactIds: [c.id], purpose: "service" }, TUE_10AM_PT, dial, ready);
    expect(r).toMatchObject({ ok: true, results: [{ ok: true }] });
    expect(calls[0]).toMatchObject({ account: process.env.TWILIO_ACCOUNT_SID, from: "+14258210000", to: "+12068231234", url: expect.stringMatching(/\/api\/twilio\/voicedrop\?d=dr_/) });
    expect((await touches.forContact(c.id))[0]).toMatchObject({ channel: "ai_call", status: "queued", body: 'Voicemail drop: "Appraisal"' });
    // Outside their calling hours, nothing is placed.
    calls.length = 0;
    r = await dropVoicemail(me, { voicemailId: v.id, contactIds: [c.id], purpose: "service" }, new Date("2026-11-17T06:00:00Z"), dial, ready);
    expect(r).toMatchObject({ ok: true, results: [{ ok: false }] });
    expect(calls).toHaveLength(0);
    // Offers need the toll-free opt-out line, and the public site must run this version.
    expect(await dropVoicemail(me, { voicemailId: v.id, contactIds: [c.id], purpose: "marketing" }, TUE_10AM_PT, dial, ready)).toMatchObject({ ok: false, error: expect.stringMatching(/toll-free/) });
    expect(await dropVoicemail(me, { voicemailId: v.id, contactIds: [c.id], purpose: "service" }, TUE_10AM_PT, dial, async () => false)).toMatchObject({ ok: false, error: expect.stringMatching(/live at/) });
    delete process.env.TWILIO_CALLER_ID;
    expect(await dropVoicemail(me, { voicemailId: v.id, contactIds: [c.id], purpose: "service" }, TUE_10AM_PT, dial, ready)).toMatchObject({ ok: false, error: expect.stringMatching(/calling number/) });
  });

  it("says who's calling first, how to stop, the recording, and the number to call back", async () => {
    process.env.TWILIO_OPTOUT_NUMBER = "+18888210100";
    const v = await save();
    const c = await ann();
    await recordConsent(me, c.id, { channel: "ai_call", purpose: "service", granted: true, evidence: "written", proof: "signed application" }, TUE_10AM_PT);
    await dropVoicemail(me, { voicemailId: v.id, contactIds: [c.id], purpose: "service" }, TUE_10AM_PT, dial, ready);
    const d = (await voicemailStore().dropsFor(me.id))[0];
    const machine = await dropTwiml(d.id, "machine_end_beep");
    expect(machine.indexOf(`This is a recorded message from ${M.name}`)).toBeLessThan(machine.indexOf("<Play>"));
    expect(machine).toContain(`<Play>${v.url}</Play>`);
    expect(machine).toContain(`call ${spoken(M.phone!)}`);
    expect(machine).not.toContain("<Gather");
    const human = await dropTwiml(d.id, "human");
    expect(human).toMatch(/<Gather numDigits="1"[^>]*action="[^"]*\/api\/twilio\/voice\/key\?k=drop&amp;d=dr_/);
    expect(human).toContain("press 9");
    // An offer names the toll-free line right after who's calling.
    await voicemailStore().putDrop({ ...d, purpose: "marketing" });
    const offer = await dropTwiml(d.id, "machine_end_silence");
    expect(offer).toMatch(/recorded message from[^<]*<\/Say><Say[^>]*>To stop these calls, call 8 8 8, 8 2 1, 0 1 0 0\./);
    expect(await dropTwiml("dr_missing00", "human")).toContain("<Hangup/>");
  });

  it("records how it ended, and pressing 9 stops recorded calls and texts to that number", async () => {
    const v = await save();
    const c = await ann();
    await recordConsent(me, c.id, { channel: "ai_call", purpose: "service", granted: true, evidence: "written", proof: "signed application" }, TUE_10AM_PT);
    await dropVoicemail(me, { voicemailId: v.id, contactIds: [c.id], purpose: "service" }, TUE_10AM_PT, dial, ready);
    const d = (await voicemailStore().dropsFor(me.id))[0];
    await dropStatus(d.id, { CallSid: d.callSid!, CallStatus: "completed", AnsweredBy: "machine_end_beep" }, TUE_10AM_PT);
    expect(await voicemailStore().drop(d.id)).toMatchObject({ status: "left" });
    expect((await touches.forContact(c.id))[0].status).toBe("voicemail left");
    expect(await keyTwiml("drop", { Digits: "1", To: c.phone!, From: "+14258210000" }, d.id, TUE_10AM_PT)).toContain("<Hangup/>");
    expect(await touches.optedOut(c.phone!)).toBe(false);
    const said = await keyTwiml("drop", { Digits: "9", To: c.phone!, From: "+14258210000" }, d.id, TUE_10AM_PT);
    expect(said).toMatch(/won't get more/);
    expect(await touches.optedOut(c.phone!)).toBe(true);
    expect(summarize(await contacts.consents(c.id)).ai_call.marketing.evidence).toBe("revoked");
    expect(await voicemailStore().drop(d.id)).toMatchObject({ optedOut: true });
    const again = await dropVoicemail(me, { voicemailId: v.id, contactIds: [c.id], purpose: "service" }, TUE_10AM_PT, dial, ready);
    expect(again).toMatchObject({ ok: true, results: [{ ok: false }] });
  });

  it("answers calls back: press 9 to stop, or reach the loan officer who called", async () => {
    const v = await save();
    const c = await ann();
    await recordConsent(me, c.id, { channel: "ai_call", purpose: "service", granted: true, evidence: "written", proof: "signed application" }, TUE_10AM_PT);
    await dropVoicemail(me, { voicemailId: v.id, contactIds: [c.id], purpose: "service" }, TUE_10AM_PT, dial, ready);
    const line = await companyLineTwiml({ From: c.phone!, To: "+14258210000" });
    expect(line).toMatch(/press 9/);
    expect(line).toMatch(/<Dial timeout="25">\+1\d{10}<\/Dial>/);
    const stranger = await companyLineTwiml({ From: "+13105559876", To: "+14258210000" });
    expect(stranger).not.toContain("<Dial");
    expect(optOutLineTwiml()).toMatch(/k=optout/);
  });
});
