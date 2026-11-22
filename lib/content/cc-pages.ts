/**
 * lib/content/cc-pages.ts — Command Center page wording from the D76
 * plain-language pass: page subtitles, "How this works" folds, the
 * not-on-yet cards, Home, the call session's fixes, Concierge, Automations,
 * Campaigns, Connections and the AI assistants hub.
 *
 * Plain words on the pages a loan officer uses every day: no hosting,
 * header or variable names. Owner-only technical text lives under keys
 * that start with `owner` (app/mlo/plain-language.test.ts checks this).
 */

export const HOW_SUMMARY = "How this works";
export const TECH_SUMMARY = "Technical steps";

export type NotOnYetKey = "texting" | "videos" | "voicemail" | "cards" | "mailbox" | "clientpage";

/** One sentence each, and the setup assistant's topic. */
export const NOT_ON_YET: Record<NotOnYetKey, { line: string; topic: string; after?: { owner: string; lo: string } }> = {
  texting: {
    line: "Texting isn't turned on for your company yet.",
    topic: "texting",
    after: { owner: "Replies to calls and emails still show up here.", lo: "Your owner sets it up once for your company. Replies still show up here." },
  },
  videos: {
    line: "Video messages aren't turned on yet.",
    topic: "videos",
    after: { owner: "It needs a private place to keep the videos, set up once for everyone.", lo: "Your owner turns it on once for everyone." },
  },
  voicemail: {
    line: "Voicemail drops aren't turned on yet.",
    topic: "voicemail",
    after: { owner: "They need texting and the private recordings store, both set up once.", lo: "Your owner turns them on once for everyone." },
  },
  cards: {
    line: "Cards by mail aren't turned on yet.",
    topic: "cards",
    after: { owner: "Connect Command Center to Thanks.io once; then each loan officer connects their own account.", lo: "Your owner connects Command Center to Thanks.io once; then you connect your own account." },
  },
  mailbox: {
    line: "Connecting your own Gmail or Microsoft 365 isn't turned on yet.",
    topic: "mailbox",
    after: { owner: "It needs one app registration with Google and one with Microsoft.", lo: "Your owner sets it up once for everyone." },
  },
  clientpage: {
    line: "Client pages aren't turned on yet.",
    topic: "clientpage",
  },
};

/** The setup assistant's first question for a topic opened from a page. */
export const SETUP_FIRST_ASK: Record<string, string> = {
  texting: "Help me set up texting for my company.",
  mailbox: "Help me connect my email (Gmail or Microsoft 365).",
  cards: "Help me set up cards by mail with Thanks.io.",
  videos: "Help me turn on video messages.",
  voicemail: "Help me turn on voicemail drops.",
  clientpage: "Help me turn on client pages.",
  loan_system: "Help me connect my loan system.",
};

/** Page subtitles (one line under the title). */
export const SUBS = {
  inbox: "Every reply in one place. STOP is honored the moment it arrives.",
  calls: "One person at a time. You dial; every call is checked against your contact rules first.",
  concierge: "Drafts and reminders your AI assistant prepared. You approve every one.",
  automations: "Loan updates and follow-up, drafted at the right moment.",
  campaigns: "Texts, emails and reminders spaced over days, sent for you through your contact rules.",
  connections: "Bring your loans and your people in from the systems you already use.",
  pipeline: "Loans from your loan system, each with its journey and clocks.",
  agents: "Who works for you, and whether each one is on.",
  team: "Who's on Command Center, their roles and whose book they work in.",
  leads: "New leads from your lead vendors and web forms, with where each came from.",
} as const;

/** Home (D76). */
export const HOME = {
  everythingElse: "Everything else",
  callReady: (n: number) => (n === 1 ? "Call 1 person" : `Call ${n} people`),
  callBlocked: (n: number) => `Get ${n} ${n === 1 ? "person" : "people"} ready to call`,
  callNone: "Start calling",
  /** The row button while texting is off (it opens the conversation). */
  openWord: "Open",
  more: (n: number) => `See ${n} more`,
};

