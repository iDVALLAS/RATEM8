/**
 * lib/content/loa.ts — words for the LOA switches (D70): how much the Loan
 * Officer Assistant does on its own, per task, for purchases and
 * refinances. Plain words, no promises about timing or outcome.
 */

export const MODE_WORDS = { auto: "Full-auto", approve: "LO-Auth", off: "Off", inherit: "Use my setting" } as const;

export const loaSwitches = {
  heading: "How much your LOA does on its own",
  legend: [
    { mode: "auto", text: "Full-auto: does it, then tells you." },
    { mode: "approve", text: "LO-Auth: gets it ready, you tap Approve." },
    { mode: "off", text: "Off: doesn't do it." },
  ],
  presetsLabel: "Start from",
  presets: { recommended: "Recommended", ask: "Ask me for everything", off: "All off" },
  purchase: "Purchase",
  refi: "Refinance",
  notApplicable: "Doesn't apply",
  save: "Save switches",
  saveNote: "Changes apply to every loan that doesn't have its own setting.",
  viewOnly: "Only the loan officer changes these switches. You can still approve what's waiting.",
  lockedHeading: "Always you",
  lockedNote: "These never get a switch.",
  fullAutoLimit: "Full-auto",
  flash: {
    saved: (n: number) => (n ? `Saved ${n} change${n === 1 ? "" : "s"}.` : "Nothing changed."),
    preset: (label: string) => `Set to ${label}.`,
    assistant: "Only the loan officer can change the switches.",
    notYours: "Only this loan's loan officer can change its switches.",
  },
} as const;

export const CAP_GROUPS = {
  reading: { label: "Reading documents", note: "What your LOA does with a document you drop on a loan." },
  escrow_title: { label: "Escrow and title", note: "Emails go to the confirmed address on each loan, never to one it only read from a document." },
  insurance_hoa: { label: "Insurance and HOA", note: "" },
  deadlines: { label: "Deadlines", note: "" },
  conditions: { label: "Conditions", note: "" },
  updates: { label: "Updates to people", note: "Messages to clients and agents still go through your contact rules." },
  forms: { label: "Forms", note: "" },
} as const;
export type CapGroup = keyof typeof CAP_GROUPS;

/** Each task: its name, one line of help, the officer-level "Needs" chip, and why Full-auto (or LO-Auth) isn't offered. */
export const CAP_WORDS = {
  read_psa: { label: "Read the purchase and sale agreement", help: "Fills in empty fields only. If a new copy differs from what you entered or confirmed, it shows under Review changes." },
  read_title: { label: "Read the title commitment and find payoffs", help: "Lists what has to be paid off or released at closing." },
  read_approval: { label: "Read the conditional approval", help: "Puts the borrower's items on the document checklist. Stays inside Command Center." },
  read_fees: { label: "Read the escrow fee sheet", help: "Records escrow's fees, which ends the fee follow-up." },
  escrow_fees: { label: "Ask escrow for their fee estimate", help: "On a refinance, once the application date is on the loan.", need: "Needs escrow's confirmed email on each loan" },
  open_escrow: { label: "Open escrow", help: "On a purchase, Full-auto only when the contract names escrow.", need: "Needs escrow's confirmed email on each loan", maxRefi: "On a refinance it asks you: the borrower can shop for settlement services, and cancelling can cost a fee." },
  order_title: { label: "Order title, with the closing protection letter", help: "On a purchase, Full-auto only when the contract names title.", need: "Needs title's confirmed email on each loan", maxRefi: "On a refinance it asks you: the borrower can shop for settlement services, and cancelling can cost a fee." },
  payoffs: { label: "Ask escrow to order payoffs", help: "Always to escrow, never straight to a servicer.", need: "Needs escrow's confirmed email on each loan" },
  payoff_auth: { label: "Payoff authorization to the servicer", help: "The borrower signs it.", max: "Always asks you: the borrower signs it." },
  insurance: { label: "Ask for the homeowner's insurance binder", help: "Full-auto only when nothing in the request is left to fill in.", need: "Needs the insurance agent's confirmed email and the lender" },
  hoa: { label: "Ask for HOA or condo documents", help: "Only on a loan with an HOA.", need: "Needs a yes or no on HOA for each loan", max: "Always asks you: it can cost the borrower money." },
  appraisal_transfer: { label: "Ask for an appraisal transfer", help: "Needs the borrower's signature and the prior lender.", max: "Always asks you: the borrower signs it." },
  appraisal_reminder: { label: "Appraisal order reminder", help: "Only after the borrower says they intend to proceed.", max: "Always asks you: ordering the appraisal is your call." },
  deadline_reminders: { label: "Federal timing, contract and lock deadline reminders", help: "Reminders to you only. Contract dates are for purchases." },
  voe_reminder: { label: "Reminder when the employment re-verification window opens", help: "A reminder to you only." },
  voe_written: { label: "Send a written employment verification to the employer", help: "Filled from the file; sensitive fields stay blank.", max: "Always asks you: it carries the borrower's details to their employer." },
  borrower_conditions: { label: "Ask the borrower for their conditions", help: "A fixed message with a count and the upload link, through your contact rules. At most 2 follow-ups, 2 business days apart." },
  third_party_conditions: { label: "Ask third parties for their conditions", help: "Each message is written for the item, so it always asks you.", max: "Always asks you: each message is written fresh." },
  client_updates: { label: "Status updates to the client", help: "The same switch as the borrower updates on Automations." },
  agent_updates: { label: "Status updates to the buyer's agent", help: "Only for clients who said their agent may be kept updated, and each message is checked first. On a refinance, only when an agent is linked.", need: "Needs the client's OK for agent updates" },
  forms_fill: { label: "Fill library forms from the file", help: "Non-sensitive fields only." },
  forms_send: { label: "Send forms as attachments", help: "Emails it sends on its own never carry attachments.", max: "Always asks you: attachments go out only when you send them." },
} as const;

