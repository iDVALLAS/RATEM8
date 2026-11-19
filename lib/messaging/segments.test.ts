import { describe, expect, it } from "vitest";
import { isGsm, segmentInfo, segmentLabel, toGsm } from "./segments";
import { STEPS } from "@/lib/journey/steps";
import { RECIPES } from "@/lib/automations/recipes";
import { CONCIERGE_TEMPLATES } from "@/lib/concierge/agent";
import { signature } from "@/lib/messaging/service";

describe("Text segments (D25)", () => {
  it("counts GSM-7 and UCS-2 segments the way carriers bill them", () => {
    expect(segmentInfo("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1 });
    expect(segmentInfo("a".repeat(161))).toMatchObject({ segments: 2 });
    expect(segmentInfo("a".repeat(306))).toMatchObject({ segments: 2 });
    expect(segmentInfo("[]".repeat(40))).toMatchObject({ units: 160, segments: 1 }); // extension characters count twice
    expect(segmentInfo(`${"a".repeat(69)}😀`)).toMatchObject({ encoding: "UCS-2", segments: 2 });
    expect(segmentInfo("a".repeat(70) + "é")).toMatchObject({ encoding: "GSM-7" });
  });
  it("swaps typographic punctuation so a text stays cheap", () => {
    const fancy = "It’s “ready” – see you…";
    expect(isGsm(fancy)).toBe(false);
    expect(toGsm(fancy)).toBe(`It's "ready" - see you...`);
    expect(isGsm(toGsm(fancy))).toBe(true);
    expect(segmentLabel("Thanks 🙏")).toMatch(/70 characters a segment/);
  });
  it("every message Command Center can draft stays plain text, within 2 segments with the sign-off", () => {
    const sig = signature({ id: "lo1", email: "", name: "Pat", role: "lo", mloId: "mlo-001", status: "active", createdAt: "", createdBy: "" });
    const texts = [
      ...STEPS.filter((s) => s.message).map((s) => s.message!({ first: "Ann", me: "Pat", portal: "https://loanm8.com/apply" })),
      ...RECIPES.filter((r) => r.body).map((r) => r.body!({ first: "Ann", me: "Pat", client: "Bo" })),
      ...Object.values(CONCIERGE_TEMPLATES).map((t) => t("Ann")),
    ];
    for (const t of texts) {
      const s = segmentInfo(toGsm(`${t}\n\n${sig}`));
      expect(s.encoding, t).toBe("GSM-7");
      expect(s.segments, t).toBeLessThanOrEqual(2);
    }
  });
});
