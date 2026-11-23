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
  // D87: the owner's words for the Lead sources entry.
  leads: "Where your leads come from, what each source costs, and what to do next.",
  /** D86: the budget planner. */
  leadPlan: "Pick a monthly budget. Your Concierge splits it across your sources by what each one has actually closed.",
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
  /** D84: the Business Manager's lead-source table (the Lead sources scorecard, last 90 days). */
  sourcesCaption: "Lead sources, last 90 days",
  sourcesNote: "Lead sources over the last 90 days: spend from your lead-spend lines, loans from your pipeline.",
  sourcesLink: "Open the scorecard",
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
  /** D82: the question box at the top; D85 answers it (LEAD_ASK has the answer card's words). */
  ask: {
    label: "Ask your Concierge about lead sources",
    placeholder: "Ask your Concierge about lead sources, budget or cost per lead",
    button: "Ask",
    tryLabel: "Questions to try",
    suggestions: ["Which source should I add next?", "Plan $1,500 a month for 90 days", "Which vendors don’t give me permission?"],
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
    badges: { best: "Best value", scale: "Scale up", watch: "Watch", fix: "Fix permission", pause: "Pause?", thin: "Not enough data" },
    spendLine: "Spend comes from lead-spend lines in Expenses.",
    logSpend: "Log spend",
    /** D83: links to the monthly amounts on this page. */
    setMonthly: "Set a monthly amount per source",
    /** D83: what the Repeats column means. */
    repeatsNote: "“Repeats” = leads a source sent you who were already in your book. Each one counts as a lead from that source; ask the vendor about credit for them.",
    /** D87.3 (owner decision 6): imported leads count when the import recorded their yes to texts or calls. */
    canCallNote: "“You can call” = leads whose consent wording named you or your company, and imported leads whose permission to text or call you confirmed when you imported them.",
    /** D84: under the real scorecard (from the mockup). */
    badgeNote: "Badges are suggestions from your Concierge; nothing changes until you approve it.",
    /** D84: the real scorecard (Option B). */
    real: {
      /** The period switch's words, by period id. */
      periodNames: { "30d": "30 days", "90d": "90 days", year: "This year" } as Record<string, string>,
      sub: (period: string) => `${period === "This year" ? "This year so far" : `The last ${period}`}: spend from your lead-spend lines in Expenses, leads from your lead log, loans from your pipeline.`,
      none: "No leads, spend or loans in this period yet.",
      dash: "—",
      cols: { canCall: "You can call", pipeline: "In pipeline", perCallable: "Per lead you can call" },
      /** "18 · 20%" under You can call; the cost of each one under it. */
      each: (amount: string) => `${amount} each`,
      perLoanUnit: "per loan",
      pipelineCard: (n: number) => `${n} in pipeline`,
      sphereNote: "Cards, mail and gifts tagged with this source. Leads are past clients and sphere who started a new loan.",
      unattributed: (n: number) => `${n === 1 ? "One loan" : `${n} loans`} closed in this period ${n === 1 ? "has" : "have"} no lead source, so ${n === 1 ? "it isn’t" : "they aren’t"} on a row.`,
      target: {
        label: "Target cost per loan ($)",
        save: "Save target",
        help: (amount: string) => `Scale up and Watch compare each source’s cost per loan with your target, now ${amount}. It starts at $1,000.`,
        saved: (amount: string) => `Target saved: ${amount} per loan.`,
        errors: { range: "Enter a target between $100 and $100,000.", assistant: "Spend is private to each loan officer." },
      },
      /** The Business Manager's newest lead-source move, above the table. */
      move: {
        review: "Review",
        approve: "Approve",
        /** D86: what Approve does. */
        approveNote: "Approving only updates your saved lead plan and adds the steps to Today. It never spends money, contacts a vendor or messages anyone.",
        notNow: "Not now",
        dismissed: "Cleared. Your Business Manager suggests another move next month if the numbers call for one.",
        gone: "That suggestion isn’t waiting any more.",
        all: "See it with your AI assistants",
      },
      /** D83: a lead counted from an import with no date of its own isn't in any period. */
      undated: (n: number) => `${n === 1 ? "One imported lead has" : `${n} imported leads have`} no date of their own, so ${n === 1 ? "it isn’t" : "they aren’t"} counted in a period.`,
    },
  },
  /** D82: the lead plan card; D86 makes it real once a plan is saved. */
  plan: {
    title: "Your lead plan",
    line: (monthly: string, day: number, of: number) => `${monthly} a month · day ${day} of ${of}`,
    done: (monthly: string, of: number) => `${monthly} a month · all ${of} days done`,
    next: (when: string) => `Next check-in ${when}`,
    open: "Open budget planner",
    /** The example card's button opens the real planner (it saves nothing by itself). */
    exampleNote: "The budget planner splits a budget across your own sources; nothing is saved until you press Save.",
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

/**
 * D84: the Business Manager's lead-source moves (lib/agents/business.ts). Compliance reviews every one
 * (`reviewLeadMove`): never a gift tied to a referral, never paying for referrals or trigger leads, never contacting
 * leads without permission, no rates.
 */
export const LEAD_MOVES = {
  pauseTo: (from: string, to: string) => `Move ${from}’s budget to ${to} for 60 days`,
  pause: (from: string) => `Pause ${from} for 60 days`,
  fix: (source: string) => `Ask ${source} for consent wording that names you`,
  pauseWhy: (from: string, spend: string, leads: number) => `${from}: ${spend} spent in the last 90 days, ${leads} lead${leads === 1 ? "" : "s"}, and no loans closed or in progress.`,
  toWhy: (to: string, perLoan: string) => `${to}: ${perLoan} per closed loan.`,
  fixWhy: (source: string, leads: number, canCall: number, share: number) => `${source}: ${leads} leads in the last 90 days, and ${canCall} of them (${share}%) came with consent wording that names you or your company. Use “Copy a note for your vendor” on Lead sources to ask for it.`,
  tail: "Nothing changes until you approve it. Approving only updates your lead plan and adds the steps to Today; it never spends money, contacts a vendor or messages anyone.",
};

/**
 * D85: "Ask your Concierge" on Lead sources. Every figure in these lines comes from the lead-source pack
 * (lib/leads/ask.ts), worked out in code; the AI only explains them. Every line here passes the Concierge's guard and
 * the lead-advice rules (a test): no gift tied to a referral, no paying anyone for referrals, no trigger leads or
 * credit-inquiry data, no contacting anyone before they say yes, no rates.
 */
export const LEAD_ASK = {
  /** The AI disclosure, before the box (shown before any answer). */
  disclosure: "Your Concierge is AI. It answers from your own scorecard and never sees names, phone numbers or emails. You approve every step.",
  disclosureExample: "Your Concierge is AI. Until your first lead arrives it answers in general terms: the numbers on this page are examples, not yours.",
  working: "Thinking…",
  heading: "Your Concierge",
  you: "You asked:",
  byAi: "Answered by your Concierge (AI) from your scorecard.",
  noAi: (why: string) => `Answered from your scorecard without the AI, because ${why}.`,
  held: (why: string) => `Your Concierge’s AI answer was held back (it ${why}), so this answer comes straight from your scorecard.`,
  unavailable: "the AI isn’t available right now",
  seeScorecard: "For the other figures, see the scorecard.",
  exampleNote: "Your page shows example numbers until your first lead arrives, so this answer is general. None of the example numbers are yours.",
  tableCaption: (period: string) => `${period === "This year" ? "This year so far" : `The last ${period}`}, from your scorecard`,
  cols: { source: "Source", spent: "Spent", monthly: "Monthly amount", leads: "Leads", perLead: "Per lead", canCall: "You can call", share: "Share you can call", perCallable: "Per lead you can call", loans: "Loans", perLoan: "Per loan", says: "Concierge says" },
  noMonthly: "—",
  noLoans: "None yet",
  stepsTitle: "Steps it adds to Today",
  save: "Save as my 90-day plan",
  /** D86: "Save as my 90-day plan" opens the planner with the answer's budget. */
  saveNote: "Opens the budget planner with this budget. Nothing is saved until you press Save there.",
  addSteps: "Add the steps to Today",
  adding: "Adding…",
  added: (n: number, already: number) => (n ? `Added ${n} ${n === 1 ? "step" : "steps"} to Today.` : "Nothing new to add.") + (already ? ` ${already} ${already === 1 ? "was" : "were"} already there.` : ""),
  showMath: "Show the math",
  hideMath: "Hide the math",
  mathTitle: "The math",
  errors: {
    empty: "Type a question first, or pick one of the questions to try.",
    assistant: "Lead sources answers use spend, which is private to each loan officer.",
    signIn: "Sign in again.",
    steps: "Those steps couldn’t be added. Ask again and try once more.",
  },
  /** Questions the Concierge won't take to the AI. */
  refuse: {
    trigger: "Your Concierge doesn’t suggest trigger leads or buying credit-inquiry data. Ask about the sources you run, your own web form or your past clients and sphere.",
    referral: "Your Concierge won’t suggest paying real estate agents or anyone else for referrals, or an “exclusive” deal that works like one (RESPA section 8). Ask about lead sources you pay for openly, at a set price.",
    gift: "Gifts are never tied to referrals. Closing gifts are fine on their own; your Concierge won’t plan them around who sends you business.",
    contact: "Your Concierge only helps you reach people who’ve said yes. Leads that show No permission yet need their own yes first.",
    rate: "Your Concierge doesn’t talk about rates on Lead sources. Ask about cost per lead, cost per loan or permission.",
    protected: "Lead sources and ads are never aimed by who people are (age, family, religion, origin, health or the like). Ask about sources, spend or permission instead.",
  },
  /** Step titles and why-lines (each becomes a Business Manager step on Today). */
  steps: {
    pause: (src: string, days: number) => `Pause ${src} for ${days} days`,
    pauseWhy: (spend: string, leads: number) => `${spend} spent, ${leads} ${leads === 1 ? "lead" : "leads"}, and no loans closed or in progress.`,
    fix: (src: string) => `Ask ${src} for consent wording that names you`,
    fixWhy: (canCall: number, leads: number, share: number) => `${canCall} of ${leads} leads (${share}%) named you. Use “Copy a note for your vendor” on Lead sources.`,
    keep: (src: string) => `Keep ${src} funded`,
    keepWhy: (perLoan: string, target: string) => `${perLoan} per loan, at or under your ${target} target.`,
    best: (src: string) => `Keep ${src} going: your best value`,
    bestWhy: (perLoan: string) => `${perLoan} per loan, the lowest on your scorecard.`,
    watch: (src: string, days: number) => `Check ${src} again in ${days} days`,
    watchWhy: (closed: number, perLoan: string | null, target: string) => (perLoan ? `${perLoan} per loan, over your ${target} target.` : `${closed} ${closed === 1 ? "loan" : "loans"} closed so far.`),
    test: (src: string) => `Treat ${src} as a test`,
    testWhy: (leads: number, days: number) => `${leads} ${leads === 1 ? "lead" : "leads"} so far. Judge it after ${days} days on cost per loan.`,
    sphere: "Keep in touch with past clients and sphere",
    sphereWhy: "Cards and campaigns to people who already know you. Every one of them can say yes to you directly.",
    newSource: (days: number) => `Pick one new source to test for ${days} days`,
    newSourceWhy: "Start it with a small monthly amount, and ask the vendor for consent wording that names you before you sign up.",
    monthly: "Set its monthly amount on Lead sources",
    monthlyWhy: "So its spend is counted on your scorecard.",
    checkIn: (days: number) => `Look at your scorecard again in ${days} days`,
    checkInWhy: "See which sources closed loans, and adjust.",
    connect: "Connect your first lead source",
    connectWhy: "Make a connection address on Lead sources and paste it into your vendor’s delivery settings.",
    askWording: "Ask your vendors for consent wording that names you",
    askWordingWhy: "A lead counts as permission only when the wording names you or your company.",
    logSpend: "Log what each source costs in Expenses",
    logSpendWhy: "Tag each line with its lead source so the scorecard can count it.",
  },
  /** The answers built from the scorecard (and the AI's fallback). */
  answer: {
    // Which source should I add next?
    addBest: (src: string, perLoan: string, target: string) => `${src} is your best value so far: ${perLoan} per loan, against your target of ${target}. Before you add a source, make sure it keeps its budget.`,
    addNoBest: "No source has closed enough loans to compare cost per loan yet.",
    addFix: (src: string, canCall: number, leads: number, share: number) => `Fix ${src} first: ${canCall} of its ${leads} leads (${share}%) came with wording that names you.`,
    addHow: (days: number, target: string) => `Then add one new source at a time as a ${days}-day test with a small monthly amount, and judge it on cost per loan against your ${target} target.`,
    addOwn: "Your own web form and your past clients and sphere are the sources where every lead already knows you or named you.",
    addWording: "Ask any new vendor for consent wording that names you or your company before you sign up.",
    // Plan $X a month for 90 days
    planBudget: (budget: string, monthly: string, left: string | null, over: string | null) =>
      `Your budget: ${budget} a month for 90 days. Your monthly amounts add up to ${monthly}${left ? `, which leaves ${left}` : over ? `, which is ${over} over` : ""}.`,
    planNoMonthly: (budget: string) => `Your budget: ${budget} a month for 90 days. You haven’t set monthly amounts for your sources yet.`,
    planNoBudget: "Tell me a monthly budget (for example, “Plan $1,500 a month for 90 days”) and I’ll set it against your sources.",
    planSphere: (spend: string, closed: number) => `Keep past clients and sphere going first: ${spend} spent and ${closed} ${closed === 1 ? "loan" : "loans"} closed.`,
    planScale: (src: string, perLoan: string, target: string) => `Scale up ${src}: ${perLoan} per loan, at or under your ${target} target.`,
    planBest: (src: string, perLoan: string) => `${src} is your best value: ${perLoan} per loan.`,
    planWatch: (src: string, perLoan: string | null, closed: number, target: string) => (perLoan ? `Watch ${src}: ${perLoan} per loan, over your ${target} target.` : `Watch ${src}: ${closed} ${closed === 1 ? "loan" : "loans"} closed so far.`),
    planFix: (src: string, canCall: number, leads: number) => `Ask ${src} for consent wording that names you before you renew: ${canCall} of ${leads} leads named you.`,
    planPause: (src: string, spend: string, leads: number) => `Pause ${src}: ${spend} spent, ${leads} ${leads === 1 ? "lead" : "leads"} and no loans closed or in progress.`,
    planThin: (src: string, leads: number) => `${src} has ${leads} ${leads === 1 ? "lead" : "leads"} so far, not enough to judge: treat it as a test.`,
    planNext: "Open the budget planner to split the dollars across your sources and save it as your 90-day plan.",
    /** D86: the saved plan, when there is one. */
    planSaved: (budget: string, day: number, of: number) => `Your saved plan: ${budget} a month, day ${day} of ${of}.`,
    // Which vendors don't give me permission?
    permNone: "Every vendor lead in this period came with wording that names you.",
    permNoLeads: "No vendor leads in this period yet, so there’s nothing to check.",
    permRow: (src: string, canCall: number, leads: number, share: number) => `${src}: ${canCall} of ${leads} leads (${share}%) named you.`,
    permIntro: (n: number) => `${n === 1 ? "One vendor sends" : `${n} vendors send`} leads whose wording doesn’t always name you:`,
    permWhy: "A lead counts as permission only when the vendor’s consent wording names you or your company. Many forms name only “partners.”",
    permAsk: "Use “Copy a note for your vendor” on Lead sources to ask for wording that names you. The others need their own yes before you reach out.",
    // Anything else: compare the sources.
    compareTotals: (period: string, n: number, leads: number, spend: string, closed: number) => `${period === "This year" ? "This year so far" : `In the last ${period}`}: ${n} ${n === 1 ? "source" : "sources"}, ${leads} ${leads === 1 ? "lead" : "leads"}, ${spend} spent and ${closed} ${closed === 1 ? "loan" : "loans"} closed.`,
    compareLead: (src: string, perLead: string) => `Lowest cost per lead: ${src} at ${perLead}.`,
    compareLoan: (src: string, perLoan: string) => `Lowest cost per loan: ${src} at ${perLoan}.`,
    compareMost: (src: string, leads: number) => `Most leads: ${src} with ${leads}.`,
    compareNone: "Nothing to compare yet: log spend in Expenses and your leads and loans fill in the rest.",
    // Example mode: general terms, never the example numbers.
    exAdd: (days: number) => `In general, start with the people who already know you (past clients and sphere), then your own web form, where every lead names you. Add one paid source at a time as a ${days}-day test, and ask the vendor for consent wording that names you or your company before you sign up.`,
    exPlan: (budget: string | null, days: number) => `${budget ? `With ${budget} a month and no leads of your own yet, ` : "With no leads of your own yet, "}a plan can’t use your numbers. In general: fund past clients and sphere first, keep most of the budget on one source you can measure, and test one new source at a time for ${days} days.`,
    exPermission: "No leads have arrived yet, so there’s nothing to check. A lead counts as permission only when the vendor’s consent wording names you or your company; ask your vendor to send it with every lead.",
    exCompare: "Your scorecard fills in after your first lead arrives. Log what each source costs in Expenses, tagged with its lead source, so cost per lead and cost per loan can be worked out.",
    exAfter: "Once your own leads arrive, ask again and I’ll use your scorecard.",
  },
  /** "Show the math": the formulas, then each row's own figures. */
  math: {
    spend: "Spend = each confirmed lead-spend line in Expenses, at its business-use share.",
    perLead: "Cost per lead = spend ÷ leads.",
    perCallable: "Cost per lead you can call = spend ÷ leads you can call.",
    perLoan: "Cost per loan = spend ÷ loans closed.",
    share: "Share you can call = leads you can call ÷ leads.",
    row: (src: string, parts: string[]) => `${src}: ${parts.join("; ")}.`,
    rowNothing: (src: string) => `${src}: nothing to divide yet.`,
    partPerLead: (spend: string, leads: number, v: string) => `${spend} ÷ ${leads} leads = ${v} per lead`,
    partPerCallable: (spend: string, n: number, v: string) => `${spend} ÷ ${n} you can call = ${v} each`,
    partPerLoan: (spend: string, n: number, v: string) => `${spend} ÷ ${n} ${n === 1 ? "loan" : "loans"} = ${v} per loan`,
    partShare: (canCall: number, leads: number, v: number) => `${canCall} ÷ ${leads} = ${v}% you can call`,
    budget: (budget: string, monthly: string, result: string, over: boolean) => `Budget ${budget} − monthly amounts ${monthly} = ${result} ${over ? "over" : "left"}.`,
    rules: (enough: number, fixPct: number, pause: string, pauseDays: number, scale: number, target: string) =>
      `Badges: Not enough data under ${enough} leads; Fix permission at ${enough} or more leads and under ${fixPct}% you can call; Pause? at ${pause} or more spent, ${pauseDays} days of history and no loans; Scale up at ${scale} or more loans at or under your ${target} target.`,
  },
  /** Home: the steps added from Lead sources. */
  today: {
    title: (n: number) => `Lead plan steps (${n})`,
    open: "Open",
    done: "Done",
    doneLabel: (title: string) => `Mark done: ${title}`,
    from: "Lead sources",
    see: "See them on Today",
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