/** Never a switch: the loan officer (or the loan system) always does these. */
export const LOCKED_WORDS = [
  { label: "Loan Estimate and Closing Disclosure", reason: "Sent from your loan system (TRID)." },
  { label: "Lock, lock extension, float-down", reason: "A pricing decision; it costs the borrower." },
  { label: "Wire instructions", reason: "Never sent or forwarded by Command Center. Verify by phone." },
  { label: "Credit, underwriting or approval decisions", reason: "A licensed person decides." },
  { label: "Anything the borrower signs, or that holds SSN, DOB or account numbers", reason: "The borrower signs it, and those numbers stay out of Command Center." },
  { label: "M8 loan-update calls", reason: "Set by the client's written AI-call permission and their own switch." },
] as const;

/** The facts a job needs, asked after the contract is read. */
export const FACT_WORDS = {
  escrow_company: { short: "the escrow company", ask: "Which escrow company is handling this loan?", placeholder: "Escrow company" },
  escrow_email: { short: "escrow's confirmed email", ask: "What's escrow's email?", placeholder: "Escrow's email", note: "Check it with escrow at a number you already have." },
  title_company: { short: "the title company", ask: "Which title company?", placeholder: "Title company" },
  title_email: { short: "title's confirmed email", ask: "What's title's email?", placeholder: "Title's email", note: "Check it with title at a number you already have." },
  insurance_email: { short: "the insurance agent's confirmed email", ask: "What's the insurance agent's email?", placeholder: "Insurance agent's email" },
  hoa: { short: "a yes or no on HOA", ask: "Is there an HOA or condo association?", yes: "Yes, there's an HOA", no: "No HOA" },
  lender: { short: "the lender", ask: "Which lender is this loan with?", placeholder: "Lender" },
} as const;
export type FactKey = keyof typeof FACT_WORDS;

export const loaLoan = {
  strip: "Autopilot",
  unknownPurpose: "Purchase or refinance?",
  purchase: "Purchase",
  refi: "Refinance",
  onTheirOwn: (n: number) => `${n} on their own`,
  askYou: (n: number) => `${n} ask you`,
  off: (n: number) => `${n} off`,
  pause: "Pause on this loan",
  resume: "Resume on this loan",
  paused: "Paused on this loan: your LOA does nothing on its own here.",
  change: "Change for this loan",
  justThisLoan: "Just this loan. Anything left on \"Use my setting\" follows your switches on Your LOA.",
  saveLoan: "Save for this loan",
  viewOnly: "Only the loan officer changes the switches on this loan.",
  gapsHeading: "What the contract didn't answer",
  gapsNote: "Answer these and the Full-auto jobs below can go ahead. Until then they wait.",
  gapsNone: "Nothing is missing for the Full-auto jobs on this loan.",
  gapsOther: "Also useful for the jobs that ask you first",
  unlocks: "Unlocks",
  saveAnswer: "Save",
  confirm: "Confirm",
  confirmed: "confirmed",
  fromDocument: "from a document",
  confirmNote: "Confirm an email only after checking it with them at a number you already have.",
  reviewHeading: "Review changes",
  reviewNote: "A new document disagreed with what you entered or confirmed. Nothing was changed.",
  useNew: "Use the new one",
  keepMine: "Keep mine",
  holdTitle: (who: string) => `${who}'s email changed in the new document. Call ${who.toLowerCase()} at a number you already have before anything goes out.`,
  holdNote: "Everything automatic on this loan is on hold until you choose an email below.",
  needs: (what: string[]) => `Needs ${what.join(", ")}`,
  waits: "waits",
} as const;

export const loaQueueWords = {
  heading: "Needs you",
  draftsHeading: "Waiting for your OK",
  approve: "Approve & send",
  edit: "Edit",
  notThisTime: "Not this time",
  read: "Read it",
  noAddress: "Add their email on the loan first.",
  to: (who: string) => `To the ${who}`,
  proposalsHeading: "Messages to clients and agents on your Concierge desk",
  proposalsNote: "They stay on the desk, where you approve each one.",
  openDesk: "Open the desk",
  tasksHeading: "Deadlines and to-dos",
  empty: "Nothing is waiting for your OK.",
  flash: { sent: (via: string) => `Sent, from ${via}.`, dropped: "Set aside." },
} as const;

