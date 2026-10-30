import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MloProvider } from "@/components/mlo/MloContext";
import SponsorLockup from "./SponsorLockup";
import { SPONSOR } from "@/lib/config";
import type { MloContextValue } from "@/lib/mlo-match";

const other = { name: "Other Brokerage LLC", idLabel: "NMLS", idNumber: "TEST-77", dba: "Other Home Loans", nmls: "TEST-77" };
const mlo = { name: "Pat Example", firstName: "Pat", nmls: "TEST-ID", title: "MLO", bioShort: "", nmlsConsumerAccessUrl: "", id: "test", photo: "", calendly: "", applicationUrl: "", licenses: [] };

const render = (value?: MloContextValue) =>
  renderToStaticMarkup(
    <MloProvider value={value}>
      <SponsorLockup variant="line" />
    </MloProvider>,
  );

describe("SponsorLockup (v35)", () => {
  it("shows the default sponsor, with its NMLS ID and a linking phrase, before any match", () => {
    const out = render();
    expect(out).toContain("powered by");
    expect(out).toContain(SPONSOR.dba!);
    expect(out).toContain(`NMLS #${SPONSOR.nmls}`);
  });

  it("follows the matched loan officer's sponsor in that state (owner: based on the location shown or changed)", () => {
    const out = render({ mlo, source: "chosen", status: "matched", license: { state: "WA", license: "X", sponsor: other, sponsorSince: "2026-01-01" } });
    expect(out).toContain("Other Home Loans");
    expect(out).toContain("NMLS #TEST-77");
    expect(out).not.toContain(SPONSOR.dba!);
  });
});
