import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MloFooterLine, MloProvider, MloText } from "./MloContext";
import { copy } from "@/lib/copy";
import type { MloContextValue } from "@/lib/mlo-match";

const mlo = { name: "Pat Example", firstName: "Pat", nmls: "TEST-ID", title: "Mortgage Loan Originator", bioShort: "", nmlsConsumerAccessUrl: "" };
const card = copy.agents.cards[2];

function render(value?: MloContextValue) {
  return renderToStaticMarkup(
    <MloProvider value={value}>
      <p>
        <MloText generic={card.body} named={card.bodyNamed} />
      </p>
      <footer>
        <MloFooterLine />
      </footer>
    </MloProvider>,
  );
}

describe("MloContext rendering", () => {
  it("is generic with no match (the default for every visitor)", () => {
    const out = render();
    expect(out).toContain("A licensed, vetted loan officer of your choosing.");
    expect(out).not.toContain("Pat");
  });

  it("names the matched MLO and puts their NMLS ID on the same page", () => {
    const out = render({ mlo, source: "chosen" });
    expect(out).toContain("Pat. Not a processor in another time zone.");
    expect(out).toContain("Pat Example, Mortgage Loan Originator, NMLS #TEST-ID.");
  });

  it("stays generic on an IP guess in a borrower-choose state", () => {
    expect(render({ mlo, source: "ip", borrowerChooses: true })).not.toContain("Pat");
  });
});
