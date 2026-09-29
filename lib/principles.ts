/**
 * The Eight Principles — LOCKED, verbatim.
 *
 * Titles and bodies are the canonical text from the site brief. Do not
 * edit. `accent` marks the one word (or short phrase) that renders in
 * italic serif M8 Green in headline treatments; it must be a substring
 * of `title`.
 *
 * `version` is exposed on /ai and /principles.md so agents can cite a
 * stable revision.
 */

export type Principle = {
  number: number;
  title: string;
  body: string;
  accent: string;
  /** Short explanation used on /principles and /ai. Not part of the locked text. */
  expansion: string;
};

export const PRINCIPLES_VERSION = "2026-09-29";

export const principles: Principle[] = [
  {
    number: 1,
    title: "One loan officer, start to close.",
    body: "No bouncing between reps.",
    accent: "start to close",
    expansion:
      "The person who takes your first call is the person who closes your loan. No processor in another time zone, no handoff when it gets hard.",
  },
  {
    number: 2,
    title: "Live wholesale pricing.",
    body: "Not yesterday's bait rate.",
    accent: "Live",
    expansion:
      "Pricing on your file comes from the wholesale panel at the moment it is shopped, on your scenario, not from an advertised number that nobody actually gets.",
  },
  {
    number: 3,
    title: "Every lender shopped on every file.",
    body: "Same algorithm for everyone.",
    accent: "Every",
    expansion:
      "The same comparison runs on every file. No favorites, no lender that gets the loan because it is easier for us.",
  },
  {
    number: 4,
    title: "All-in cost displayed before you decide.",
    body: "No surprises at signing.",
    accent: "All-in",
    expansion:
      "Rate, points, lender fees, third-party fees, and cash to close, totaled and shown before you choose an option.",
  },
  {
    number: 5,
    title: "Soft pull until you're ready.",
    body: "No trigger leads. No spam blast.",
    accent: "Soft pull",
    expansion:
      "A soft inquiry does not create a trigger lead, so other lenders never learn you are shopping. A hard pull happens only when you decide to apply.",
  },
  {
    number: 6,
    title: "Your data stays yours.",
    body: "Never sold, never shared, fully exportable.",
    accent: "yours",
    expansion:
      "We do not sell leads. We do not share your file with marketers. You can export or delete what we hold on request.",
  },
  {
    number: 7,
    title: "M8 shops the math. A licensed human verifies the deal.",
    body: "",
    accent: "A licensed human",
    expansion:
      "M8 is an AI. It compares, explains, and documents. It does not approve, sign, or commit. A licensed loan officer checks every file before anything is promised.",
  },
  {
    number: 8,
    title: "Documented decisions.",
    body: "You leave with a written record.",
    accent: "Documented",
    expansion:
      "Every option you were shown, every tradeoff, and why the chosen loan was chosen, written down in a Rate Strategy Brief you keep.",
  },
];
