/**
 * lib/clientpage/loan.ts — "Where's my loan?" on the client's own page
 * (D30). SERVER-ONLY.
 *
 * Fed by the Loan Journey (D17): the six phases with the current one, what
 * is happening now in plain words, and what's waiting on them (the items
 * requested in their secure portal, and their own steps like earnest money
 * or signing). It never shows a date as a promise, an amount or a rate, and
 * never anything about underwriting decisions beyond the stage.
 */
import { pipelineStore, type Loan } from "@/lib/pipeline/store";
import { view } from "@/lib/journey/engine";
import { PHASE_LABELS, PHASES, type Phase } from "@/lib/journey/steps";
import { hasApplicationUrl, type Mlo } from "@/lib/config";

/** What each phase means to a borrower. */
export const PHASE_FOR_CLIENT: Record<Phase, string> = {
  start: "Your application and documents are being reviewed.",
  home: "You're finding your home. Your pre-approval is ready when you are.",
  price: "You and your loan officer are choosing your loan option, and whether to lock your rate.",
  process: "Your disclosures, appraisal and title work are underway.",
  approval: "Underwriting is reviewing your loan.",
  close: "Your loan is getting ready to close.",
};

/** Their own steps, said to them. */
const YOUR_STEP: Record<string, string> = {
  "2": "Finish your secure application.",
  "3": "Upload the documents in your secure portal.",
  "7": "Send your loan officer the signed purchase agreement.",
  "8": "Send your earnest money to escrow (confirm the wiring instructions by phone first), and upload the receipt.",
  "9": "Choose your homeowner's insurance and send your loan officer the agent's name.",
  "27": "Sign your final documents and send your funds to close (confirm the wiring instructions by phone first).",
};

export type ClientLoan = {
  id: string;
  purpose: string | null;
  closed: boolean;
  phases: { phase: Phase; label: string; state: "done" | "now" | "next" }[];
  now: string;
  waiting: string[];
  documents: string[];
  portal: string | null;
};

export async function loansForClient(contactId: string, ownerUserId: string, mlo: Mlo | null, now = new Date()): Promise<ClientLoan[]> {
  const loans = (await pipelineStore().list(ownerUserId)).filter((l) => l.contactId === contactId && !l.dead && (!l.closed || now.getTime() - Date.parse(l.updatedAt) < 45 * 86_400_000));
  const out: ClientLoan[] = [];
  for (const l of loans) out.push(await one(l, mlo, now));
  return out;
}

async function one(l: Loan, mlo: Mlo | null, now: Date): Promise<ClientLoan> {
  const v = await view(l, now);
  const currentPhase: Phase = l.closed ? "close" : (v.current?.phase ?? "close");
  const at = PHASES.indexOf(currentPhase);
  const purchase = /purchase|buy/i.test(l.purpose ?? "");
  const phases = PHASES.filter((p) => purchase || p !== "home").map((p) => ({ phase: p, label: PHASE_LABELS[p], state: (l.closed || PHASES.indexOf(p) < at ? "done" : p === currentPhase ? "now" : "next") as "done" | "now" | "next" }));
  const open = v.steps.filter((s) => !s.state || s.state.status === "todo");
  const waiting = open.filter((s) => s.who === "borrower" && YOUR_STEP[s.key] && (purchase || !["7", "8", "9"].includes(s.key))).map((s) => YOUR_STEP[s.key]).slice(0, 3);
  const documents = v.journey.docs.filter((d) => d.status === "requested").map((d) => d.name);
  return {
    id: l.id,
    purpose: l.purpose,
    closed: l.closed,
    phases,
    now: l.closed ? "Your loan has closed. Congratulations!" : PHASE_FOR_CLIENT[currentPhase],
    waiting,
    documents,
    portal: mlo && hasApplicationUrl(mlo) ? mlo.applicationUrl.trim() : null,
  };
}
