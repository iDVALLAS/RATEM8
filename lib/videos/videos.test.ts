import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryContactStore, setContactStoreForTests } from "@/lib/contacts/store";
import { importBatch } from "@/lib/contacts/service";
import { MemoryAccountStore, setAccountStoreForTests, type User } from "@/lib/accounts/store";
import { mloById } from "@/lib/config";
import { PART_BYTES } from "./audio";
import { newMemoryVideoStore, setVideoStoreForTests, videoStore } from "./store";
import { checkPart, checkTranscript, deleteVideo, ownFile, recordView, registerVideo, sendVideo, uploadRules, videosOn, watchFile, watchView, type BlobDeps, type Senders } from "./service";
import { toCues, toVtt } from "./transcribe";

const FIRST = mloById("mlo-001")!.firstName;
const NOW = new Date("2026-11-20T18:00:00Z");
const me: User = { id: "lo1", email: "lo1@x.com", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" };
const other: User = { ...me, id: "lo2", email: "lo2@x.com" };
const base = { phone2: null, tags: [], notes: null, loan: null, agent: null, attestedOptIns: [] as ("text" | "call" | "email")[], relationship: "past_client", street: null, city: null, zip: null, state: "WA" };
const HOST = "https://abc123.private.blob.vercel-storage.com";
const blob = (deleted: string[] = []): BlobDeps => ({ head: async () => ({ size: 1_000_000, contentType: "video/webm" }), del: async (u) => void deleted.push(...u) });
const pcm = (sec: number) => new Uint8Array(Math.round(sec * 32_000));
const says = (text: string) => async () => ({ text, cues: [{ start: 0, end: 2, text }] });

describe("Video messages (D55)", () => {
  const saved = { ...process.env };
  let contacts: MemoryContactStore;
  beforeEach(async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    process.env.GOOGLE_CLOUD_API_KEY = "g-test";
    contacts = new MemoryContactStore();
    setContactStoreForTests(contacts);
    const accounts = new MemoryAccountStore();
    await accounts.putUser(me);
    setAccountStoreForTests(accounts);
    setVideoStoreForTests(newMemoryVideoStore());
    await importBatch(me, "contacts", [{ ...base, firstName: "Ann", lastName: "Lee", email: "ann@example.com", phone: "+12065550101" }], "a.csv", "personal", NOW);
  });
  afterEach(() => {
    process.env = { ...saved };
    for (const f of [setContactStoreForTests, setAccountStoreForTests, setVideoStoreForTests]) f(null);
  });
  const ann = async () => (await contacts.list({})).contacts[0];
  const add = async (seconds = 40) => {
    const r = await registerVideo(me, { url: `${HOST}/videos/lo1/1.webm`, posterUrl: `${HOST}/videos/lo1/1-poster.jpg`, title: "Congrats!", durationSec: seconds }, NOW, blob());
    if (!r.ok) throw new Error(r.error);
    return r.video;
  };
  const sent: { channel: string; body: string; subject?: string }[] = [];
  const senders: Senders = {
    text: async (_a, _id, body) => (sent.push({ channel: "text", body }), { ok: true }),
    email: async (_a, _id, subject, body) => (sent.push({ channel: "email", body, subject }), { ok: true }),
  };

  it("uploads only into the loan officer's own folder, and only video or its still", () => {
    expect(uploadRules(me, "videos/lo1/123.webm")).toMatchObject({ ok: true, allowedContentTypes: ["video/mp4", "video/webm", "video/quicktime"] });
    expect(uploadRules(me, "videos/lo1/123-poster.jpg")).toMatchObject({ ok: true, allowedContentTypes: ["image/jpeg"] });
    expect(uploadRules(me, "videos/lo2/123.webm").ok).toBe(false);
    expect(uploadRules(me, "videos/lo1/../lo2/x.webm").ok).toBe(false);
    expect(uploadRules(me, "videos/lo1/x.exe").ok).toBe(false);
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(uploadRules(me, "videos/lo1/123.webm").ok).toBe(false);
    // D65.1: the private store's id alone runs the server side; the browser upload still needs the token, and says how to add it.
    process.env.BLOB_STORE_ID = "store_test";
    expect(videosOn()).toBe(true);
    expect(uploadRules(me, "videos/lo1/123.webm")).toMatchObject({ ok: false, error: expect.stringMatching(/Uploading isn.t turned on yet/) });
    delete process.env.BLOB_STORE_ID;
    expect(videosOn()).toBe(false);
  });

  it("accepts files saved before the switch to the private store (public addresses)", async () => {
    const r = await registerVideo(me, { url: "https://abc123.public.blob.vercel-storage.com/videos/lo1/9.webm", title: "", durationSec: 20 }, NOW, blob());
    expect(r.ok).toBe(true);
  });

  it("records a video only from the loan officer's own folder in Blob, up to two minutes", async () => {
    expect((await registerVideo(me, { url: "https://evil.example.com/videos/lo1/1.webm", title: "", durationSec: 30 }, NOW, blob())).ok).toBe(false);
    expect((await registerVideo(other, { url: `${HOST}/videos/lo1/1.webm`, title: "", durationSec: 30 }, NOW, blob())).ok).toBe(false);
    const deleted: string[] = [];
    expect(await registerVideo(me, { url: `${HOST}/videos/lo1/2.webm`, title: "", durationSec: 200 }, NOW, blob(deleted))).toMatchObject({ ok: false, error: "Keep videos to two minutes." });
    expect(deleted).toEqual([`${HOST}/videos/lo1/2.webm`]);
    const v = await add();
    expect(v).toMatchObject({ status: "checking", ownerUserId: "lo1", posterUrl: `${HOST}/videos/lo1/1-poster.jpg` });
  });

  it("checks what it says in pieces, and the words become captions", async () => {
    const v = await add(80);
    const a = await checkPart(me, v.id, 0, 2, pcm(50), NOW, says("Hi Ann, congratulations on the new home."));
    expect(a).toMatchObject({ ok: true, done: false });
    const b = await checkPart(me, v.id, 1, 2, pcm(30), NOW, says("Call me anytime. I'll see you March 3rd at the closing."));
    expect(b).toMatchObject({ ok: true, done: true });
    const done = await videoStore().video(v.id);
    expect(done).toMatchObject({ status: "ok", transcript: "Hi Ann, congratulations on the new home. Call me anytime. I'll see you March 3rd at the closing." });
    expect(done!.cues).toHaveLength(2);
    // Someone else can't check it, and a finished check stays finished.
    expect((await checkPart(other, v.id, 0, 2, pcm(5), NOW, says("x"))).ok).toBe(false);
    expect(await checkPart(me, v.id, 0, 2, pcm(5), NOW, says("You'll be approved."))).toMatchObject({ ok: true, done: true, video: { status: "ok" } });
  });

  it("holds a video that quotes a rate, promises approval, or names a dollar figure", async () => {
    for (const line of ["Rates are at 5.99% this week, so let's talk.", "Don't worry, you will be approved for sure.", "Your payment would drop by $400 a month."]) {
      setVideoStoreForTests(newMemoryVideoStore());
      const v = await add();
      const r = await checkPart(me, v.id, 0, 1, pcm(20), NOW, says(`Hi Ann. ${line} Talk soon.`));
      expect(r).toMatchObject({ ok: true, done: true, video: { status: "held" } });
      if (r.ok) expect(r.video.reason).toMatch(/Near: “/);
    }
    expect(checkTranscript("").ok).toBe(true);
    expect(checkTranscript("This home is perfect for a young family.").ok).toBe(false);
  });

  it("holds a video whose sound runs past two minutes, and refuses odd pieces", async () => {
    const v = await add(110);
    expect((await checkPart(me, v.id, 0, 4, pcm(10), NOW, says("x"))).ok).toBe(false);
    expect((await checkPart(me, v.id, 0, 3, new Uint8Array(PART_BYTES + 2), NOW, says("x"))).ok).toBe(false);
    await checkPart(me, v.id, 0, 3, pcm(50), NOW, says("One."));
    expect((await checkPart(me, v.id, 1, 2, pcm(50), NOW, says("Two."))).ok).toBe(false);
    await checkPart(me, v.id, 1, 3, pcm(50), NOW, says("Two."));
    const r = await checkPart(me, v.id, 2, 3, pcm(30), NOW, says("Three."));
    expect(r).toMatchObject({ ok: true, done: true, video: { status: "held", reason: "It runs longer than two minutes." } });
  });

  it("can't run the word check without the Google key", async () => {
    const v = await add();
    delete process.env.GOOGLE_CLOUD_API_KEY;
    expect(await checkPart(me, v.id, 0, 1, pcm(5), NOW, says("x"))).toMatchObject({ ok: false, status: 503 });
  });

  it("sends only a checked video, each person their own link, through the gate", async () => {
    sent.length = 0;
    const v = await add();
    const c = await ann();
    expect(await sendVideo(me, { contactId: c.id, videoId: v.id, channel: "text", purpose: "service", note: "Hi {first}!" }, NOW, senders)).toMatchObject({ ok: false });
    await checkPart(me, v.id, 0, 1, pcm(20), NOW, says("Hi Ann, welcome aboard."));
    expect(await sendVideo(me, { contactId: c.id, videoId: v.id, channel: "text", purpose: "service", note: "You're pre-approved, {first}!" }, NOW, senders)).toMatchObject({ ok: false });
    expect(await sendVideo(other, { contactId: c.id, videoId: v.id, channel: "text", purpose: "service", note: "Hi {first}" }, NOW, senders)).toMatchObject({ ok: false });
    const r = await sendVideo(me, { contactId: c.id, videoId: v.id, channel: "text", purpose: "service", note: "Hi {first}, I made you a quick video." }, NOW, senders);
    expect(r.ok).toBe(true);
    expect(sent[0].body).toMatch(/^Hi Ann, I made you a quick video\.\n\nhttps:\/\/\S+\/v\/[A-Za-z0-9_-]{16}$/);
    const e = await sendVideo(me, { contactId: c.id, videoId: v.id, channel: "email", purpose: "service", note: "Hi {first}" }, NOW, senders);
    expect(sent[1]).toMatchObject({ channel: "email", subject: `A quick video from ${FIRST}` });
    expect(e.token).not.toBe(r.token);
    const w = await watchView(r.token!);
    expect(w).toMatchObject({ state: "ok", title: "Congrats!", firstName: "Ann", hasCaptions: true, mlo: { first: FIRST } });
    // D65.1: the page plays from Command Center's own routes, never the stored file's address.
    expect(w).toMatchObject({ url: `/v/${r.token}/media`, posterUrl: `/v/${r.token}/poster` });
    expect(JSON.stringify(w)).not.toContain("blob.vercel-storage.com");
    expect(await watchFile(r.token!, "video")).toEqual({ url: `${HOST}/videos/lo1/1.webm`, contentType: expect.any(String) });
    expect(await watchFile("nope-nope-nope", "video")).toBeNull();
    expect(await ownFile(me, v.id, "poster")).toMatchObject({ url: `${HOST}/videos/lo1/1-poster.jpg` });
    expect(await ownFile(other, v.id, "video")).toBeNull();
    expect(await watchView("nope-nope-nope")).toEqual({ state: "missing" });
    // A refused send leaves a dead link.
    const refused = await sendVideo(me, { contactId: c.id, videoId: v.id, channel: "text", purpose: "marketing", note: "Hi" }, NOW, { ...senders, text: async () => ({ ok: false, error: "Quiet hours." }) });
    expect(refused).toMatchObject({ ok: false, error: "Quiet hours." });
    // Deleting the video: the file goes, and the link says so.
    const deleted: string[] = [];
    expect(await deleteVideo(me, v.id, NOW, blob(deleted))).toBe(true);
    expect(deleted).toEqual([`${HOST}/videos/lo1/1.webm`, `${HOST}/videos/lo1/1-poster.jpg`]);
    expect(await watchView(r.token!)).toMatchObject({ state: "gone" });
    expect(await watchFile(r.token!, "video")).toBeNull();
    expect(await ownFile(me, v.id, "video")).toBeNull();
  });

  it("counts a view once per visitor per half hour, never the sender's own, and emails the first one", async () => {
    const v = await add();
    await checkPart(me, v.id, 0, 1, pcm(20), NOW, says("Hello."));
    const c = await ann();
    const r = await sendVideo(me, { contactId: c.id, videoId: v.id, channel: "text", purpose: "service", note: "Hi" }, NOW, senders);
    const mails: { to: string; subject: string }[] = [];
    const notify = async (m: { to: string; subject: string; text: string }) => (mails.push(m), true);
    expect(await recordView(r.token!, "visitor-a", me, NOW, notify)).toBe(false);
    expect(await recordView(r.token!, "visitor-a", null, NOW, notify)).toBe(true);
    expect(await recordView(r.token!, "visitor-a", null, NOW, notify)).toBe(false);
    expect(await recordView(r.token!, "visitor-b", null, NOW, notify)).toBe(true);
    expect((await videoStore().send(r.token!))).toMatchObject({ views: 2, firstViewedAt: NOW.toISOString() });
    expect(mails).toEqual([expect.objectContaining({ to: "lo1@x.com", subject: "Ann Lee watched your video" })]);
  });

  it("makes caption lines and a WebVTT file", () => {
    const w = (word: string, start: number) => ({ word, start, end: start + 0.4 });
    const cues = toCues([w("Hi", 0), w("Ann.", 0.5), w("This", 1), w("is", 1.5), w("a", 2), w("quick", 2.5), w("one", 3), w("for", 3.5), w("you", 4), w("today.", 4.5)]);
    expect(cues.map((c) => c.text)).toEqual(["Hi Ann.", "This is a quick one for you", "today."]);
    const vtt = toVtt([{ start: 61.25, end: 63, text: "a --> b <i>" }]);
    expect(vtt).toBe("WEBVTT\n\n1\n00:01:01.250 --> 00:01:03.000\na → b i\n");
  });
});
