import { describe, expect, it } from "vitest";
import { SentenceSplitter } from "./sentences";

describe("speaking a reply as it streams (C18)", () => {
  it("hands over the first sentence as soon as it's complete", () => {
    const s = new SentenceSplitter();
    expect(s.push("Great question. A discount ")).toEqual([]);
    expect(s.push("point is a fee you pay at closing to lower your rate. Each one costs 1% of the loan")).toEqual(["Great question. A discount point is a fee you pay at closing to lower your rate."]);
    expect(s.push(" amount, so on a $400,000 loan that's $4,000. It's worth it if you keep the loan long enough.")).toEqual(["Each one costs 1% of the loan amount, so on a $400,000 loan that's $4,000."]);
    expect(s.flush()).toBe("It's worth it if you keep the loan long enough.");
  });

  it("never cuts at a decimal or an abbreviation", () => {
    const s = new SentenceSplitter();
    const text = "FHA lets you put 3.5% down, e.g. on a starter home. Conventional loans start at 3% down for many first-time buyers. That's it!";
    const pieces = [...[...text].flatMap((c) => s.push(c)), s.flush()].filter(Boolean);
    expect(pieces).toEqual(["FHA lets you put 3.5% down, e.g. on a starter home.", "Conventional loans start at 3% down for many first-time buyers.", "That's it!"]);
    expect(pieces.join(" ")).toBe(text);
  });

  it("treats list lines as pieces", () => {
    const s = new SentenceSplitter();
    const out = s.push("Here are your options:\n- 3% conventional for first-time buyers with good credit\n- 3.5% FHA\n");
    expect(out[0]).toBe("Here are your options:");
  });
});

it("joins a short sentence onto the next one after the first piece", () => {
  const s = new SentenceSplitter();
  expect(s.push("Points lower the rate for good. Yes. They cost money now, and they pay off over years of payments. ")).toEqual(["Points lower the rate for good.", "Yes. They cost money now, and they pay off over years of payments."]);
});
