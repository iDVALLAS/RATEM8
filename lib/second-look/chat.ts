/**
 * lib/second-look/chat.ts — client-safe (C20). After a Loan Estimate
 * upload, the chat sends M8 the figures it read, as the borrower's own
 * message, so M8 can walk through them (the guard lets M8 repeat numbers
 * the borrower's messages contain).
 */
import type { SecondLookResult } from "./schema";

export function leChatMessage(r: SecondLookResult): string {
  const line = (label: string, f: { value: string | null }) => (f.value ? `- ${label}: ${f.value}` : null);
  const lines = [
    line("Interest rate", r.rate),
    line("APR", r.apr),
    line("Points", r.points),
    line("Lender credits", r.lenderCredits),
    line("Section A, origination charges", r.sectionA),
    line("Sections B and C, services", r.sectionBC),
    line("Estimated cash to close", r.cashToClose),
  ].filter(Boolean);
  return [
    "I just uploaded my Loan Estimate. Here's what M8 read from it:",
    ...(lines.length ? lines : ["- (no standard figures were found)"]),
    "Can you walk me through it in plain English?",
  ].join("\n");
}
