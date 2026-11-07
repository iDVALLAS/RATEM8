import { beforeEach, describe, expect, it } from "vitest";
import { redactChatInput } from "./redact";
import { isAbusive } from "./moderation";
import { findRateMentions, guardReply } from "./guard";
import { prepareTurn, runM8Turn } from "./pipeline";
import { checkRateLimit, LIMITS } from "./limits";
import { resetMemoryCounters } from "./kv";
import { storageOn, saveTranscript, deleteSession } from "./store";
import { M8_MAX_TOKENS, maxTurns } from "./server";
import { fakeClient, chunk } from "../../tests/m8-harness";

describe("redaction (C4)", () => {
  it("masks SSNs, birth dates and account numbers", () => {
    expect(redactChatInput("ssn 123-45-6789").kinds).toEqual(["ssn"]);
    expect(redactChatInput("ssn 123456789.").kinds).toEqual(["ssn"]);
    expect(redactChatInput("my DOB is 3/14/1985").kinds).toEqual(["dob"]);
    expect(redactChatInput("born March 14, 1985").kinds).toEqual(["dob"]);
    expect(redactChatInput("card 4111 1111 1111 1111").kinds).toEqual(["account"]);
  });

  it("leaves loan amounts, ZIP codes, percentages and closing dates alone", () => {
    const text = "Borrowing $640,000 on a $1,100,000 home in 98004 at 6.5%, closing 12/15/2026, about 1200000 total.";
    expect(redactChatInput(text)).toEqual({ text, kinds: [] });
  });
});

describe("moderation (C4)", () => {
  it("blocks threats and abuse, never frustration", () => {
    expect(isAbusive("you're a fucking idiot")).toBe(true);
    expect(isAbusive("kys")).toBe(true);
    expect(isAbusive("ugh, this is killing me, rates are confusing")).toBe(false);
    expect(isAbusive("Can I kill the PMI early?")).toBe(false);
  });
});

describe("output guard (C4)", () => {
  it("reads rates by their context", () => {
    expect(findRateMentions("The 30-year fixed is 6.5% today").length).toBe(1);
    expect(findRateMentions("Put 20% down and you avoid PMI").length).toBe(0);
    expect(findRateMentions("an 80% LTV").length).toBe(0);
  });

  it("passes a plain explanation with no numbers", () => {
    expect(guardReply("Points lower your rate in exchange for money at closing. Your loan officer can price both ways.", new Set())).toEqual({ ok: true });
  });
});

describe("pipeline (C4)", () => {
  it("streams a clean reply slice by slice, offering exactly the two tools, and counts tokens", async () => {
    const { client, calls } = fakeClient([{ chunks: chunk("Points are prepaid interest. Want to compare both ways?") }]);
    const events: string[] = [];
    const r = await runM8Turn({ client, model: "fake", maxTokens: M8_MAX_TOKENS, system: "SYSTEM", turn: prepareTurn([{ role: "user", content: "What are points?" }]), tools: { sessionId: "s", mloId: null, mloName: null, state: null }, mloName: "x", emit: (e) => e.text && events.push(e.text) });
    expect(r.guard).toBeNull();
    expect(events.join("")).toBe(r.reply);
    expect(calls[0].system).toBe("SYSTEM");
    expect(calls[0].tools).toEqual(["get_pricing", "request_handoff"]);
    expect(r.tokens).toBe(150);
  });

  it("sends redacted text to the model, never the original", async () => {
    const { client, calls } = fakeClient([{ chunks: ["Please don't share that here."] }]);
    await runM8Turn({ client, model: "fake", maxTokens: 800, system: "s", turn: prepareTurn([{ role: "user", content: "SSN 123-45-6789" }]), tools: { sessionId: "s", mloId: null, mloName: null, state: null }, mloName: "x", emit: () => {} });
    expect(JSON.stringify(calls[0].messages)).not.toContain("123-45-6789");
  });

  it("runs a tool call and feeds the result back", async () => {
    const { client, calls } = fakeClient([
      { chunks: [], tool: { name: "request_handoff", input: { reason: "question", summary: "Wants a call about FHA." } } },
      { chunks: ["I've passed that on."] },
    ]);
    const r = await runM8Turn({ client, model: "fake", maxTokens: 800, system: "s", turn: prepareTurn([{ role: "user", content: "Have someone call me." }]), tools: { sessionId: "s", mloId: null, mloName: null, state: null }, mloName: "x", emit: () => {} });
    expect(r.reply).toBe("I've passed that on.");
    expect(JSON.stringify(calls[1].messages)).toContain("tool_result");
  });
});

describe("switches (C4)", () => {
  beforeEach(() => resetMemoryCounters());

  it("limits work without Upstash, per IP per minute", async () => {
    for (let i = 0; i < LIMITS.ipPerMinute; i++) expect((await checkRateLimit("ip1", `s${i}`)).ok).toBe(true);
    expect((await checkRateLimit("ip1", "s-new")).ok).toBe(false);
  });

  it("storage is off and a no-op without DATABASE_URL", async () => {
    expect(storageOn()).toBe(false);
    expect(await saveTranscript("s", [], { state: null, mloId: null, noticeVersion: "t", twoPartyState: false })).toBe(false);
    expect(await deleteSession("s")).toBe(false);
  });

  it("brief values: 800 output tokens, 40 turns", () => {
    expect(M8_MAX_TOKENS).toBe(800);
    expect(maxTurns()).toBe(40);
  });
});
