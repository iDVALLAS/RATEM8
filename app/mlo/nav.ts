/**
 * app/mlo/nav.ts — every Command Center destination, in one list (D43).
 * The top bar, the phone menu, the bottom tabs and the home screen's tiles
 * all read from here, so they can't drift apart.
 */
export type IconName =
  | "home" | "spark" | "inbox" | "phone" | "users" | "upload" | "cards" | "script" | "pipeline" | "bolt" | "trend" | "cap" | "network"
  | "receipt" | "chart" | "shield" | "team" | "lock" | "gear" | "check" | "message" | "rocket" | "tag" | "mic" | "book" | "globe" | "lead" | "flag" | "help" | "pen" | "wand" | "send" | "mail" | "download" | "video" | "clock";

export type Dest = {
  key: string;
  href: string;
  label: string;
  icon: IconName;
  /** One line for the home tile. */
  desc: string;
  group: GroupKey;
  /** Owners and team leads (and the shared login) only. */
  admin?: boolean;
  /** Needs a personal account (not the shared login). */
  account?: boolean;
  /** Adds the tenant (?t=) to the link. */
  tenant?: boolean;
  /** Paths that count as this destination for the active state. */
  match?: RegExp;
};

export const GROUPS = {
  day: "Your day",
  people: "People",
  loans: "Loans",
  grow: "Grow",
  business: "Business",
  settings: "Settings",
  admin: "Platform",
} as const;
export type GroupKey = keyof typeof GROUPS;