/**
 * D71: Full-auto at work: the queue of messages going out on their own, the
 * undo window, the log, and the flash after a read. Times are Pacific, the
 * same clock as the morning run.
 */
export const loaAutoWords = {
  live: "Full-auto rows now do the work on their own. Every message waits in \"Going out on its own\" first, so you can stop it.",
  killed: "Full-auto is switched off for everyone right now. Full-auto rows get the work ready and wait for your OK, the same as LO-Auth.",
  whenHeading: "When Full-auto messages go out",
  whenMorning: "With the next morning run",
  whenSoon: (m: number) => `${m} minutes after they're ready`,
  whenNote: "Either way, each message waits in Going out on its own until then, with a Stop button.",
  ownerCallerNote:
    "Owner note: Command Center's scheduled runs happen once a day on the free Vercel plan. A message set to go in 15 minutes goes out when the officer next opens Command Center, or at the next run. For 15-minute sends to go on time, have an outside scheduler (a GitHub Actions schedule or cron-job.org) call /api/cc/loa/tick every 15 minutes with the CRON_SECRET as a Bearer token.",
  queuedHeading: "Going out on its own",
  queuedNote: "Full-auto messages wait here until they go. Stop one and it won't be sent.",
  queuedEmpty: "Nothing is waiting to go out on its own.",
  stop: "Stop",
  soon: (m: number) => `Send in ${m} minutes`,
  correction: "Draft a correction",
  correctionNote: "An email can't be unsent. A correction goes to the same address, for you to check and send.",
  textCorrection: "A text can't be unsent. Text them a correction from their contact page.",
  asksBecause: "Asks you because",
  logHeading: "What your LOA did",
  logEmpty: "Nothing on its own yet on this loan.",
  status: { queued: "Queued", sent: "Sent", stopped: "Stopped", held: "Waiting for you", failed: "Didn't go out", done: "Done" },
  to: { client: "client", agent: "client's agent", lo: "you" } as Record<string, string>,
  flash: {
    stopped: "Stopped. It won't be sent.",
    soon: (label: string) => `${label}. Stop it any time before then.`,
    correction: "Drafted a correction. Check it under Emails to escrow and title, then send.",
    when: (morning: boolean) => (morning ? "Full-auto messages now go with the next morning run." : "Full-auto messages now go 15 minutes after they're ready."),
    notQueued: "That message isn't waiting to go anymore.",
  },
  morningLine: (sent: number, waiting: number, queued: number) =>
    `Your LOA: ${sent} sent on ${sent === 1 ? "its" : "their"} own, ${waiting} waiting for your OK${queued ? `, ${queued} going out on ${queued === 1 ? "its" : "their"} own unless you stop ${queued === 1 ? "it" : "them"}` : ""}.`,
} as const;

/** D71: what each job does, for the log and the flash ("Asked escrow for fees."). */
export const AUTO_ACTION: Record<string, string> = {
  escrow_fees: "Asked escrow for fees",
  escrow_fees_follow: "Followed up with escrow on fees",
  open_escrow: "Asked escrow to open escrow",
  order_title: "Ordered title",
  payoffs: "Asked escrow to order payoffs",
  insurance: "Asked for the insurance binder",
  borrower_conditions: "Asked the borrower for their items",
  borrower_conditions_follow: "Reminded the borrower about their items",
  client_updates: "Sent the client a status update",
  agent_updates: "Sent the agent a status update",
  deadline_reminders: "Reminder",
  voe_reminder: "Reminder: the employment re-verification window is open",
  appraisal_reminder: "Reminder: order the appraisal",
};

/** D71: why a Full-auto job asks the loan officer instead. Plain words, shown on the item. */
export const AUTO_WHY = {
  unconfirmed: (who: string) => `${who}'s email came from a document and isn't confirmed yet`,
  changed: (who: string) => `${who}'s email changed since this was ready`,
  noEmail: (who: string) => `there's no email for ${who}`,
  placeholder: "something in it is left to fill in",
  sensitive: "it looks like it holds a Social Security, birth date or account number",
  link: "it carries a link",
  foreign: (what: string) => `it carries ${what}`,
  wire: "it mentions wires or bank details",
  edited: "it was changed after it was planned",
  hold: "everything on this loan is held: a confirmed email changed",
  killed: "Full-auto is switched off for everyone right now",
  paused: "this loan is paused",
  switched: "its switch is no longer Full-auto",
  agentOk: "the client hasn't said their agent may be kept updated",
  review: (why: string) => `the message check stopped it (${why})`,
  check: (why: string) => `the message check stopped it (${why})`,
  gate: (why: string) => `your contact rules stopped it (${why})`,
  failed: (why: string) => `it didn't go out (${why})`,
  overDay: (n: number) => `over today's limit of ${n} messages on their own; it waits for tomorrow morning's run`,
  overPerson: "already 3 messages to this address today; it waits for tomorrow morning's run",
  closed: "the loan is closed or no longer active",
  moot: "it isn't needed anymore (the file already has it)",
} as const;