/** The call session's "Not now" fixes (D76). Matched on the contact rules' own reason. */
export const CALL_FIX = {
  dnc: { label: "Check do-not-call", chip: "Do-not-call not checked" },
  dncListed: { label: "Record their permission", chip: "On a do-not-call list" },
  state: { label: "Add their state", chip: "No state on file" },
  permission: { label: "Record their permission", chip: "No permission on file" },
  hold: { label: "Release the list", chip: "On hold from a past employer's list" },
  reassigned: { label: "Check the number", chip: "Number may be reassigned" },
  stopped: { label: "", chip: "Asked not to be contacted" },
  cap: { label: "", chip: "Reached today's limit" },
  license: { label: "", chip: "Outside your licensed states" },
  state_rule: { label: "", chip: "Waiting on a state rule" },
  other: { label: "Open their page", chip: "Something to fix" },
  stateSaved: "Saved their state.",
  pickState: "Their property state",
};

/** Concierge (D76). */
export const CONCIERGE = {
  how: "An AI that works your book with your permission: it reads replies, notices what clients need, drafts texts in your voice and sets you reminders. It never sends anything itself: you approve every text, and each one still goes through your contact rules. It never quotes rates or makes promises, and it never notes family, marital status, religion, health, age, race, national origin or benefits income.",
  notAuto: "Texts are always drafts for you to approve. Sending on its own isn't turned on yet.",
  composerTitle: "Ask or tell your Concierge",
  composerLabel: "Ask about your clients, or tell it what to prepare (for example: “Who should I call this week?” or “Draft a check-in to my 2021 past clients”). You approve everything before it's sent.",
  settings: "Settings",
  approveAll: (n: number) => `Approve all ${n}`,
  approveAllNote: (n: number) => `Sends the ${n} ${n === 1 ? "draft" : "drafts"} that can go now, as written. Each one is checked against your contact rules first; anything that can't go stays here.`,
  approveAllGo: (n: number) => `Send ${n} now`,
};

/** Automations (D76). */
export const AUTOMATIONS = {
  how: "Turn on what you want. When a loan moves in your loan system, the right update is drafted for the borrower (and their agent, if the client said so). After closing and for new contacts, the morning run sets drafts and reminders. Updates never give a date, an approval or a rate. LO-Auth puts each one on your Concierge desk for your OK; Full-auto (borrower and agent updates only) sends it for you, through your contact rules, the same as your LOA's status updates.",
  count: (on: number, all: number) => `${on} of ${all} on`,
  preview: "Preview",
  save: "Save changes",
  unsaved: "You have changes that aren't saved.",
  noAuto: "Sending on its own isn't turned on for these. They're drafts or reminders you approve.",
  shared: "Borrower updates share one Full-auto or LO-Auth setting with your LOA's “Status updates to the client”; agent updates with “Status updates to the buyer's agent”.",
  split: "Purchases and refinances are set differently on your LOA's switches; saving here sets both.",
};

/** Campaigns (D76). */
export const CAMPAIGNS = {
  how: "A campaign is a few texts, emails and reminders spaced out over days, sent for you. Each message still goes through your contact rules first (permission, do-not-call, quiet hours in their time zone, state rules), and a reply ends a follow-up campaign.",
  newButton: "+ New campaign",
  empty: "No campaigns yet. Start one from a ready-made plan, or describe what you want and M8 writes it.",
  off: "All campaigns are switched off for the platform right now.",
  newTitle: "New campaign",
  back: "← Your campaigns",
};

/** Connections (D76). */
export const CONNECTIONS = {
  ask: "Which loan system do you use?",
  other: "Other systems",
  stepKey: "Make your connection address",
  stepKeyHelp: "One address for each system. It carries your key, so keep it private, like a password.",
  stepSetup: (name: string) => `Set it up in ${name}`,
  stepCheck: "Check it worked",
  keys: "Your connection addresses",
  keysNone: "None yet.",
  connected: "Loans are coming in",
  keyMade: "Address made, no loans yet",
  notConnected: "Not connected",
  saved: "Saved",
  signedIn: "Signed in",
  failed: "The last test failed",
  people: "Brings people",
  loans: "Brings loans",
};