export const DESTS: Dest[] = [
  { key: "home", href: "/mlo", label: "Home", icon: "home", group: "day", desc: "Who to reach today, and everything else.", match: /^\/mlo\/?$/ },
  { key: "concierge", href: "/mlo/concierge", label: "Concierge", icon: "spark", group: "day", desc: "Drafts and reminders your AI assistant prepared. You approve every one." },
  { key: "loa", href: "/mlo/loa", label: "Your LOA", icon: "pipeline", group: "day", desc: "Your loan officer assistant: talk to it, see what needs you, and keep your lenders' overlays.", account: true },
  { key: "agents", href: "/mlo/agents", label: "AI assistants", icon: "users", group: "day", desc: "Your Concierge, your Loan Officer Assistant and the rest of the team, each with its on or off.", account: true },
  { key: "inbox", href: "/mlo/inbox", label: "Inbox", icon: "inbox", group: "day", desc: "Every reply in one place. STOP is honored instantly." },
  { key: "calls", href: "/mlo/calls", label: "Call session", icon: "phone", group: "day", desc: "A focused calling hour: the next person, why, one tap for how it went." },
  { key: "contacts", href: "/mlo/contacts", label: "Contacts", icon: "users", group: "people", desc: "Past clients, leads, sphere and agents, with what you may do for each.", match: /^\/mlo\/contacts(?!\/import|\/permission)/ },
  // D69: agents had no way in once the page's own tabs were hidden.
  { key: "agentlist", href: "/mlo/contacts?kind=agent", label: "Agents", icon: "users", group: "people", desc: "Real estate agents you work with, and the agent lists you've imported.", match: /^$/ },
  { key: "import", href: "/mlo/contacts/import", label: "Import", icon: "upload", group: "people", desc: "Drop Excel, CSV or phone contacts. Matched, cleaned and merged for you.", account: true },
  { key: "permission", href: "/mlo/contacts/permission", label: "Permission", icon: "check", group: "people", desc: "Record consent you already hold, and do-not-call checks, in bulk.", account: true },
  { key: "leads", href: "/mlo/leads", label: "Leads", icon: "lead", group: "people", desc: "New leads from your lead vendors, with where each came from." },
  { key: "campaigns", href: "/mlo/campaigns", label: "Campaigns", icon: "send", group: "people", desc: "Texts, emails and reminders spaced over days, sent for you through your contact rules.", account: true },
  { key: "cards", href: "/mlo/cards", label: "Cards by mail", icon: "mail", group: "people", desc: "Pick people, or everyone, and send handwritten-style notes and holiday cards through Thanks.io.", account: true },
  { key: "videos", href: "/mlo/videos", label: "Video messages", icon: "video", group: "people", desc: "Record a short video, have its words checked, and send each person their own link. See who watched.", account: true },
  { key: "voicemail", href: "/mlo/voicemail", label: "Voicemail drops", icon: "phone", group: "people", desc: "Record a voicemail once and leave it for people, through your contact rules. Its words are checked first.", account: true },
  { key: "templates", href: "/mlo/templates", label: "Templates", icon: "cards", group: "people", desc: "Open house kit, agent outreach, follow-ups and honest answers to objections." },
  { key: "scripts", href: "/mlo/scripts", label: "Call scripts", icon: "script", group: "people", desc: "What to say on each call, built from the client's loan and situation." },
  { key: "pipeline", href: "/mlo/pipeline", label: "Pipeline", icon: "pipeline", group: "loans", desc: "Loans from your loan system, each with its 33-step journey and clocks." },
  { key: "automations", href: "/mlo/automations", label: "Automations", icon: "bolt", group: "loans", desc: "Loan updates and follow-ups drafted for you at the right moment." },
  { key: "refi", href: "/mlo/refi", label: "Refi watch", icon: "trend", group: "loans", desc: "Past clients whose loans may be worth a review. For your eyes only." },
  { key: "academy", href: "/mlo/academy", label: "Training", icon: "cap", group: "grow", desc: "Agent partnerships the CORE way, and inviting agents into lending." },
  { key: "network", href: "/mlo/network", label: "Membership", icon: "network", group: "grow", desc: "People you brought in, your production share, AI use and your area's marketing.", account: true },
  { key: "expenses", href: "/mlo/expenses", label: "Expenses", icon: "receipt", group: "business", desc: "Talk or snap a receipt. A tax-ready report for your CPA at year end.", account: true },
  { key: "report", href: "/mlo/report", label: "Weekly report", icon: "chart", group: "business", desc: "Your week in numbers: reached, replies, drafts, loans moved." },
  { key: "mysettings", href: "/mlo/settings", label: "Your settings", icon: "clock", group: "settings", desc: "Your time zone, and how you hear about new leads: text, email, both or off.", account: true },
  { key: "textsetup", href: "/mlo/text-setup", label: "Texting for your company", icon: "message", group: "settings", desc: "Register your company for business texting once; Command Center does the carrier paperwork and gets the number.", account: true },
  { key: "connections", href: "/mlo/connections", label: "Connections", icon: "network", group: "settings", desc: "Your loan system, application portal and CRM: ARIVE, LendingPad, Encompass, Shape, Bonzo and more.", account: true },
  { key: "email", href: "/mlo/email", label: "Email", icon: "send", group: "settings", desc: "Connect your Gmail or Microsoft 365, so emails to clients go from your own address.", account: true },
  { key: "signature", href: "/mlo/signature", label: "Email signature", icon: "pen", group: "settings", desc: "Your sign-off under every email you send from here.", account: true },
  { key: "messages", href: "/mlo/messages", label: "Messages clients get", icon: "message", group: "settings", desc: "Every automatic message a client can get from you, word for word." },
  { key: "rules", href: "/mlo/rules", label: "Contact rules", icon: "shield", group: "settings", desc: "Quiet hours, caps, do-not-call and state rules every message passes." },
  { key: "team", href: "/mlo/team", label: "People & roles", icon: "team", group: "settings", desc: "Who's on Command Center, their roles and whose book they work in." },
  { key: "setuphelp", href: "/mlo/setup-help", label: "Setup assistant", icon: "wand", group: "settings", desc: "An AI that walks you through any setup step, from texting to your loan system.", account: true },
  { key: "export", href: "/mlo/export", label: "Download everything", icon: "download", group: "settings", desc: "Your whole book in one zip: contacts, permission records, messages, notes and more.", account: true },
  { key: "welcome", href: "/mlo/welcome", label: "Getting started", icon: "help", group: "settings", desc: "Your first day, what works right now, and how to report a problem.", account: true },
  { key: "security", href: "/mlo/security", label: "Sign-in security", icon: "lock", group: "settings", desc: "A code from your phone at sign-in.", account: true },
  { key: "signups", href: "/mlo/signups", label: "Sign-ups", icon: "lead", group: "admin", desc: "Loan officers who signed up. Check each NMLS record and approve.", admin: true },
  { key: "pilot", href: "/mlo/pilot", label: "Pilot", icon: "flag", group: "admin", desc: "Who has signed in, how far each person is, and every problem reported.", admin: true },
  { key: "launch", href: "/mlo/launch", label: "Launch checklist", icon: "rocket", group: "admin", desc: "Every account and setting, in order, and which are done.", admin: true },
  { key: "texting", href: "/mlo/texting", label: "Texting setup", icon: "message", group: "admin", desc: "Your company's registered texting service and its wording.", admin: true },
  { key: "setup", href: "/mlo/setup", label: "Setup", icon: "gear", group: "admin", desc: "Lenders, playbook and the rate rule.", admin: true, tenant: true },
  { key: "pricing", href: "/mlo/pricing", label: "Pricing snapshots", icon: "tag", group: "admin", desc: "Daily priced examples from your pricing engine.", admin: true, tenant: true },
  { key: "voice", href: "/mlo/voice", label: "M8 voice", icon: "mic", group: "admin", desc: "The voice M8 reads replies in.", admin: true, tenant: true },
  { key: "training", href: "/mlo/training", label: "M8 training", icon: "book", group: "admin", desc: "Your instructions for the public M8 chat.", admin: true, tenant: true },
  { key: "rates", href: "/rates", label: "View /rates", icon: "globe", group: "admin", desc: "The public rates page, as borrowers see it.", admin: true },
];

/** Phones: the bottom tabs, the Concierge raised in the middle. Everything else is under "More" (D76). */
export const TABS = ["home", "inbox", "concierge", "contacts", "pipeline"] as const;

/** Desktop: links of their own in the top bar, beside Home, instead of inside a menu (D76). */
export const DIRECT = ["inbox", "contacts", "pipeline"] as const;

/** The eyebrow over a page's title: the name of its group in the menu (D76). */
export function groupLabelOf(key: string): string | null {
  const d = DESTS.find((x) => x.key === key);
  return d ? GROUPS[d.group] : null;
}

export function visibleDests(o: { admin: boolean; signedIn: boolean }): Dest[] {
  return DESTS.filter((d) => (!d.admin || o.admin) && (!d.account || o.signedIn));
}

export const hrefOf = (d: Dest, tenantId: string) => (d.tenant ? `${d.href}?t=${encodeURIComponent(tenantId)}` : d.href);

/** The destination a path belongs to (longest match wins). */
export function activeKey(path: string): string | null {
  const hit = DESTS.filter((d) => (d.match ? d.match.test(path) : path === d.href || path.startsWith(`${d.href}/`))).sort((a, b) => b.href.length - a.href.length)[0];
  return hit?.key ?? null;
}
