import { describe, expect, it } from "vitest";
import { boxFromPoints, boxToPixels, countPdfPages, findSensitive, kindLabel, MASK, maskText } from "./redact";

describe("findSensitive", () => {
  it("finds SSN-shaped strings", () => {
    const m = findSensitive("SSN: 123-45-6789 on file");
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("ssn");
    expect(m[0].value).toBe("123-45-6789");
  });

  it("does not treat ISO dates or money as SSNs or phones", () => {
    const m = findSensitive("Issued 2026-09-29. Loan amount $400,000.00 at 6.500% and APR 6.712%.");
    expect(m).toHaveLength(0);
  });

  it("finds loan / application IDs in several spellings", () => {
    expect(findSensitive("Loan ID: ABC123456").map((m) => m.kind)).toEqual(["loanId"]);
    expect(findSensitive("Application # 99887766").map((m) => m.kind)).toEqual(["loanId"]);
    expect(findSensitive("loan number 2024-00077").map((m) => m.kind)).toEqual(["loanId"]);
    // Too short to be an ID.
    expect(findSensitive("Loan ID: AB1")).toHaveLength(0);
  });

  it("finds email addresses", () => {
    const m = findSensitive("contact sample.borrower+le@example.com today");
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("email");
    expect(m[0].value).toBe("sample.borrower+le@example.com");
  });

  it("finds phone numbers in common formats", () => {
    for (const s of ["(555) 123-4567", "555-123-4567", "555.123.4567", "+1 555 123 4567", "5551234567"]) {
      const m = findSensitive(`call ${s} now`);
      expect(m.map((x) => x.kind), s).toEqual(["phone"]);
    }
  });

  it("finds simple street addresses, with unit suffixes", () => {
    const m = findSensitive("Property: 123 Sample St, Unit 4B, Anytown");
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("address");
    expect(m[0].value).toBe("123 Sample St, Unit 4B");
    expect(findSensitive("4501 North Harbor Boulevard").map((x) => x.kind)).toEqual(["address"]);
  });

  it("prefers SSN over phone on overlapping spans and sorts by offset", () => {
    const m = findSensitive("phone 555-123-4567 ssn 123-45-6789");
    expect(m.map((x) => x.kind)).toEqual(["phone", "ssn"]);
    expect(m[0].start).toBeLessThan(m[1].start);
  });
});

describe("maskText", () => {
  it("replaces every match with the mask and returns the matches", () => {
    const { masked, matches } = maskText("Sample Borrower, 123 Sample St. SSN 123-45-6789. Loan ID: LE-2026-0001.");
    expect(matches.map((m) => m.kind)).toEqual(["address", "ssn", "loanId"]);
    expect(masked).toBe(`Sample Borrower, ${MASK}. SSN ${MASK}. ${MASK}.`);
    expect(masked).not.toContain("123-45-6789");
  });

  it("is idempotent and leaves clean text alone", () => {
    const clean = "Interest rate 6.500%. APR 6.712%. Points 1.000 ($4,000). Cash to close $47,250.";
    expect(maskText(clean).masked).toBe(clean);
    const once = maskText("a 123-45-6789 b").masked;
    expect(maskText(once).masked).toBe(once);
  });

  it("labels every kind", () => {
    for (const k of ["ssn", "loanId", "email", "phone", "address"] as const) {
      expect(kindLabel(k).length).toBeGreaterThan(0);
    }
  });
});

describe("boxes", () => {
  it("normalizes corner order and clamps to 0..1", () => {
    expect(boxFromPoints({ x: 0.8, y: 0.6 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, w: 0.6, h: 0.5 });
    const b = boxFromPoints({ x: -0.5, y: 0.5 }, { x: 1.5, y: 0.7 });
    expect(b).toEqual({ x: 0, y: 0.5, w: 1, h: 0.2 });
  });

  it("rejects boxes that are too small", () => {
    expect(boxFromPoints({ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.9 })).toBeNull();
    expect(boxFromPoints({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toBeNull();
  });

  it("scales to pixels generously (floor origin, ceil size)", () => {
    expect(boxToPixels({ x: 0.1, y: 0.2, w: 0.25, h: 0.1 }, 1000, 500)).toEqual({ x: 100, y: 100, w: 250, h: 50 });
    expect(boxToPixels({ x: 0.333, y: 0, w: 0.333, h: 0.333 }, 100, 100)).toEqual({ x: 33, y: 0, w: 34, h: 34 });
  });
});

describe("countPdfPages", () => {
  it("counts /Type /Page objects, not /Pages", () => {
    const pdf = "%PDF-1.4\n1 0 obj << /Type /Pages /Kids [2 0 R 3 0 R] >>\n2 0 obj << /Type /Page >>\n3 0 obj << /Type/Page >>";
    expect(countPdfPages(pdf)).toBe(2);
  });
  it("returns null for non-PDF bytes", () => {
    expect(countPdfPages("PNG....")).toBeNull();
  });
});
