/**
 * lib/agents/team.ts — the Concierge team (D54). Who does what.
 * The owner asked (2026-11-20) for "a full team of agents ... to run an
 * efficient mortgage business" that runs on its own and is always finding
 * business. They work from rules over the loan officer's own data (fast,
 * cheap, predictable); Compliance reviews every move; only playbooks the
 * loan officer approved send on their own; nothing spends money without a yes.
 */
export const AGENT_KEYS = ["loa", "chief", "finder", "pipeline", "partner", "coach", "marketing", "business", "compliance"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export type AgentInfo = { key: AgentKey; name: string; role: string; does: string[]; ready: boolean };

export const AGENTS: Record<AgentKey, AgentInfo> = {
  // D62 (owner, 2026-11-20): a dedicated loan officer assistant, with its own showcase.
  loa: { key: "loa", name: "Loan Officer Assistant", role: "Works every file, contract to close", does: ["Reads the purchase agreement, title commitment, conditional approval and escrow fees you drop in", "Keeps every deadline: the contract's, the Loan Estimate and Closing Disclosure clocks, re-verification, the lock", "Drafts the emails to escrow and title: fees, opening title, payoffs. You press Send", "Turns the approval into a to-do list and chases the borrower's items", "Talk to it: it knows Fannie Mae and Freddie Mac (and cites them) and your lenders' overlays"], ready: true },
  chief: { key: "chief", name: "Chief of Staff", role: "Runs your day", does: ["Plans each morning and hands work to the team", "Puts your top three first", "Answers people who are waiting on you"], ready: true },
  finder: { key: "finder", name: "Business Finder", role: "Always finding business", does: ["New web leads, answered in minutes", "Home anniversaries, past clients gone quiet, refi watch", "Canceled and expired listings: reach the listing agent", "Agents new to your area, and relocation contacts"], ready: true },
  pipeline: { key: "pipeline", name: "Pipeline", role: "Keeps loans moving", does: ["Loans running late against your own pace", "Locks about to expire, closings coming up", "The next Loan Journey step on each file"], ready: true },
  partner: { key: "partner", name: "Partner", role: "Builds realtor relationships", does: ["A steady touch with the agents you work with, the CORE way", "Welcomes new agents and listing agents you've added", "Never offers anything of value for referrals (RESPA)"], ready: true },
  coach: { key: "coach", name: "Coach", role: "Holds you to it", does: ["Your daily top three", "A weekly scorecard against your goals", "An income plan worked back to weekly numbers", "Call practice and the next CORE lesson"], ready: true },
  marketing: { key: "marketing", name: "Marketing", role: "Keeps you in front of people", does: ["Seasonal cards to past clients, priced before anything is spent", "A monthly plan of post ideas for your own accounts", "A follow-up campaign for new leads", "Mail to new neighborhoods, when you turn it on"], ready: true },
  business: { key: "business", name: "Business Manager", role: "Runs the numbers", does: ["Profit so far and a tax set-aside to discuss with your CPA", "Cost per closed loan, and which lead sources become loans", "Expense drafts, missing receipts and estimated tax dates"], ready: true },
  compliance: { key: "compliance", name: "Compliance", role: "Checks everything first", does: ["Every message: no rates, promises or pressure, fair housing", "Every agent message: nothing of value for referrals (RESPA)", "Every send through your contact rules; can't be turned off"], ready: true },
};
