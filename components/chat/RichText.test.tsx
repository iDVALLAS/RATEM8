import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RichText, { parseBlocks } from "./RichText";
import { copy } from "@/lib/copy";

/** C6: M8's replies show bold and lists instead of raw asterisks. */
describe("RichText (C6)", () => {
  it("renders the owner's screenshot reply without raw asterisks", () => {
    const reply = "Getting set up is easy. A few details:\n\n1. **Purpose** – buying or refinancing?\n2. **Property** – price and ZIP code?\n\nWhat's the first piece?";
    const html = renderToStaticMarkup(<RichText text={reply} />);
    expect(html).not.toContain("**");
    expect(html).toContain("<ol start=\"1\"><li><strong>Purpose</strong> – buying or refinancing?</li>");
    expect(html).toContain("<p>What&#x27;s the first piece?</p>");
  });

  it("makes bullet lists, headings and line breaks", () => {
    expect(parseBlocks("## Options\n- one\n- two\nend")).toEqual([
      { kind: "h", text: "Options" },
      { kind: "ul", items: ["one", "two"] },
      { kind: "p", lines: ["end"] },
    ]);
    expect(renderToStaticMarkup(<RichText text={"line one\nline two"} />)).toBe('<div class="m8-rich"><p>line one<br/>line two</p></div>');
  });

  it("hides an unclosed ** while a reply streams", () => {
    expect(renderToStaticMarkup(<RichText text="What's the **purch" />)).toBe('<div class="m8-rich"><p>What&#x27;s the purch</p></div>');
  });

  it("never renders markup from the reply", () => {
    const html = renderToStaticMarkup(<RichText text={'<img src=x onerror="alert(1)"> **<b>hi</b>**'} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("M8's opening line (C6, owner 2026-11-05)", () => {
  it("is the owner's greeting, with no G'day, no rate line and no loan officer sentence", () => {
    const o = copy.chat.liveOpening;
    expect(`${o.lead}${o.close}`).toBe("Hello, I'm M8. I can assist with anything loan related. What can I help you with today?");
    expect(JSON.stringify(o)).not.toMatch(/g'day|quote a rate|verifies every deal/i);
  });

  it("keeps the AI disclosure on screen: the AI tag and the line above the input", () => {
    expect(copy.chat.live.aiTag).toBe("AI");
    expect(copy.chat.gate.body).toContain("I'm M8, an AI, not a person.");
  });
});
