import { describe, expect, it } from "vitest";
import { fixGreeting, greetingFilter } from "./guard";

describe("No G'day (D67.1)", () => {
  it("swaps the slang for Hi, in any spelling, and leaves other words alone", () => {
    expect(fixGreeting("G'day! I'm M8.")).toBe("Hi! I'm M8.");
    expect(fixGreeting("G\u2019day, how can I help?")).toBe("Hi, how can I help?");
    expect(fixGreeting("Gday and welcome")).toBe("Hi and welcome");
    expect(fixGreeting("Great day to buy. Good day!")).toBe("Great day to buy. Good day!");
  });

  it("fixes it even when the word arrives in pieces while streaming", () => {
    for (const pieces of [["G", "'d", "ay", "! Happy to help."], ["G'", "day, ", "ma", "te. ", "Ask away."], ["Great", " question."], ["Hi", " there"]]) {
      const f = greetingFilter();
      const out = pieces.map((p) => f.push(p)).join("") + f.flush();
      expect(out).toBe(fixGreeting(pieces.join("")));
      expect(out).not.toMatch(/g'?day/i);
    }
  });
});
