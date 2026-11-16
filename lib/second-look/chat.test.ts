import { describe, expect, it } from "vitest";
import { leChatMessage } from "./chat";
import { guardReply, userPercentages } from "@/lib/m8/guard";

const f = (value: string | null) => ({ value, explanation: "x" });
const result = {
  rate: f("6.500%"), apr: f("6.712%"), points: f("$4,000"), lenderCredits: f(null), sectionA: f("$5,195"),
  sectionBC: f("$3,410"), cashToClose: f("$62,480"), negotiableFees: [], fixedFees: [], questions: [], summary: "s", confidence: "high" as const,
};

describe("Loan Estimate upload message (C20)", () => {
  it("lists the figures M8 read, skipping ones not found", () => {
    const m = leChatMessage(result);
    expect(m).toContain("- Interest rate: 6.500%");
    expect(m).toContain("- Estimated cash to close: $62,480");
    expect(m).not.toContain("Lender credits");
  });
  it("lets M8 repeat the borrower's own rate and APR from it", () => {
    const stated = userPercentages([leChatMessage(result)]);
    expect(guardReply("Your Loan Estimate shows a 6.5% rate and a 6.712% APR.", new Set(), stated).ok).toBe(true);
  });
});
