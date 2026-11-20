/**
 * lib/agents/marketing.ts — the Marketing agent (D54.1). SERVER-ONLY.
 * Keeps the loan officer in front of people without spending on its own:
 *  - Seasonal card drives (Thanksgiving, the holidays, the new year): the
 *    Cards page opens filled in; Thanks.io prices it; nothing is sent or
 *    charged until the loan officer says yes.
 *  - A monthly content plan: post ideas for their own social accounts
 *    (no rates, no promises, nothing about who a home is for, NMLS ID on
 *    every post).
 *  - A nudge to turn on a new-lead follow-up campaign when none is on.
 *  - Mail to new neighborhoods, when they turn that source on.
 */
import type { User } from "@/lib/accounts/store";
import type { Contact } from "@/lib/contacts/store";
import { campaignStore } from "@/lib/campaigns/store";
import { cardsOn } from "@/lib/cards/thanks";
import { thanksStatus, recipientFor } from "@/lib/cards/service";
import type { Proposal } from "./runner";
import type { TeamSettings } from "./store";

const SEASONS: { id: string; from: string; to: string; starter: string; title: string }[] = [
  { id: "thanksgiving", from: "11-01", to: "11-14", starter: "thanksgiving", title: "Thanksgiving cards for your past clients" },
  { id: "holidays", from: "12-01", to: "12-12", starter: "holidays", title: "Holiday cards for your past clients" },
  { id: "new-year", from: "12-27", to: "12-31", starter: "new-year", title: "New year cards for your past clients" },
  { id: "new-year", from: "01-01", to: "01-08", starter: "new-year", title: "New year cards for your past clients" },
];

/** Four post ideas a month; the loan officer writes and posts them on their own accounts. */
export const CONTENT: Record<number, string[]> = {
  1: ["What to gather before you talk to a lender (pay stubs, two years of taxes, bank statements)", "New year, new home? The steps from pre-approval to keys, in plain words", "A local spot you love, and why your area is a good place to live", "A client story you have permission to share (no numbers, no promises)"],
  2: ["Why your credit report matters, and how to check it for free", "Renting vs. buying: questions to ask yourself (link your rent-vs-buy calculator)", "A day in your work: what happens after someone applies", "A quick tip on reading a Loan Estimate"],
  3: ["Spring market: what buyers in your area are asking you about", "Down payment help: ask whether you qualify for a local program", "An agent partner you enjoy working with, and what makes them great", "How long the loan process usually takes, and what can slow it down"],
  4: ["Open house season: how a pre-approval helps you shop with confidence", "Common surprises at closing, and how to avoid them", "A neighborhood event or business you're supporting this month", "Questions to ask any lender you're comparing"],
  5: ["Moving this summer? A simple timeline for buyers", "VA loans: who they're for and how they work (thank a veteran this month)", "What 'points' and 'credits' mean, in plain words", "A behind-the-scenes look at your team"],
  6: ["First-time buyers: the five words you'll hear most, explained", "Home maintenance tips for new owners", "A local summer favorite in your area", "How to compare offers from lenders, line by line"],
  7: ["Self-employed? What lenders look at, and how to prepare", "Your home's equity: what it is and how people use it", "A thank-you to the agents and title partners you work with", "Mid-year check-in: questions homeowners ask you most"],
  8: ["Back to school, back to house hunting: tips for moving with a busy schedule", "What an appraisal is and what happens if it comes in low", "Your favorite local coffee shop or lunch spot", "Pre-qualification vs. a full review of your credit and income: what each one tells you"],
  9: ["Fall market: what's on buyers' minds", "Mortgage words that confuse people, explained", "A community cause you care about", "How to get ready to refinance: what to have on hand"],
  10: ["Planning to buy next year? Start with these three steps", "Home safety and maintenance before winter", "A local fall event or tradition", "What happens on closing day, step by step"],
  11: ["Gratitude: thank your clients and partners (no gifts in posts)", "Moving during the holidays: tips if you're closing in December", "Small Business Saturday: a local business you love", "Questions to ask before you make an offer"],
  12: ["Year in review: what you learned helping buyers this year", "Holiday wishes to your community", "Setting homebuying goals for next year", "A thank-you to the people who make closings happen"],
};

type Ctx = { user: User; settings: TeamSettings; now: Date; contacts: Map<string, Contact> };
const md = (d: Date) => d.toISOString().slice(5, 10);

export async function marketingIdeas(ctx: Ctx, task: (agent: "marketing", key: string, title: string, why: string, score: number, extra?: Partial<Proposal>) => Proposal): Promise<Proposal[]> {
  const out: Proposal[] = [];
  const today = md(ctx.now);
  const y = ctx.now.getUTCFullYear();
  const season = SEASONS.find((s) => today >= s.from && today <= s.to);
  if (season) {
    const pastClients = [...ctx.contacts.values()].filter((c) => c.kind === "contact" && c.relationship === "past_client" && !c.locked && !c.noMail && recipientFor(c));
    const seasonYear = season.id === "new-year" && today >= "12-27" ? y + 1 : y;
    if (!cardsOn()) {
      out.push(task("marketing", `season:${season.id}:${seasonYear}`, season.title, "Cards by mail aren't set up yet. The owner registers Command Center with Thanks.io once; then you connect your own account.", 30, { kind: "plan", href: "/mlo/cards", cooldownDays: 20 }));
    } else if (!(await thanksStatus(ctx.user)).connected) {
      out.push(task("marketing", `season:${season.id}:${seasonYear}`, season.title, `Connect your Thanks.io account to send them (${pastClients.length} past clients have a mailing address).`, 34, { kind: "plan", href: "/mlo/cards", cooldownDays: 20 }));
    } else if (pastClients.length) {
      out.push(task("marketing", `season:${season.id}:${seasonYear}`, season.title, `${pastClients.length} past clients have a mailing address. The Cards page opens with the message and the people filled in; Thanks.io shows the price before anything is sent.`, 46, { kind: "spend", href: `/mlo/cards?starter=${season.starter}&group=past_client`, cooldownDays: 20 }));
    }
  }
  // The month's content plan.
  const m = ctx.now.getUTCMonth() + 1;
  out.push(task("marketing", `content:${ctx.now.toISOString().slice(0, 7)}`, "This month's post ideas", [...CONTENT[m].map((x, i) => `${i + 1}. ${x}`), "Every post: your name and NMLS ID, no rates or promises, and describe homes and loans, not who they're for."].join("\n"), 32, { kind: "plan", cooldownDays: 28 }));
  // A new-lead follow-up campaign.
  if (ctx.settings.sources.includes("leads")) {
    const active = await campaignStore().activeByTrigger(ctx.user.id, "new_lead").catch(() => []);
    if (!active.length) out.push(task("marketing", "campaign:new_lead", "Turn on a follow-up campaign for new leads", "No campaign picks up new leads, so follow-up after the first hello is up to you. Start from the new-lead starter and turn it on.", 41, { href: "/mlo/campaigns", cooldownDays: 30 }));
  }
  // Mail to new neighborhoods: a quarterly idea, priced before anything is spent.
  if (ctx.settings.sources.includes("mail")) {
    const q = `${y}-Q${Math.floor(ctx.now.getUTCMonth() / 3) + 1}`;
    out.push(task("marketing", `mail:${q}`, "Mail a neighborhood this quarter", "Postcards to the homes around a listing, an open house or your office. Thanks.io finds and prices the homes first; you decide.", 36, { kind: "spend", href: "/mlo/cards#neighborhood", cooldownDays: 80 }));
  }
  return out;
}
