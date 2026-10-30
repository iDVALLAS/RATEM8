import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BROWSER_VOICE, createVoice, pickVoice, splitSentences } from "./provider";
import { resetTtsGuard, ttsGuard, TTS_MAX_CHARS, TTS_MAX_PER_WINDOW } from "./tts-guard";

describe("voice provider (v33)", () => {
  it("splits a reply into sentences without breaking decimals", () => {
    expect(splitSentences("Straight answer: 6.375% to 6.625%. Real improvement over your 7.25%. Want me to loop in your loan officer?")).toEqual([
      "Straight answer: 6.375% to 6.625%.",
      "Real improvement over your 7.25%.",
      "Want me to loop in your loan officer?",
    ]);
    expect(splitSentences("  ")).toEqual([]);
  });

  it("uses the owner's robot-voice settings and prefers US English", () => {
    expect(BROWSER_VOICE).toEqual({ rate: 1.0, pitch: 0.9 });
    const voices = [
      { lang: "fr-FR", default: true, name: "a" },
      { lang: "en-GB", default: false, name: "b" },
      { lang: "en-US", default: false, name: "c" },
      { lang: "en-US", default: true, name: "d" },
    ];
    expect(pickVoice(voices)).toBe(3);
    expect(pickVoice([{ lang: "de-DE", default: true, name: "x" }])).toBe(-1);
  });

  it("switches engines with one setting", () => {
    expect(createVoice("browser").kind).toBe("browser");
    expect(createVoice("elevenlabs").kind).toBe("elevenlabs");
  });
});

describe("TTS route guard (v33)", () => {
  const base = { text: "Hello there.", origin: "https://loanm8.com", fetchSite: "same-origin", host: "loanm8.com", ip: "1.2.3.4", now: 1_000 };
  beforeEach(() => resetTtsGuard());

  it("allows short, same-site requests", () => {
    expect(ttsGuard(base)).toBe("ok");
  });

  it("refuses empty, oversized and cross-site requests", () => {
    expect(ttsGuard({ ...base, text: "" })).toBe(400);
    expect(ttsGuard({ ...base, text: "x".repeat(TTS_MAX_CHARS + 1) })).toBe(413);
    expect(ttsGuard({ ...base, fetchSite: "cross-site" })).toBe(403);
    expect(ttsGuard({ ...base, fetchSite: null, origin: "https://evil.example" })).toBe(403);
    expect(ttsGuard({ ...base, fetchSite: null, origin: null })).toBe(403);
  });

  it("rate-limits each visitor", () => {
    for (let i = 0; i < TTS_MAX_PER_WINDOW; i++) expect(ttsGuard(base)).toBe("ok");
    expect(ttsGuard(base)).toBe(429);
    expect(ttsGuard({ ...base, ip: "5.6.7.8" })).toBe("ok");
    expect(ttsGuard({ ...base, now: 1_000 + 61_000 })).toBe("ok");
  });
});

describe("TTS route (v33)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });
  const req = (text: string) =>
    new Request("https://loanm8.com/api/voice/tts", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", host: "loanm8.com" },
      body: JSON.stringify({ text }),
    });

  it("is off (503) unless VOICE_PROVIDER=elevenlabs and a key is set", async () => {
    vi.stubEnv("VOICE_PROVIDER", "browser");
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    const { POST } = await import("@/app/api/voice/tts/route");
    expect((await POST(req("Hi there."))).status).toBe(503);
  });

  it("never sends SSN-shaped text to the vendor", async () => {
    vi.stubEnv("VOICE_PROVIDER", "elevenlabs");
    vi.stubEnv("ELEVENLABS_API_KEY", "k");
    const spy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/voice/tts/route");
    expect((await POST(req("My SSN is 123-45-6789."))).status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls ElevenLabs with the key on the server and returns audio", async () => {
    vi.stubEnv("VOICE_PROVIDER", "elevenlabs");
    vi.stubEnv("ELEVENLABS_API_KEY", "secret-key");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("mp3", { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const { POST } = await import("@/app/api/voice/tts/route");
    const res = await POST(req("Rates change daily."));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\//);
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("secret-key");
  });
});

describe("the M8 chat page (v33, L3)", () => {
  const src = readFileSync("components/m8chat/M8ChatPage.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  it("shows no scripted conversation and no 'illustrative' or 'example' badge", () => {
    expect(src).not.toMatch(/demoChat|ExamplePricingLabel|illustrative/i);
  });
  it("never calls anything live", () => {
    expect(src).not.toMatch(/\blive\b/i);
  });
  it("opens with M8's AI disclosure", async () => {
    const { copy } = await import("@/lib/copy");
    expect(copy.m8chat.intro.startsWith("I'm M8, an AI, not a person.")).toBe(true);
    expect(copy.m8chat.introNamed.startsWith("I'm M8, an AI, not a person.")).toBe(true);
  });
});
