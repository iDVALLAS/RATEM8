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

describe("guard and a dated example's figures (C9.2)", () => {
  // From a published snapshot: rate 6.875, APR 7.052, points 1.157; rate 7.375, APR 7.401, a 0.036% credit.
  const priced = new Set(["6.875", "7.052", "1.157", "7.375", "7.401", "0.036"].map((n) => Number(n).toFixed(3)));
  const tail = " Priced 11/6/2026 at 3:15 PM. This isn't a commitment to lend.";

  it("allows priced rates, APRs and points, exact or rounded to two decimals", () => {
    expect(guardReply("Lender A: 6.875% rate, 7.052% APR, 1.157% in points." + tail, priced)).toEqual({ ok: true });
    expect(guardReply("Lender A: 6.875% rate (APR 7.05%), about 1.16% in points." + tail, priced)).toEqual({ ok: true });
    expect(guardReply("Lender B: 7.375% rate with a 7.40% APR and no points." + tail, priced)).toEqual({ ok: true });
  });

  it("still blocks a rate that isn't in the result, and names it", () => {
    expect(guardReply("Lender A: 6.75% rate, APR 6.80%." + tail, priced)).toEqual({ ok: false, reason: "unquoted-rate", value: "6.75%" });
    // One decimal or none is not a priced figure: "7%" is not 6.875%.
    expect(guardReply("Rates are around 7% today, APR 7.1%." + tail, priced)).toMatchObject({ ok: false, reason: "unquoted-rate" });
  });
});

describe("guard while a reply streams (C16.1)", () => {
  const full = "FHA loans let you put as little as 3.5% down, and conventional loans start at 3% down for first-time buyers.";
  it("doesn't block a down payment percentage before the word 'down' arrives", () => {
    for (let i = 1; i <= full.length; i++) expect(guardReply(full.slice(0, i), new Set(), new Set(), true).ok).toBe(true);
    expect(guardReply(full, new Set())).toEqual({ ok: true });
  });
  it("still blocks a bare rate once the reply is finished, and a named rate mid-stream", () => {
    expect(guardReply("Right now you could get 6.25%", new Set(), new Set(), true).ok).toBe(true);
    expect(guardReply("Right now you could get 6.25%.", new Set()).ok).toBe(false);
    expect(guardReply("The rate is 6.25%", new Set(), new Set(), true).ok).toBe(false);
  });
});

describe("guard fallback text (C16.1)", () => {
  it("capitalizes the generic name at a sentence start", async () => {
    const { fallbackFor } = await import("./pipeline");
    expect(fallbackFor("unquoted-rate", "a licensed loan officer")).toBe("I can't quote a rate right now. A licensed loan officer can send you live pricing.");
  });
});

describe("guard reads a list's lead-in (C16.1)", () => {
  const reply = "Great question! Here's a plain-English breakdown:\n\n**Common down payment options:**\n\n- **3% – Conventional loans** (e.g., HomeReady or Home Possible) are available to first-time buyers with solid credit.\n- **3.5% – FHA loans** are popular for first-timers, with more flexible credit guidelines.\n- **20%** avoids private mortgage insurance on a conventional loan.";
  it("treats percentages under a down payment heading as down payments, streaming or finished", () => {
    for (let i = 1; i <= reply.length; i += 7) expect(guardReply(reply.slice(0, i), new Set(), new Set(), true).ok).toBe(true);
    expect(guardReply(reply, new Set())).toEqual({ ok: true });
  });
  it("still blocks a rate list, or a heading that names rates", () => {
    expect(guardReply("**Today's options:**\n\n- 6.25% – 30-year loans for buyers with good credit.", new Set()).ok).toBe(false);
    expect(guardReply("**Down payment and rates:**\n\n- 6.25% – 30-year loans.", new Set()).ok).toBe(false);
  });
});
