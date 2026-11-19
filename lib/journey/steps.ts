/**
 * lib/journey/steps.ts — the Loan Journey: the owner's 30-step roadmap
 * ("Your Home Loan Journey, Step-by-Step Roadmap", 2026-11-19) with the
 * duties they assigned to each step (D17). Pure and client-safe.
 *
 * Each step says who does it, what the team does at that step, whether the
 * loan system's stage checks it off on its own, and (for some) a short text
 * to the borrower that is drafted for approval, never sent on its own.
 * Messages say what happened and what's next: never a date, an amount, a
 * rate or a promise.
 */
import type { Stage } from "@/lib/automations/recipes";

export type Who = "you" | "processor" | "borrower" | "agent" | "escrow" | "lender";
export const WHO_LABELS: Record<Who, string> = { you: "You (loan officer)", processor: "Processor", borrower: "Borrower", agent: "Borrower and agent", escrow: "Escrow and title", lender: "Lender" };

export type Phase = "start" | "home" | "price" | "process" | "approval" | "close";
export const PHASE_LABELS: Record<Phase, string> = { start: "Get started", home: "Find the home", price: "Price and lock", process: "Disclosures and processing", approval: "Underwriting", close: "Clear to close and closing" };

/** Who the message is for, and its wording. `portal` is the loan officer's secure application link, when set. */
export type Message = (p: { first: string; me: string; portal: string | null }) => string;

export type Step = {
  key: string;
  phase: Phase;
  title: string;
  who: Who;
  /** What the team does at this step (the owner's notes). */
  duties: string[];
  /** The loan system reaching this stage checks the step off. */
  autoStage?: Stage;
  /** A text to the borrower, drafted for approval. */
  message?: Message;
  /** The loan officer must confirm (for example, lock or float). */
  confirm?: string;
  /** A rule that must hold before this step's message can be drafted. */
  guard?: "intent_to_proceed";
  /** Compliance notes shown with the step. */
  rules?: string[];
  /** A document request goes out at this step (see D18). */
  documents?: "initial" | "final";
};

const hi = (f: string) => (f ? `Hi ${f}` : "Hi");
const sig = (me: string) => (me ? ` -${me}` : "");

