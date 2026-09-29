/**
 * lib/content/join.ts — extra strings for /join that are not in
 * lib/copy.ts (metadata, text equivalents, mock labels).
 *
 * Compliance: nothing here mentions compensation, income, volume, or
 * earnings. The only compensation sentence on the page lives in
 * copy.join.lookFor.items and is rendered verbatim.
 */

export const JOIN_META = {
  title: "For licensed MLOs — LoanM8",
  description:
    "LoanM8 is recruiting licensed Mortgage Loan Originators in WA, AZ, CA, and TX. M8 handles the borrower's first conversation; you originate. Details on the intro call.",
};

export const JOIN_CRUMB = "For licensed MLOs";

/** Plain-text descriptions of each animated scene (WCAG text equivalents). */
export const JOIN_TEXT_EQUIVALENTS = [
  "Scene one. The headline reads: Got a license and something to prove? A green orb slides in from the top-right corner and settles. A line of text explains this is for originators who would rather explain the math than pressure a borrower.",
  "Scene two. The title reads: Every state. One originator per area. Four cards stack in one at a time, each linking to a state page where LoanM8 is live today: Western Washington, Arizona, California, and Texas. A fifth, dashed card reads: Every other state, vetting now.",
  "Scene three. A phone mockup shows a scripted chat between a borrower and M8. The borrower asks about a fee on a lender's estimate; M8 says it is an AI, not a person, asks which section the fee is in, then explains it is a lender-controlled charge and offers a licensed loan officer. A small card labeled Rate Strategy Brief shows a progress bar filling, then reads drafted. The sample is fictional.",
  "Scene four. A four-slot grid fills in one card at a time: a routed sample borrower marked as fictional; a three-option wholesale comparison shown the anti-steering way with labels only and no figures; a pipeline of four dots lighting in order, Application, LE, Lock, Close; and a compliance card listing soft pull only, disclosures logged, documented decisions.",
  "Scene five. On a light background the headline reads: You originate. M8 handles the intake. The LoanM8 wordmark appears, followed by a Book an intro call button and a strip of the four states where LoanM8 is live today.",
];

/** Rate Strategy Brief mock states (scene three). */
export const JOIN_BRIEF = {
  drafted: "Rate Strategy Brief · drafted",
};