/** The AI assistants hub (D76). */
export const AGENTS_HUB = {
  title: "AI assistants",
  concierge: { name: "Concierge", what: "Drafts texts and reminders from your book each morning. You approve every one." },
  loa: { name: "Loan Officer Assistant", what: "Reads loan documents, keeps your deadlines and does the paperwork chores you switch on." },
  team: { name: "The rest of the team", what: "Finds business, keeps loans moving, looks after partners, and coaches you." },
  on: "On",
  off: "Off",
  paused: "Paused",
  open: "Open",
  setUp: "Set up",
  teamHead: "Your Concierge team",
};

/** Pipeline (D76). */
export const PIPELINE = {
  empty: "No loans yet",
  emptyLine: "Connect your loan system and each loan shows up here as it moves.",
  connect: "Connect your loan system",
};

/** Leads (D76): the consent fields in words. */
export const LEADS = {
  how: "Paste your connection address into your lead vendor's delivery settings (Zillow, LendingTree, Bankrate and others), or into a Zapier step from your web form. Each new lead lands in your contacts and at the top of Today.",
  /** D81: one line, then the "i" (the old consent paragraph moved into the pop-up). */
  permissionLine: "Permission is saved with every lead.",
  /** D81: what Recent leads shows for each lead. */
  status: { ok: "Permission on file", none: "No permission yet" },
  /** D81: the "i" beside "No permission yet" in Recent leads (one name per lead, so a screen reader can tell them apart). */
  rowTipLabel: (name: string) => (name ? `Why no permission yet for ${name}` : "Why no permission yet"),
  /** D81: the pop-up (a bottom sheet on phones). */
  tip: {
    label: "When a lead counts as permission",
    title: "When a lead counts as permission",
    named: "Your vendor’s consent wording is saved with every lead. It counts as permission to text or call only when it names you or your company.",
    /** Followed by the status in bold and a period. */
    partners: "Many forms name only “partners.” Those leads show",
    askIntro: "Ask your vendor to send three things with every lead:",
    ask: ["Their consent wording", "When the person agreed", "The web page where they agreed"],
    copy: "Copy a note for your vendor",
    copied: "Copied. Paste it into an email or message to your vendor.",
    copyManual: "Your browser didn’t let the page copy it. The note is selected below: copy it from there.",
    noteLabel: "Note for your vendor",
    /** What "Copy a note for your vendor" copies: short, polite, with the three field names. */
    vendorNote:
      "Hi, could you please include these three fields with every lead you send me?\n\n" +
      "- consent_text: the consent wording the person agreed to\n" +
      "- consent_timestamp: when they agreed\n" +
      "- page_url: the web page where they agreed\n\n" +
      "Thank you!",
  },
  connectAt: "Make a connection address on Connections.",
  /** D82: every example section's label (shown in capitals) and its one line. */
  example: {
    label: "Example",
    line: "These are example numbers. Yours appear here after your first lead arrives.",
    /** The plan card once real leads exist: it stays an example until a plan is saved. */
    planLine: "These are example numbers. Yours appear here after you save your first plan.",
  },
  /** D82: the question box at the top (answers come with D85). */
  ask: {
    label: "Ask your Concierge about lead sources",
    placeholder: "Ask your Concierge about lead sources, budget or cost per lead",
    button: "Ask",
    tryLabel: "Questions to try",
    suggestions: ["Which source should I add next?", "Plan $1,500 a month for 90 days", "Which vendors don’t give me permission?"],
    off: "Not on yet. Your Concierge answers questions about lead sources here once it can read your scorecard.",
  },
  /** D82: the scorecard (Option B: a table on desktop, cards on phones). */
  score: {
    title: "Scorecard",
    periodLabel: "Period",
    periods: ["30 days", "90 days", "This year"],
    bannerWho: "Business Manager:",
    review: "Review",
    cols: { source: "Source", spent: "Spent", leads: "Leads", perLead: "Per lead", canCall: "You can call", loans: "Loans", perLoan: "Per loan", says: "Concierge says", repeats: "Repeats" },
    perLoanUnit: "per loan",
    noLoans: "None yet",
    noLoansCard: "No loans yet",
    badges: { best: "Best value", scale: "Scale up", watch: "Watch", fix: "Fix permission", pause: "Pause?" },
    spendLine: "Spend comes from lead-spend lines in Expenses.",
    logSpend: "Log spend",
    /** D83: links to the monthly amounts on this page. */
    setMonthly: "Set a monthly amount per source",
    /** D83: what the Repeats column means. */
    repeatsNote: "“Repeats” = leads a source sent you who were already in your book. Each one counts as a lead from that source; ask the vendor about credit for them.",
    canCallNote: "“You can call” = leads whose consent wording named you or your company.",
    /** The real scorecard before spend and loans are tagged by source. */
    real: {
      sub: "Your leads in the last 90 days, by where they came from.",
      none: "No leads in the last 90 days.",
      notYet: "Spend, cost per lead and loans per source aren’t counted here yet.",
      /** D83: a lead counted from an import with no date of its own isn't in any period. */
      undated: (n: number) => `${n === 1 ? "One imported lead has" : `${n} imported leads have`} no date of their own, so ${n === 1 ? "it isn’t" : "they aren’t"} counted in a period.`,
    },
  },
  /** D82: the lead plan card (the planner comes with D86). */
  plan: {
    title: "Your lead plan",
    line: (monthly: string, day: number, of: number) => `${monthly} a month · day ${day} of ${of}`,
    next: (when: string) => `Next check-in ${when}`,
    open: "Open budget planner",
    off: "The budget planner isn’t on yet.",
  },
  /** D82: the add card (full on top until real leads arrive, then compact). */
  add: {
    title: "Add a lead source",
    nameTip: "Name the address after the vendor so you can tell them apart.",
    on: (label: string) => `${label} · on`,
    connected: "Your lead connections",
    manage: "Manage on Connections",
    how: "How to connect a vendor, and the field names to send",
    fieldsTitle: "Field names for your vendor",
  },
  /** D83: a monthly amount per source, made into a draft expense each month. */
  monthly: {
    title: "Monthly amount per source",
    intro: "Paying a source every month? Set the amount once. Each month it becomes a draft in Expenses, tagged with the source, for you to confirm. Nothing posts on its own.",
    none: "No monthly amounts yet.",
    each: (amount: string) => `${amount} a month`,
    made: (month: string) => `Draft made for ${month}`,
    source: "Source",
    amount: "Amount a month ($)",
    save: "Save",
    remove: (label: string) => `Remove the monthly amount for ${label}`,
    removeWord: "Remove",
    drafts: "Drafts to confirm",
    saved: (label: string, n: number) => `Saved: ${label}.${n ? " This month’s draft is waiting in Expenses to confirm." : ""}`,
    removed: "Removed. Drafts already made stay in Expenses until you confirm or delete them.",
    errors: { source: "Pick a source, or name it under Other.", amount: "Enter an amount a month between $1 and $100,000.", assistant: "Spend is private to each loan officer." },
  },
  /** D82: Recent leads. */
  recent: {
    title: (n: number) => `Recent leads (${n})`,
    none: "None yet.",
    /** D83: a delivery of someone already in the book. */
    repeat: "repeat",
  },
};

/** D83: the Lead source picker (Expenses, and the monthly amounts on Lead sources). */
export const LEAD_SPEND = {
  label: "Lead source",
  none: "Not lead spend",
  pick: "Pick a source",
  other: "Other…",
  otherLabel: "Name the source",
  hint: "Which lead source this spend is for, so the scorecard on Lead sources can count it.",
  /** Where a draft came from, on Expenses' "To confirm". */
  monthly: (label: string) => `Your monthly amount for ${label}`,
};

/** D81: the reusable "i" pop-up's own words (app/mlo/InfoTip.tsx). */
export const INFO_TIP = { close: "Close" };

export const words = (n: number) => ["no", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][n] ?? String(n);