export const STEPS: Step[] = [
  { key: "1", phase: "start", title: "Initial consultation with the loan officer", who: "you", duties: ["Talk through goals, timing and the kind of loan that fits."], autoStage: "application" },
  {
    key: "2", phase: "start", title: "Borrower completes the secure loan application online", who: "borrower", autoStage: "application",
    duties: ["Review the loan type.", "Collect every document the AUS findings call for (read the findings into the document checklist)."],
    message: ({ first, me, portal }) => `${hi(first)}, thanks for talking with me.${portal ? ` Here's your secure application: ${portal}` : " I'll send you the link to your secure application."} Reply here with any questions.${sig(me)}`,
    rules: ["Loan Estimate clock: once you have their name, income, SSN, property address, estimated value and loan amount, the Loan Estimate is due within 3 business days (12 CFR 1026.19(e)(1)(iii))."],
  },
  {
    key: "3", phase: "start", title: "Borrower uploads income and asset documents through the secure portal", who: "borrower", documents: "initial",
    duties: ["Send a simple upload request listing only the documents their file needs."],
    rules: ["Documents go to your loan system's borrower portal, never by text or email."],
  },
  { key: "4", phase: "start", title: "Loan officer reviews the application, runs credit and requests anything missing", who: "processor", duties: ["Review every document for completeness.", "Request anything missing or out of date."] },
  { key: "5", phase: "start", title: "Loan officer gives the qualification status, a pre-approval letter and loan options in writing", who: "you", duties: ["Send the pre-approval letter and the loan options in writing."], rules: ["Present the options side by side: the lowest rate, the lowest rate without risky features, and the lowest total costs (the anti-steering safe harbor, 12 CFR 1026.36(e))."] },
  { key: "6", phase: "home", title: "Home buyer and agent begin the home search", who: "agent", duties: ["Stay in touch; refresh the pre-approval if their price range changes."] },
  { key: "7", phase: "home", title: "Home buyer finds a house, agrees on price and enters into contract", who: "agent", duties: ["Get the signed purchase and sale agreement into the file."] },
  {
    key: "8", phase: "home", title: "Home buyer sends earnest money to escrow", who: "borrower",
    duties: ["Remind the borrower that earnest money is due per the contract.", "Collect the receipt by upload."],
    message: ({ first, me, portal }) => `${hi(first)}, congrats on the accepted offer! Earnest money is due to escrow per your contract. Before you wire it, call escrow at a number you already know to confirm the instructions.${portal ? ` Receipt upload: ${portal}` : " Then upload the receipt to your secure portal."}${sig(me)}`,
    rules: ["Wire fraud: tell them to confirm wiring instructions by phone with escrow, at a known number. We never send wiring instructions."],
  },
  {
    key: "9", phase: "home", title: "Home buyer schedules the inspection and starts shopping for homeowner's insurance", who: "borrower",
    duties: ["Tell the borrower to start shopping for homeowner's insurance."],
    message: ({ first, me }) => `${hi(first)}, now is a good time to start shopping for homeowner's insurance on the new place. When you pick a policy, send me the agent's name and I'll coordinate with them.${sig(me)}`,
  },
  { key: "10", phase: "price", title: "Request updated income and asset documents if needed", who: "processor", duties: ["Pull the best pricing for their scenario from your pricing engine (ARIVE or LoanM8 pricing).", "Send it to the loan officer to talk through with the borrower.", "Request updated income or asset documents if anything has aged."] },
  { key: "11", phase: "price", title: "Loan officer shops the wholesale market and presents options in writing", who: "you", duties: ["Present the options in writing."], rules: ["Show the three safe-harbor options for each loan type you present (12 CFR 1026.36(e)(3))."] },
  { key: "12", phase: "price", title: "Borrower and loan officer decide which option is best", who: "you", duties: ["Record the option they chose."] },
  { key: "13", phase: "price", title: "Borrower and loan officer decide whether to lock or float", who: "you", confirm: "Lock or float?", duties: ["Get the loan officer's confirmation: lock or float."], rules: ["Record the lock expiration in your loan system so Command Center can warn you before it lapses."] },
  { key: "14", phase: "process", title: "Loan is sent to processing", who: "processor", duties: ["Assemble the loan for processing."] },
  {
    key: "14B", phase: "process", title: "Up-front disclosures are sent for signature", who: "processor", autoStage: "disclosures",
    duties: ["Send the up-front disclosures for signature: signed and returned, or e-signed, within 24 hours."],
    message: ({ first, me }) => `${hi(first)}, your Loan Estimate and disclosures are on their way for e-signature. Please review and sign within 24 hours. I'm happy to walk you through any line.${sig(me)}`,
    rules: ["The Loan Estimate is due within 3 business days of the application (12 CFR 1026.19(e)(1)(iii)).", "Record when they say they intend to proceed; it unlocks the appraisal fee."],
  },
  {
    key: "14A", phase: "process", title: "Appraisal is ordered and the appraisal fee is authorized", who: "processor", autoStage: "appraisal", guard: "intent_to_proceed",
    duties: ["Order the appraisal.", "Send the borrower the card authorization for the appraisal fee."],
    message: ({ first, me }) => `${hi(first)}, I'm ordering your appraisal. You'll get a secure payment link for the appraisal fee from the appraisal company. Please never send card numbers by text or email.${sig(me)}`,
    rules: ["No fee other than a credit report fee may be charged until the borrower has received the Loan Estimate and said they intend to proceed (12 CFR 1026.19(e)(2)(i)). So step 14B comes first.", "Card numbers go only through the appraisal company's or your loan system's payment link."],
  },
  { key: "14C", phase: "process", title: "Escrow and title paperwork is ordered", who: "processor", duties: ["Open title.", "Confirm title is clear, with the title company named in the purchase and sale agreement."] },
  { key: "15", phase: "process", title: "Processor reviews the file in depth and submits it to the lender for underwriting", who: "processor", autoStage: "underwriting", duties: ["Review the whole file for completeness.", "Submit to the lender with only what the AUS findings call for."] },
  { key: "16", phase: "approval", title: "Underwriter reviews the file and appraisal and issues a conditional approval", who: "lender", autoStage: "conditions", duties: ["Review the conditional approval when it comes in."] },
  {
    key: "17", phase: "approval", title: "Loan status changes to conditionally approved", who: "processor",
    duties: ["Tell the borrower their loan has a conditional approval."],
    message: ({ first, me }) => `${hi(first)}, good news: underwriting has issued a conditional approval on your loan. Next I'll send the short list of items they need to finish.${sig(me)}`,
  },
  { key: "18", phase: "approval", title: "Processor requests the items needed for final approval", who: "processor", documents: "final", duties: ["Send the borrower upload links with the document requests for final approval."] },
  { key: "19", phase: "approval", title: "Underwriter reviews the conditions and signs off", who: "processor", duties: ["Send the borrower's items to underwriting."] },
  {
    key: "20", phase: "approval", title: "Loan status changes to final approval", who: "lender", autoStage: "clear_to_close",
    duties: ["If more documents are needed (20A), collect them from the borrower and resubmit."],
    message: ({ first, me }) => `${hi(first)}, underwriting has signed off on the last conditions: your loan has final approval. Next is the final check before clear to close.${sig(me)}`,
    rules: ["If the borrower can't provide what's needed, send a notice of incompleteness or an adverse action notice within 30 days (Reg B, 12 CFR 1002.9)."],
  },
  { key: "21", phase: "close", title: "Lender's final audit, including re-verification of employment and a credit re-check", who: "processor", duties: ["Complete a final internal audit.", "Get anything needed for the re-verification of employment."], rules: ["A verbal verification of employment generally has to be within 10 business days before the note date (Fannie Mae Selling Guide B3-3.1-07); confirm with the investor's guide."] },
  {
    key: "22", phase: "close", title: "Loan status changes to clear to close", who: "processor", autoStage: "clear_to_close",
    duties: ["Move the loan to clear to close in your loan system (Command Center follows)."],
    message: ({ first, me }) => `${hi(first)}, your loan is clear to close. The escrow office will reach out to set your signing appointment.${sig(me)}`,
  },
  { key: "23", phase: "close", title: "Final loan documents are ordered", who: "processor", duties: ["Check the final loan documents are ordered with escrow."] },
  { key: "24", phase: "close", title: "Final loan documents are sent to escrow", who: "processor", duties: ["Confirm the documents reached escrow and the borrower's signing is set."] },
  {
    key: "25", phase: "close", title: "Escrow prepares the final documents and the amount to bring to closing", who: "escrow",
    duties: ["Work with the escrow officer on the final documents.", "Double-check the Closing Disclosure and balance with escrow."],
    rules: ["The borrower must receive the Closing Disclosure at least 3 business days before signing (12 CFR 1026.19(f)(1)(ii)). A higher APR beyond tolerance, a new product or a new prepayment penalty restarts the 3 days.", "Record when the Closing Disclosure was sent; Command Center shows the earliest signing date."],
  },
  {
    key: "26", phase: "close", title: "Escrow arranges the signing and tells the borrower the amount to bring", who: "escrow",
    duties: ["Send the broker demand to escrow."],
    message: ({ first, me }) => `${hi(first)}, escrow will give you the final amount and how to send it. Before you wire anything, call escrow at a number you already know to confirm the instructions. We'll never send wiring changes by email or text.${sig(me)}`,
    rules: ["The broker demand must match your compensation plan (Reg Z loan officer compensation, 12 CFR 1026.36(d)): no amount tied to the loan's terms."],
  },
  { key: "27", phase: "close", title: "Borrowers sign the final documents and send funds to escrow", who: "borrower", duties: ["Track the final escrow payment.", "Check the notary's confirmation and that cash to close arrived."] },
  { key: "28", phase: "close", title: "Signed documents go back to the lender for funding", who: "escrow", duties: ["Watch for funding conditions from the lender."] },
  { key: "29", phase: "close", title: "The lender wires the funds and the loan is funded", who: "lender", autoStage: "closed", duties: ["Your after-closing automations take over (thank-you, 30-day check-in)."] },
  { key: "30", phase: "close", title: "The deed is recorded and the transaction is complete", who: "escrow", duties: ["Confirm recording, and send the client their closing package."] },
];

export const stepByKey = (k: string) => STEPS.find((s) => s.key === k) ?? null;
export const PHASES = Object.keys(PHASE_LABELS) as Phase[];
