import { z } from "zod";

/**
 * lib/second-look/schema.ts — the structured shape /api/second-look
 * returns. The model is asked to emit exactly this JSON; anything that
 * does not validate is rejected with a 502 (never rendered).
 *
 * Every field is an EXPLANATION of the borrower's own document. There
 * is no field for a LoanM8 price, a comparison, or a recommendation —
 * by design (compliance rule 4).
 */

export const FieldSchema = z.object({
  /** The value as it appears on the document, or null if not found. */
  value: z.string().max(80).nullable(),
  /** Plain-English explanation of what this line means. Neutral. */
  explanation: z.string().max(400),
});

export const SecondLookResultSchema = z.object({
  rate: FieldSchema,
  apr: FieldSchema,
  points: FieldSchema,
  lenderCredits: FieldSchema,
  sectionA: FieldSchema,
  sectionBC: FieldSchema,
  cashToClose: FieldSchema,
  /** Fees the lender sets or that the borrower may shop. */
  negotiableFees: z.array(z.string().max(160)).max(12),
  /** Fees that are pass-through or set by third parties. */
  fixedFees: z.array(z.string().max(160)).max(12),
  /** Neutral questions the borrower can ask their lender. */
  questions: z.array(z.string().max(240)).max(6),
  summary: z.string().max(600),
  confidence: z.enum(["low", "medium", "high"]),
});

export type SecondLookField = z.infer<typeof FieldSchema>;
export type SecondLookResult = z.infer<typeof SecondLookResultSchema>;

/** The response envelope every /api/second-look reply uses. */
export type SecondLookResponse =
  | { ok: true; result: SecondLookResult; disclaimer: string; as_of: string }
  | { ok: false; message: string; disclaimer: string; as_of: string };

/** Locked disclaimer text — included on every response, including 503. */
export const SECOND_LOOK_DISCLAIMER =
  "AI-generated explanation of your own document. Not a commitment to lend, not an offer, not a pricing comparison.";
