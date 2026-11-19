/**
 * lib/templates/library.ts — the built-in templates (D38). Pure data.
 *
 * Open houses co-hosted with an agent, agent outreach, borrower
 * follow-ups, social posts, and calm, honest answers to the objections
 * loan officers hear most. Every template passes the same checks as the
 * Concierge's drafts (a test enforces it): no rates, payments or dollar
 * figures (they'd need full Reg Z advertising disclosures), no promises,
 * no protected topics, no urgency.
 *
 * Variables in braces are filled in from the loan officer's own record
 * and from what they type: {first} {myName} {myFirst} {myNmls} {myPhone}
 * {company} {companyNmls} {bookingLink} {agentName} {agentFirst}
 * {address} {date} {time} {area}.
 */

export const KINDS = ["open_house", "agent", "borrower", "social", "rebuttal"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABELS: Record<Kind, string> = {
  open_house: "Open houses",
  agent: "Agent outreach",
  borrower: "Borrower follow-ups",
  social: "Social posts",
  rebuttal: "Objections and answers",
};

export const CHANNELS = ["text", "email", "print", "social", "say"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABELS: Record<Channel, string> = { text: "Text", email: "Email", print: "Print", social: "Social post", say: "Say it" };

export type Template = {
  id: string;
  kind: Kind;
  channel: Channel;
  title: string;
  subject?: string;
  body: string;
  /** For rebuttals: what the person says. */
  objection?: string;
  /** Why it works, for the loan officer. */
  why?: string;
  /** Rules to follow when using it. */
  rules?: string[];
};

const RESPA_COMARKETING = "Co-hosting with an agent: split the costs by each side's fair share of the space and use, and have the agent pay their share. Never pay for an agent's open house, ads or signs in exchange for referrals (RESPA section 8).";
const ADS = "Your NMLS number, the company's name and NMLS number and Equal Housing Opportunity go on anything printed or posted. Leave rates, payments and down-payment amounts off unless the full required disclosures go with them.";
const FAIR = "Describe the home, never who it's for: no \"perfect for families\", \"great for young couples\" or nearby places of worship.";
const CONSENT = "Text or call only people who ticked the consent box on the sign-in sheet; email anyone with an unsubscribe link.";

export const LIBRARY: Template[] = [
  // ---- Open houses ----
  {
    id: "oh-agent-pitch",
    kind: "open_house",
    channel: "email",
    title: "Offer to co-host an agent's open house",
    subject: "Co-hosting your open house at {address}",
    body: "Hi {agentFirst},\n\nI saw you have {address} coming up. If it helps, I'd be glad to co-host. I can answer financing questions on the spot, so buyers leave knowing what their next step looks like, and you can stay focused on the house.\n\nWe'd split the costs fairly between us, and I'll bring my own sign-in sheet so anyone who wants to hear from me can say so.\n\nWant to talk it through this week?\n\n{myName}, NMLS #{myNmls}\n{company}, NMLS #{companyNmls}\n{myPhone}",
    why: "It leads with the agent's problem (buyers who don't know their next step) and makes the fair split clear from the start.",
    rules: [RESPA_COMARKETING],
  },
  {
    id: "oh-flyer",
    kind: "open_house",
    channel: "print",
    title: "Flyer copy: financing table at the open house",
    body: "OPEN HOUSE\n{address}\n{date}, {time}\n\nHosted by {agentName}\n\nFinancing questions? {myName} will be here to talk through your options: how much home fits your budget, what programs exist for first-time buyers, and what the next step looks like.\n\n{myName}, NMLS #{myNmls}\n{company}, NMLS #{companyNmls}\nEqual Housing Opportunity",
    rules: [ADS, FAIR, RESPA_COMARKETING],
  },
  {
    id: "oh-signin",
    kind: "open_house",
    channel: "print",
    title: "Sign-in sheet with the consent line",
    body: "Welcome to {address}\n\nName | Email | Phone | Working with an agent? (Y/N)\n\n[ ] Yes, {myName} (NMLS #{myNmls}, {company}, NMLS #{companyNmls}) may contact me by call or text about mortgage options at the number above, including texts sent with automated technology. Consent isn't required to buy anything. Message and data rates may apply; reply STOP to stop.",
    why: "The tick box gives you written permission to text and call, and it's separate from the agent's own sign-in.",
    rules: ["Keep the signed sheets (or a photo of them) as your proof of permission, and record it on each contact.", CONSENT],
  },
  {
    id: "oh-invite-past",
    kind: "open_house",
    channel: "email",
    title: "Invite your past clients and neighbors",
    subject: "An open house near you",
    body: "Hi {first},\n\n{agentName} and I are hosting an open house at {address} on {date}, {time}. Even if you're not moving, it's a good look at what homes near you are like right now. Come say hi; I'd love to catch up.\n\n{myName}",
    rules: ["Send by email to past clients (with the footer Command Center adds), or text only those who've said texts are fine.", FAIR],
  },
  {
    id: "oh-thanks-text",
    kind: "open_house",
    channel: "text",
    title: "Thank-you text after the open house (they ticked the box)",
    body: "Hi {first}, it's {myFirst} from the open house at {address}. Thanks for stopping by. If you'd like, I can put together a quick look at what you'd be comfortable with before you go further. Want me to?",
    rules: [CONSENT],
  },
  {
    id: "oh-thanks-email",
    kind: "open_house",
    channel: "email",
    title: "Thank-you email after the open house",
    subject: "Thanks for coming by {address}",
    body: "Hi {first},\n\nThanks for stopping by the open house at {address}. If you're starting to think about buying, the most useful first step is a short conversation about your budget and goals, so you know what fits before you fall for a house.\n\nYou can pick a time here: {bookingLink}\n\n{myName}, NMLS #{myNmls}\n{company}, NMLS #{companyNmls}",
  },
  {
    id: "oh-agent-recap",
    kind: "open_house",
    channel: "email",
    title: "Recap to the agent the next day",
    subject: "Open house recap: {address}",
    body: "Hi {agentFirst},\n\nThanks for having me at {address}. Quick recap: I spoke with the people who had financing questions, and I'll follow up with the ones who asked me to. Anyone already working with another agent, I'll point back to them.\n\nWhat would make the next one better for you?\n\n{myFirst}",
    why: "Agents notice the loan officer who reports back. Asking what would make it better starts the next conversation.",
  },
  // ---- Agent outreach (the relationship) ----
  {
    id: "ag-intro",
    kind: "agent",
    channel: "email",
    title: "First note to an agent you'd like to work with",
    subject: "Your buyers, and a lender who calls back",
    body: "Hi {agentFirst},\n\nI'm {myName}, a loan officer with {company} here in {area}. I'd like to earn a place on your list of lenders. Not by asking for referrals, but by showing you how I take care of a buyer: I answer the phone, I tell people the truth about what they qualify for, and I keep you posted at every step so nothing surprises you at closing.\n\nCould I buy you a coffee and hear how you like to work with lenders?\n\n{myName}, NMLS #{myNmls}\n{company}, NMLS #{companyNmls}\n{myPhone}",
    why: "Asking how they like to work puts the agent first. The meeting is the goal, not a referral.",
    rules: ["A coffee is fine. Never offer anything of value for referrals, and never tie a gift or a meal to sending you business (RESPA section 8)."],
  },
  {
    id: "ag-after-coffee",
    kind: "agent",
    channel: "email",
    title: "After meeting an agent",
    subject: "Great to meet you",
    body: "Hi {agentFirst},\n\nThanks for the time today. I wrote down what you said matters most to you: fast pre-approvals buyers can trust, and updates without having to chase anyone. That's how I'll work with any buyer you send my way.\n\nIf you have someone today who isn't sure what they can afford, I'm happy to talk with them, even if they're early.\n\n{myFirst}",
  },
  {
    id: "ag-checkin",
    kind: "agent",
    channel: "text",
    title: "Quick check-in with an agent partner",
    body: "Hi {agentFirst}, {myFirst} here. Anything on your desk this week I can help with? Even a buyer who's just curious about what they can afford.",
  },
  {
    id: "ag-update",
    kind: "agent",
    channel: "text",
    title: "Loan update to the agent (with the buyer's OK)",
    body: "Hi {agentFirst}, quick update on {first}'s loan: the appraisal is ordered and everything else is on track. I'll tell you the moment anything changes.",
    rules: ["Send loan updates to an agent only when the borrower has said it's fine (their contact record shows it)."],
  },
  // ---- Borrower follow-ups ----
  {
    id: "bo-shopping",
    kind: "borrower",
    channel: "text",
    title: "Someone said they're shopping around",
    body: "Totally fair, {first}, and smart. When you compare, look at the Loan Estimate side by side: the rate, the points and the lender fees together. Send me the others and I'll walk through them with you honestly, even if mine isn't the one.",
  },
  {
    id: "bo-preapproval",
    kind: "borrower",
    channel: "text",
    title: "Pre-approval follow-up",
    body: "Hi {first}, it's {myFirst}. How's the house hunt going? If you've found one you like, call me before you write the offer and we'll make sure your approval matches it.",
  },
  {
    id: "bo-docs",
    kind: "borrower",
    channel: "text",
    title: "Nudge for documents",
    body: "Hi {first}, {myFirst} here. A few items are still open in your portal. Once they're in, we can keep things moving. Any questions on what's needed, just reply.",
  },
  {
    id: "bo-anniversary",
    kind: "borrower",
    channel: "email",
    title: "Home anniversary check-in",
    subject: "Happy home anniversary",
    body: "Hi {first},\n\nIt's been a year since you got the keys. I hope the house has been good to you. If anything has changed, like a project you're planning or a question about your loan, I'm glad to take a look with you. No pressure either way.\n\n{myName}",
  },
  // ---- Social ----
  {
    id: "so-open-house",
    kind: "social",
    channel: "social",
    title: "Post: co-hosting an open house",
    body: "Co-hosting an open house with {agentName} at {address} on {date}, {time}. Come see the home, and bring your financing questions. I'll be there to help you understand your options.\n\n{myName}, NMLS #{myNmls} | {company}, NMLS #{companyNmls} | Equal Housing Opportunity",
    rules: [ADS, FAIR],
  },
  {
    id: "so-tip",
    kind: "social",
    channel: "social",
    title: "Post: one tip for buyers",
    body: "Buyer tip: when you compare lenders, compare the Loan Estimates side by side. Look at the rate, the points and the lender fees together, not just one number. Questions? I'm glad to walk you through yours.\n\n{myName}, NMLS #{myNmls} | {company}, NMLS #{companyNmls} | Equal Housing Opportunity",
    rules: [ADS],
  },
  // ---- Objections ----
  {
    id: "rb-rate-wait",
    kind: "rebuttal",
    channel: "say",
    title: "Waiting for rates to drop",
    objection: "I'm going to wait for rates to come down.",
    body: "That makes sense, and nobody can tell you where rates go next, me included. What we can do is look at the home you want and the payment you're comfortable with today, and decide if it works on its own. If rates do fall later, we can look at refinancing then, and I'll keep an eye on it for you. Would it help to see the numbers both ways?",
    why: "It agrees, stays honest about not predicting rates, and moves the decision to what they can control.",
  },
  {
    id: "rb-bank",
    kind: "rebuttal",
    channel: "say",
    title: "Going with their bank",
    objection: "I'm just going to use my bank.",
    body: "Your bank may be a great option, and it's worth getting their Loan Estimate. I'd only ask that you let me give you one too, so you can compare the rate, points and fees side by side. As a broker I can check several lenders at once. If your bank comes out ahead, I'll tell you.",
    why: "No knock on the bank; it asks for a fair comparison, which is the borrower's best interest.",
  },
  {
    id: "rb-online",
    kind: "rebuttal",
    channel: "say",
    title: "An online lender quoted lower",
    objection: "An online lender gave me a lower rate.",
    body: "Thanks for telling me. Could you send me their Loan Estimate? A quote can look lower because it includes points or leaves out fees. Once I can see theirs next to mine, we'll know which is actually less, and if theirs is, I'll say so.",
    why: "It moves from a number someone said to the official form, where costs are comparable.",
  },
  {
    id: "rb-fees",
    kind: "rebuttal",
    channel: "say",
    title: "The fees are too high",
    objection: "Your fees seem high.",
    body: "Let's go through them line by line together. Some are lender fees, and some are third-party costs like title and appraisal that every lender passes along. If there's a trade-off you'd prefer, like a slightly higher rate for lower costs up front, I can show you that option too.",
  },
  {
    id: "rb-think",
    kind: "rebuttal",
    channel: "say",
    title: "Needs to think about it",
    objection: "I need to think about it.",
    body: "Of course. It's a big decision. So I can help while you think: is it the payment, the timing, or something about the loan itself that you're weighing? I'll send you a short summary, and you can call me with any question at all.",
    why: "It respects their time and finds the real concern without pushing.",
  },
  {
    id: "rb-credit",
    kind: "rebuttal",
    channel: "say",
    title: "Worried about their credit",
    objection: "My credit probably isn't good enough.",
    body: "A lot of people think that and turn out to have more options than they expected. Let's take a look together. If it's not there yet, I'll tell you exactly what would help and check back with you as it improves. Either way you'll know where you stand.",
  },
  {
    id: "rb-down",
    kind: "rebuttal",
    channel: "say",
    title: "Doesn't have enough for a down payment",
    objection: "I don't have enough saved for a down payment.",
    body: "You might need less than you think. Some loan programs need a small down payment, and some areas have down-payment help. Let's look at what you have and see which programs fit. If none do yet, we'll make a plan.",
  },
  {
    id: "rb-not-ready",
    kind: "rebuttal",
    channel: "say",
    title: "Not ready to buy yet",
    objection: "We're not ready to buy for a while.",
    body: "That's perfect timing to talk, honestly. Knowing what you'd qualify for now gives you a target to plan toward, and there's no obligation. Want to do a quick review so you have a picture?",
  },
  {
    id: "rb-friend",
    kind: "rebuttal",
    channel: "say",
    title: "A friend or family member is a lender",
    objection: "My cousin is a loan officer.",
    body: "That's great, and you should definitely talk with them. If you'd like a second set of numbers to compare, I'm glad to give you one, no hard feelings either way.",
  },
  {
    id: "rb-preapproved",
    kind: "rebuttal",
    channel: "say",
    title: "Already pre-approved elsewhere",
    objection: "We're already pre-approved with someone else.",
    body: "Good, you're ahead of most buyers. A pre-approval doesn't lock you in, so if you'd like, I can review theirs and give you a Loan Estimate to compare. If theirs is the better deal, keep it.",
  },
  {
    id: "rb-agent-lender",
    kind: "rebuttal",
    channel: "say",
    title: "An agent asks why they should send buyers to you",
    objection: "I already have lenders I use.",
    body: "I'd expect that. I'm not asking you to drop anyone. I'd just like the chance to show you how I handle one buyer: I call back fast, I keep you updated without being asked, and I'll tell a buyer the truth even when it's not what they want to hear. If that's useful to you, great.",
    rules: ["Never offer anything for referrals; the reason to work with you is the service (RESPA section 8)."],
  },
  {
    id: "rb-refi-cost",
    kind: "rebuttal",
    channel: "say",
    title: "A refinance isn't worth it",
    objection: "Refinancing isn't worth the cost.",
    body: "It often isn't, and I'll tell you when that's the case. The way to know is to compare what it costs with what you'd save each month and how long you plan to stay. Let me run it for you, and if it doesn't pay off in time, we'll leave it.",
  },
];

/** Variables a template uses. */
export function variablesOf(body: string): string[] {
  return [...new Set([...body.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]))];
}

/** Fills variables; anything missing stays visible as [field] so it can't go out blank by accident. */
export function fill(body: string, values: Record<string, string | null | undefined>): string {
  return body.replace(/\{([a-zA-Z]+)\}/g, (_m, k: string) => {
    const v = values[k]?.trim();
    return v ? v : `[${k}]`;
  });
}

export const VARIABLE_LABELS: Record<string, string> = {
  first: "Their first name",
  agentName: "Agent's full name",
  agentFirst: "Agent's first name",
  address: "Property address",
  date: "Date",
  time: "Time",
  area: "Your area",
};
