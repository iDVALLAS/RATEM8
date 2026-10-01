import { describe, expect, it } from "vitest";
import { copy } from "@/lib/copy";
import { CONFIG } from "@/lib/config";

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

describe("pricing copy", () => {
  it("never says 'live' while live pricing is off", () => {
    expect(CONFIG.pricing.live).toBe(false);
    for (const s of strings(copy.pricing)) expect(s).not.toMatch(/\blive\b/i);
  });
  it("labels every surface as not a quote or commitment to lend", () => {
    expect(copy.pricing.labelExample).toMatch(/not a quote or commitment to lend/);
    expect(copy.pricing.labelSnapshot).toMatch(/not a quote or commitment to lend/);
  });
  it("ships example pricing on and every live path off by default", () => {
    expect(CONFIG.pricing.demoExamples).toBe(true);
    expect(CONFIG.pricing.manual).toBe(false);
    expect(CONFIG.pricing.ratesheet).toBe(false);
    expect(CONFIG.pricing.mloRouting).toBe(false);
  });
});
