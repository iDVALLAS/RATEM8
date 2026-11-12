import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_VOICE, MAX_SPEAK_CHARS, SIG_TTL_MS, VOICE_CANDIDATES, currentVoice, isCandidate, saveVoice, signReply, speakableText, verifyReply, voiceOn } from "./google";
import { MemoryStore, setStoreForTests } from "@/lib/pricing/store";

describe("M8 voice (C15)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.GOOGLE_CLOUD_API_KEY = "test-key";
    delete process.env.M8_VOICE;
    delete process.env.M8_VOICE_SECRET;
  });
  afterEach(() => {
    process.env = { ...saved };
    setStoreForTests(null);
  });

  it("is a switch: on with the key, off without it or with M8_VOICE=false", () => {
    expect(voiceOn()).toBe(true);
    process.env.M8_VOICE = "false";
    expect(voiceOn()).toBe(false);
    delete process.env.M8_VOICE;
    delete process.env.GOOGLE_CLOUD_API_KEY;
    expect(voiceOn()).toBe(false);
  });

  it("speaks only the exact reply it signed, and only for an hour", () => {
    const now = 1_800_000_000_000;
    const sig = signReply("Points lower the rate.", now);
    expect(verifyReply("Points lower the rate.", sig, now + 1000)).toBe(true);
    expect(verifyReply("Points lower the rate!", sig, now + 1000)).toBe(false);
    expect(verifyReply("Points lower the rate.", sig, now + SIG_TTL_MS + 1)).toBe(false);
    expect(verifyReply("Points lower the rate.", "garbage", now)).toBe(false);
    expect(verifyReply("Points lower the rate.", `${now + 1}.${sig.split(".")[1]}`, now)).toBe(false);
  });

  it("a signature from another key doesn't verify", () => {
    const sig = signReply("Hello");
    process.env.GOOGLE_CLOUD_API_KEY = "other-key";
    expect(verifyReply("Hello", sig)).toBe(false);
  });

  it("leaves emoji out of the spoken version", () => {
    expect(speakableText("Happy to help! 😄 Ask away 👍🏽.")).toBe("Happy to help! Ask away.");
  });

  it("reads markdown as plain speech and caps the length at a sentence", () => {
    expect(speakableText("**Points** lower the rate.\n\n- One [link](https://x.y)\n- Two https://a.b/c")).toBe("Points lower the rate.\nOne link\nTwo");
    const long = "This is one sentence. ".repeat(200);
    const out = speakableText(long);
    expect(out.length).toBeLessThanOrEqual(MAX_SPEAK_CHARS);
    expect(out.endsWith(".")).toBe(true);
  });

  it("offers Google's stock voices only, defaulting to one of them", () => {
    expect(isCandidate(DEFAULT_VOICE)).toBe(true);
    expect(VOICE_CANDIDATES.every((v) => /^en-US-(Chirp3-HD|Studio)-/.test(v.name))).toBe(true);
    expect(isCandidate("en-US-Custom-Owner")).toBe(false);
  });

  it("saves the owner's choice and refuses a voice off the list", async () => {
    setStoreForTests(new MemoryStore());
    expect((await saveVoice("en-US-Custom-Owner", "owner")).ok).toBe(false);
    expect((await saveVoice("en-US-Chirp3-HD-Charon", "owner")).ok).toBe(true);
    expect(await currentVoice()).toBe("en-US-Chirp3-HD-Charon");
  });
});

describe("M8 mic switch (C16)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  it("needs the voice key, and M8_LISTEN=false turns off only the mic", async () => {
    const { listenOn } = await import("./google");
    process.env.GOOGLE_CLOUD_API_KEY = "k";
    delete process.env.M8_VOICE;
    delete process.env.M8_LISTEN;
    expect(listenOn()).toBe(true);
    process.env.M8_LISTEN = "false";
    expect(listenOn()).toBe(false);
    expect(voiceOn()).toBe(true);
    delete process.env.M8_LISTEN;
    process.env.M8_VOICE = "false";
    expect(listenOn()).toBe(false);
  });
});
