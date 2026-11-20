import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { User } from "@/lib/accounts/store";
import { checkSignature, newMemorySignatureStore, saveSignature, setSignatureStoreForTests, signatureFor, suggestSignature } from "./signature";

const me: User = { id: "u_me", email: "me@example.com", name: "Pat Quinn", role: "lo", mloId: null, status: "active", createdAt: "", createdBy: "" };

beforeEach(() => setSignatureStoreForTests(newMemorySignatureStore()));
afterEach(() => setSignatureStoreForTests(null));

describe("Email signature (D49)", () => {
  it("tidies spacing and keeps a normal signature", () => {
    const r = checkSignature("Pat Quinn  \r\nMortgage Loan Officer\n\n\n\nhttps://cal.example/pat\n");
    expect(r).toEqual({ ok: true, text: "Pat Quinn\nMortgage Loan Officer\n\nhttps://cal.example/pat" });
    expect(checkSignature("   ")).toEqual({ ok: true, text: "" });
  });

  it("refuses rates, promises, fair-housing words, http links, HTML and account-like numbers", () => {
    const bad = [
      "Rates from 5.99%",
      "Ask me about today's interest rate",
      ["Guaran", "teed approval"].join(""),
      ["The low", "est rates in town"].join(""),
      "Great for young families",
      "http://example.com",
      "<b>Pat</b>",
      "Acct 4111 1111 1111 1111",
    ];
    for (const b of bad) expect(checkSignature(b).ok, b).toBe(false);
  });

  it("limits length and lines", () => {
    expect(checkSignature("x".repeat(601)).ok).toBe(false);
    expect(checkSignature(Array.from({ length: 11 }, (_, i) => `line ${i}`).join("\n")).ok).toBe(false);
  });

  it("suggests one from what's on file, without inventing anything", () => {
    expect(suggestSignature(me)).toBe("Pat Quinn\nme@example.com");
  });

  it("saves, reads back and clears", async () => {
    expect(await saveSignature(me, "Pat Quinn\nhttps://cal.example/pat")).toEqual({ ok: true, text: "Pat Quinn\nhttps://cal.example/pat" });
    expect(await signatureFor(me)).toBe("Pat Quinn\nhttps://cal.example/pat");
    expect((await saveSignature(me, ["Be", "st rates around"].join(""))).ok).toBe(false);
    expect(await signatureFor(me)).toBe("Pat Quinn\nhttps://cal.example/pat");
    await saveSignature(me, "");
    expect(await signatureFor(me)).toBe("");
    expect((await saveSignature({ ...me, status: "disabled" }, "Pat")).ok).toBe(false);
  });
});
