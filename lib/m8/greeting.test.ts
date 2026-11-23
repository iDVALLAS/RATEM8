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

describe("No G'day, the edges (D87.5)", () => {
  const SLANG = /g['’‘ʼ`]?day/i;
  it("catches markdown, every apostrophe mark and the plural", () => {
    expect(fixGreeting("_G'day!_ I'm M8.")).toBe("_Hi!_ I'm M8.");
    expect(fixGreeting("**G'day**, welcome")).toBe("**Hi**, welcome");
    expect(fixGreeting("G‘day")).toBe("Hi");
    expect(fixGreeting("Gʼday")).toBe("Hi");
    expect(fixGreeting("G`day")).toBe("Hi");
    expect(fixGreeting("G'days, all")).toBe("Hi, all");
    expect(fixGreeting("g'day")).toBe("hi");
  });

  it("leaves real words alone", () => {
    for (const s of ["Today is fine.", "Monday or Tuesday", "Happy birthday", "Good day!", "Thanksgiving day", "Gdaynia", "Big day ahead", "dog days"])
      expect(fixGreeting(s), s).toBe(s);
  });

  it("never lets it through while streaming, whatever the pieces", () => {
    const texts = ["_G'day!_ Happy to help.", "G'days, mate.", "Sure. G’day to you.", "**G'day** there", "Today is Monday."];
    for (const text of texts)
      for (let cut = 1; cut < text.length; cut++)
        for (let cut2 = cut + 1; cut2 <= Math.min(text.length, cut + 4); cut2++) {
          const f = greetingFilter();
          const out = f.push(text.slice(0, cut)) + f.push(text.slice(cut, cut2)) + f.push(text.slice(cut2)) + f.flush();
          expect(out, `${text} @ ${cut}/${cut2}`).toBe(fixGreeting(text));
          expect(out).not.toMatch(SLANG);
          expect(out).not.toMatch(/\bHis\b/);
        }
  });
});
