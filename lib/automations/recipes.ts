/**
 * lib/automations/recipes.ts — ready-made follow-up for loan stages and
 * past clients (D10). Pure and client-safe.
 *
 * Taken from what loan officers like most in Viato ("text the borrower the
 * moment the loan hits Clear to Close", "alert your referral partner the
 * day their client's loan funds") and Bonzo's pre-built campaigns, reshaped
 * for our rules:
 *  - every step is a draft for the loan officer to approve, or a reminder
 *    (sending on its own waits for counsel)
 *  - the send gate checks each draft again at approval
 *  - stage updates say what happened and what's next, never a date, an
 *    approval, a rate or a promise
 *  - an agent hears about a client's loan only when the client said so
 */

export const STAGES = ["application", "disclosures", "appraisal", "underwriting", "conditions", "clear_to_close", "closed"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  application: "Application received",
  disclosures: "Disclosures sent",
  appraisal: "Appraisal ordered",
  underwriting: "In underwriting",
  conditions: "Conditions",
  clear_to_close: "Clear to close",
  closed: "Closed or funded",
};

/** The loan system's stage name, in our words (order matters: most specific first). */
const STAGE_OF: [RegExp, Stage][] = [
  [/\b(funded|closed|disburs|purchased|complete(d)?)\b/i, "closed"],
  [/\b(clear to close|ctc|cleared to close|docs? (out|drawn|sent)|closing docs)\b/i, "clear_to_close"],
  [/\b(condition|suspen|resubmi)/i, "conditions"],
  [/\b(underwrit|submitted|submission)/i, "underwriting"],
  [/\b(apprais)/i, "appraisal"],
  [/\b(disclos|initial (le|loan estimate))/i, "disclosures"],
  [/\b(application|app taken|registered|started|1003)/i, "application"],
];
export function stageOf(milestone: string | null | undefined): Stage | null {
  if (!milestone) return null;
  return STAGE_OF.find(([re]) => re.test(milestone))?.[1] ?? null;
}

export type Trigger = { kind: "stage"; stage: Stage } | { kind: "closed_days"; days: number } | { kind: "new_contact" };
export type Audience = "borrower" | "agent";

/** Text for a draft. `first` is the recipient's first name; `client` the borrower's (for agents). */
export type Body = (p: { first: string; me: string; client: string }) => string;

export type Recipe = {
  id: string;
  group: "borrower_updates" | "agent_updates" | "past_clients" | "new_contacts";
  label: string;
  description: string;
  trigger: Trigger;
  to: Audience;
  purpose: "service" | "marketing";
  /** A draft text, or (when absent) only a reminder. */
  body?: Body;
  task?: (p: { first: string; client: string }) => string;
};

const hi = (first: string) => (first ? `Hi ${first}` : "Hi");
const sig = (me: string) => (me ? ` -${me}` : "");

/** Borrower updates: what happened, what's next, who to ask. */
const borrower = (stage: Stage, line: string, next: string): Recipe => ({
  id: `borrower_${stage}`,
  group: "borrower_updates",
  label: `Borrower: ${STAGE_LABELS[stage].toLowerCase()}`,
  description: `When their loan reaches "${STAGE_LABELS[stage]}", draft a short update to the borrower.`,
  trigger: { kind: "stage", stage },
  to: "borrower",
  purpose: "service",
  body: ({ first, me }) => `${hi(first)}, quick update on your loan: ${line} ${next} Any questions, just reply here.${sig(me)}`,
});

/** Agent updates: only with the borrower's say-so (checked by the engine). */
const agent = (stage: Stage, line: string): Recipe => ({
  id: `agent_${stage}`,
  group: "agent_updates",
  label: `Agent: ${STAGE_LABELS[stage].toLowerCase()}`,
  description: `When the loan reaches "${STAGE_LABELS[stage]}", draft an update to the client's agent. Only for clients who said their agent may be kept updated.`,
  trigger: { kind: "stage", stage },
  to: "agent",
  purpose: "service",
  body: ({ first, me, client }) => `${hi(first)}, an update on ${client || "our client"}'s loan: ${line}${sig(me)}`,
});

export const RECIPES: Recipe[] = [
  borrower("application", "I've got your application and I'm reviewing it now.", "Next you'll get your Loan Estimate and disclosures to look over and sign."),
  borrower("disclosures", "your Loan Estimate and disclosures are out.", "Please look them over and sign when you can; I'm happy to walk you through any line."),
  borrower("appraisal", "the appraisal has been ordered.", "The appraiser or their office will reach out to schedule a visit."),
  borrower("underwriting", "your file is with underwriting now.", "If they ask for anything else, I'll let you know right away."),
  borrower("conditions", "underwriting came back with a few items to finish.", "I'll send you the list; getting them in quickly keeps things moving."),
  borrower("clear_to_close", "your loan is clear to close.", "Next is signing. The closing office will reach out to set a time."),
  borrower("closed", "you're all done. Congratulations on closing!", "Thank you for trusting me with your loan. I'm here for anything with the house, any time."),
  agent("application", "the application is in and I'm reviewing it."),
  agent("appraisal", "the appraisal has been ordered."),
  agent("underwriting", "the file is in underwriting."),
  agent("clear_to_close", "we're clear to close. The closing office will set the signing."),
  agent("closed", "it's closed. Thanks for the partnership on this one."),
  {
    id: "post_close_30",
    group: "past_clients",
    label: "30 days after closing: how's the house?",
    description: "About a month after closing, draft a check-in (needs marketing permission when it's sent).",
    trigger: { kind: "closed_days", days: 30 },
    to: "borrower",
    purpose: "marketing",
    body: ({ first, me }) => `${hi(first)}, it's been about a month since closing. How's the new place treating you? If anything about the loan or the first statement is confusing, I'm happy to help.${sig(me)}`,
  },
  {
    id: "post_close_180",
    group: "past_clients",
    label: "6 months after closing: a call",
    description: "About six months after closing, a reminder to call and see how things are going.",
    trigger: { kind: "closed_days", days: 180 },
    to: "borrower",
    purpose: "marketing",
    task: ({ first }) => `Call ${first || "them"}: six months since closing`,
  },
  {
    id: "new_contact_permission",
    group: "new_contacts",
    label: "New contact without permission: ask how they'd like to hear from you",
    description: "When someone is added with no permission on file, a reminder to call and ask (and record the answer).",
    trigger: { kind: "new_contact" },
    to: "borrower",
    purpose: "service",
    task: ({ first }) => `Ask ${first || "them"} how they'd like to hear from you`,
  },
];

export const GROUP_LABELS: Record<Recipe["group"], string> = {
  borrower_updates: "Updates to borrowers as their loan moves",
  agent_updates: "Updates to the client's agent (only with the client's permission)",
  past_clients: "After closing",
  new_contacts: "New contacts",
};

export const recipeById = (id: string) => RECIPES.find((r) => r.id === id) ?? null;
