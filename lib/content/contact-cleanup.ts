/**
 * lib/content/contact-cleanup.ts — the words of "Clean up your contacts" (D88):
 * the page, the review, the Home card and the morning email's line.
 */
import type { Pair, Reason, Suggestion } from "@/lib/contacts/cleanup";

const n = (x: number) => x.toLocaleString("en-US");
const people = (x: number) => `${n(x)} ${x === 1 ? "person" : "people"}`;
const has = (x: number) => (x === 1 ? "has" : "have");
const q = (s: string) => `“${s}”`;

export const contactCleanupCopy = {
  title: "Clean up your contacts",
  sub: "Your Concierge reads your whole book and suggests tidy-ups. Nothing changes until you approve it.",
  how: "Once a week the morning run reads every person in your book and looks for tags and lead sources written different ways, people who may be listed twice, missing names and states, phones or emails that won't work, leads with a closed loan, and agents filed as clients. Each suggestion shows who it would change. Approve it, skip it, or review it and pick the people. Every approved change can be undone for 30 days. Permission, stops, do-not-call checks, phone checks, the on-hold status and where a list came from are never changed here.",
  button: "Clean up",
  checkAgain: "Check again now",
  checked: (k: number) => (k ? `Checked your whole book just now: ${n(k)} ${k === 1 ? "suggestion" : "suggestions"}.` : "Checked your whole book just now. Nothing to clean up."),
  none: "Nothing to clean up right now. Your Concierge checks again every week.",
  skippedNote: (k: number) => `${n(k)} skipped ${k === 1 ? "suggestion is" : "suggestions are"} hidden. A skipped suggestion comes back only if those people change.`,
  capped: (shown: number, total: number) => `Your book is larger than one check reads: this looked at the first ${n(shown)} of your ${n(total)} people (by last name).`,
  never: "Never changed here: permission, stops, do-not-call, phone checks, the on-hold status or where a list came from.",
  count: (k: number) => `${n(k)} ${k === 1 ? "suggestion" : "suggestions"}`,
  rules: {
    tags: "Tags that mean the same thing",
    sources: "Lead sources written different ways",
    duplicates: "People who may be listed twice",
    basics: "Missing basics",
    reach: "Phones or emails that won't work",
    past_clients: "Past clients still labeled as leads",
    agents: "Agents filed as clients",
    lead_no_source: "Imported leads with no source",
  } as const,
  titleOf: (s: Suggestion): string => {
    switch (s.fix) {
      case "merge_tags":
        return `Merge ${n((s.variants?.length ?? 0) + 1)} tags into ${q(s.target ?? "")} (${people(s.count)})`;
      case "one_source":
        return `Write the lead source ${q(s.target ?? "")} one way (${people(s.count)})`;
      case "merge_pairs": {
        const k = s.pairs?.length ?? 0;
        return `${n(k)} ${k === 1 ? "pair" : "pairs"} may be the same person`;
      }
      case "fill_state":
        return `Fill in the state from the ZIP for ${people(s.count)}`;
      case "past_client":
        return `${n(s.count)} ${s.count === 1 ? "lead has" : "leads have"} a closed loan`;
      case "to_agents":
        return s.count === 1 ? "1 person looks like a real estate agent" : `${people(s.count)} look like real estate agents`;
      case "set_source":
        return `${people(s.count)} from ${s.importLabel ? q(s.importLabel) : "a lead vendor's file"} ${has(s.count)} no lead source`;
      case "tag":
        if (s.id === "basics:no_name") return `${people(s.count)} ${has(s.count)} no name`;
        if (s.id === "basics:no_state") return `${people(s.count)} ${has(s.count)} no state`;
        if (s.id === "basics:lead_none") return `${n(s.count)} ${s.count === 1 ? "lead has" : "leads have"} no lead source`;
        return `${people(s.count)} ${has(s.count)} a phone or email that won't work`;
    }
  },
  does: (s: Suggestion): string => {
    switch (s.fix) {
      case "merge_tags":
        return `Each of these becomes ${q(s.target ?? "")}.`;
      case "one_source":
        return `Their lead source becomes ${q(s.target ?? "")}${s.targetTag ? `, and their lead tag ${q(s.targetTag)}` : ""}.`;
      case "merge_pairs":
        return "Review each pair and merge the ones that are one person, with the same rules as Merge on a person's page: the stricter permission is kept and both histories stay. A merge can't be undone, so each one asks first.";
      case "fill_state":
        return "Fills in the state each one's ZIP is in.";
      case "past_client":
        return "Marks them Past client, so they get past-client check-ins instead of lead follow-ups.";
      case "to_agents":
        return "Moves them to Agents. Any campaigns they're in end, and as agents they never get client messages.";
      case "set_source":
        return "Type where these leads came from, then approve. It's saved as each one's lead source.";
      case "tag":
        return `Adds the tag ${q(s.target ?? "")} so you can find them and fix each one on their page.`;
    }
  },
  alsoWritten: "Also written",
  tagWord: "tag",
  aiMark: "Grouped by M8",
  examples: "For example",
  approve: "Approve",
  approveFor: (title: string) => `Approve: ${title}`,
  skip: "Skip",
  skipFor: (title: string) => `Skip: ${title}`,
  review: "Review",
  reviewFor: (title: string) => `Review: ${title}`,
  seeThem: "See them",
  open: "Open",
  signIn: "to clean up your contacts.",
  signInLink: "Sign in with your email",
  leadSourceLabel: "Lead source for these people",
  leadSourcePlaceholder: "Zillow, Open house…",
  reasons: (r: Reason | undefined): string => {
    if (!r) return "";
    const v = r.raw ? r.raw : "";
    switch (r.code) {
      case "tag": return `Tag ${q(v)}`;
      case "note": return `Their notes: ${v}`;
      case "file": return `Imported from ${q(v)}`;
      case "brokerage": return `Brokerage: ${v}`;
      case "agent_match": return "Same phone or email as an agent in your book";
      case "phone": return `Phone as written: ${v}`;
      case "email": return `Email as written: ${v}`;
    }
  },
  pairBy: { email: "Same email", phone: "Same phone and first name", flagged: "Same phone, tagged Possible duplicate" } satisfies Record<Pair["by"], string>,
  // The review page.
  reviewTitle: "Review a suggestion",
  back: "← All suggestions",
  reviewLead: "Tick the people to change. Untick anyone to leave them as they are.",
  approvePicked: "Approve the ticked people",
  pickedNote: "Only the people ticked are changed. The rest stay in this suggestion.",
  firstOf: (shown: number, total: number) => `Showing the first ${n(shown)} of ${people(total)}. Approve on the main page covers all of them.`,
  gone: "That suggestion isn't there anymore: it was approved, skipped, or those people changed.",
  pairs: {
    lead: "Each pair below shares an email, or a phone and a first name. Merge the ones that are one person; keep the rest separate so they aren't suggested again.",
    preview: "See what a merge keeps",
    same: "These are the same person",
    keep: (name: string) => `Merge, keep ${name}'s record`,
    separate: "Keep separate",
    noUndo: "A merge can't be undone. The stricter permission is kept, a stop on either record stays, and both histories are kept.",
  },
  // Flash lines.
  done: (k: number) => `Done: ${people(k)} updated. You can undo it below for 30 days.`,
  doneNone: "Nothing needed changing: those people were already up to date.",
  changed: "Those people changed since you opened this, so nothing was changed. Here's the suggestion as it is now.",
  skipped: "Skipped. It comes back only if those people change.",
  separated: "Kept separate. That pair won't be suggested again.",
  merged: (name: string) => `Merged into ${name}'s record.`,
  confirmFirst: "Tick “These are the same person” first.",
  needSource: "Type a lead source first.",
  pickSomeone: "Tick at least one person.",
  noBook: "Clean up works in a loan officer's own book. Ask the owner to link your account to the loan officer you assist.",
  mergeRefused: "Those two can't be merged: one was removed, or they're in different books or kinds.",
  // Undo.
  history: "Recent clean-ups",
  historyNone: "Nothing approved yet.",
  undo: "Undo",
  undoHow: "Puts back each change that hasn't been edited since. Permission and stops were never changed, so there's nothing to put back there. Campaigns that ended when someone moved to Agents stay ended.",
  undoLabel: "Type UNDO",
  undoType: "Type UNDO to undo it.",
  undone: (restored: number, kept: number) => `Undone: ${people(restored)} put back.${kept ? ` ${people(kept)} changed since, so ${kept === 1 ? "that change was" : "those changes were"} kept.` : ""}`,
  undoGone: "That clean-up isn't there anymore.",
  undoExpired: "That clean-up is older than 30 days, so it can't be undone here. Change those people on their pages.",
  undoDone: "That clean-up was already undone.",
  undoMerge: "Merges can't be undone.",
  runLine: (who: string, k: number, ended: number) => `${who} · ${people(k)}${ended ? ` · ${n(ended)} ${ended === 1 ? "campaign" : "campaigns"} ended` : ""}`,
  runUndone: (when: string) => `Undone ${when}.`,
  runCanUndo: (until: string) => `Can be undone until ${until}.`,
  runExpired: "Older than 30 days.",
  runMerge: "A merge (can't be undone).",
  byYou: "You",
  // M8 (labels only).
  ai: {
    heading: "Find more with M8",
    disclosure: "M8 is AI. It sees only your tag and lead-source names and how many people carry each, never a person's name, phone, email or notes. It only groups labels; you approve every change.",
    button: "Ask M8 to group similar labels",
    found: (k: number) => `M8 grouped ${n(k)} more ${k === 1 ? "set" : "sets"} of labels. Each is marked “Grouped by M8”.`,
    none: "M8 found no more labels that mean the same thing.",
    few: "There aren't enough labels left for M8 to group.",
    off: (reason: string) => `M8 couldn't look (${reason}). The rules above are everything found so far.`,
  },
  // Home and the morning email.
  home: {
    title: (k: number) => `Clean up your contacts: ${n(k)} ${k === 1 ? "suggestion" : "suggestions"}`,
    note: (p: number) => `${people(p)} could use a tidy-up. Nothing changes until you approve it.`,
    open: "Review suggestions",
    hide: "Not this week",
    hidden: "Hidden until next week.",
  },
  digest: (k: number, url: string) => `Clean up your contacts: ${n(k)} ${k === 1 ? "suggestion" : "suggestions"}. ${url}`,
} as const;
