/**
 * lib/academy/course.ts — the training sessions in Command Center (D39).
 * Pure data.
 *
 * Track 1 teaches building real estate agent partnerships on the
 * principles The CORE Training (founded by Rick Ruby in 2001) describes
 * publicly: systems, accountability and execution over motivation; know
 * and track your numbers; time blocking; the initial contact; mastering
 * the close; goal setting. This is LoanM8's own material, not The CORE's
 * curriculum. The owner can add their own coaching notes to any session.
 *
 * Track 2 is how a loan officer invites an agent to get licensed and
 * originate. No income claims anywhere (check:copy enforces it), and the
 * RESPA line runs through every session: the reason an agent works with
 * you is your service, never anything of value for referrals.
 */

export type Quiz = { q: string; options: string[]; answer: number; explain: string };
export type Session = {
  id: string;
  track: TrackId;
  n: number;
  title: string;
  minutes: number;
  goal: string;
  /** Short sections: a heading and its points. */
  learn: { h: string; points: string[] }[];
  /** This week's commitments (the accountability part). */
  doThisWeek: string[];
  quiz: Quiz[];
  /** For practice with M8: who M8 plays and what the loan officer should try. */
  practice?: { persona: string; opening: string; tryTo: string };
};

export const TRACKS = {
  partners: { title: "Agent partnerships, the CORE way", blurb: "Find, meet and keep real estate agent partners with a system you run every week: goals, numbers, time blocks, the first contact, the meeting, the close and the first file." },
  licensing: { title: "Inviting an agent into lending", blurb: "How to talk with an agent about getting their mortgage license and originating with you, honestly and by the rules." },
} as const;
export type TrackId = keyof typeof TRACKS;

const RESPA = "RESPA section 8: you can't give or accept anything of value for referring settlement business. That covers cash, gifts, paying for an agent's ads, signs, open houses or leads, and splitting fees for work not done. Your service is the only reason an agent should send you a buyer.";

export const SESSIONS: Session[] = [
  // ---- Track 1: Agent partnerships ----
  {
    id: "p1",
    track: "partners",
    n: 1,
    title: "Why agents, and where the line is",
    minutes: 12,
    goal: "Know why agent partnerships matter for a purchase business, and the rules that keep them clean.",
    learn: [
      { h: "Why agents", points: ["Buyers usually talk to an agent before they talk to a lender. An agent who trusts you introduces you at the moment it matters.", "One good agent partnership brings buyers every year, not once. That's why it's worth a system, not a hope.", "Agents choose lenders who protect their deals: fast answers, honest pre-approvals, no surprises at closing."] },
      { h: "The line you never cross", points: [RESPA, "Coffee or a modest meal to get to know someone is ordinary business. Never tie anything to sending you buyers, and never keep score in gifts.", "Co-marketing (a shared flyer, a co-hosted open house) is fine when each side pays its fair share of the cost and the use. Write the split down.", "Never pay for an agent's marketing, CRM, signs or leads."] },
      { h: "The CORE way", points: ["Systems, accountability and execution beat motivation. You'll set goals, block time, track your numbers weekly and review them with someone who holds you to them.", "Every session ends with things to do this week. The training works only if you do them."] },
    ],
    doThisWeek: ["Write down why you want agent partners and how many you want a year from now.", "Read your company's marketing and co-marketing policy, and ask your manager anything that isn't clear."],
    quiz: [
      { q: "An agent asks you to pay for their open house signs, and says they'll send you the buyers. What do you do?", options: ["Pay for half, since you'll be there", "Decline: paying for their marketing in exchange for buyers is a thing of value for referrals", "Pay, but don't put it in writing"], answer: 1, explain: "Paying for an agent's marketing tied to referrals is exactly what RESPA section 8 forbids. Co-hosting is fine only with a fair split each side pays." },
      { q: "What's the reason an agent should send you a buyer?", options: ["A gift card each time", "Your service: fast answers, honest pre-approvals, updates", "You covered their lunch"], answer: 1, explain: "Your service is the only clean reason, and the only lasting one." },
      { q: "What does the CORE approach put first?", options: ["Motivation", "Systems, accountability and execution", "Luck and timing"], answer: 1, explain: "Run the same system every week, track it, and have someone hold you to it." },
    ],
  },
  {
    id: "p2",
    track: "partners",
    n: 2,
    title: "Goals and your numbers",
    minutes: 15,
    goal: "Turn a yearly goal into weekly activity you can count.",
    learn: [
      { h: "Work backward", points: ["Start with how many purchase loans you want to close a month.", "Estimate how many come from agent partners, how many partners that takes, and how many conversations and meetings it takes to find each partner. Use your own history; if you're new, start with a guess and correct it monthly.", "The result is a weekly number of new agent conversations and meetings. That's your target."] },
      { h: "Track every week", points: ["Count four things: new agent conversations, meetings held, follow-ups done, and buyers introduced by partners.", "Your Numbers (below) keeps your targets and your weekly log in Command Center.", "Activity you can control (conversations, meetings) predicts results you can't (buyers introduced). Manage the activity."] },
      { h: "Review", points: ["Every Friday, compare the week to your targets. Every month, check whether your estimates were right and adjust them.", "Share the numbers with an accountability partner: your manager, a peer or a coach."] },
    ],
    doThisWeek: ["Fill in Your Numbers: your monthly purchase goal and your weekly conversation and meeting targets.", "Log this week's numbers on Friday, even if they're zero."],
    quiz: [
      { q: "Which numbers should you manage week to week?", options: ["Buyers introduced only", "The activity you control: conversations, meetings, follow-ups", "Closings only"], answer: 1, explain: "Results lag. The activity is what you can change this week." },
      { q: "You're new and don't know your conversion rates. What do you do?", options: ["Wait until you have a year of data", "Start with an estimate and correct it each month", "Copy someone else's goals"], answer: 1, explain: "A guess you correct beats no target at all." },
    ],
  },
  {
    id: "p3",
    track: "partners",
    n: 3,
    title: "Time blocking",
    minutes: 10,
    goal: "Protect the time that builds the business before the day fills up.",
    learn: [
      { h: "The block", points: ["Put a daily prospecting block on your calendar, at the same time every day, before files and email take over. Treat it like a closing.", "In the block: new agent conversations, booking meetings, follow-ups. Nothing else.", "Batch the rest: file work, email and callbacks in their own blocks."] },
      { h: "Make it easy", points: ["Prepare tomorrow's call list the day before (Command Center's call session and templates help).", "Phone face down, email closed. Short and focused beats long and scattered.", "If you miss a block, move it; don't delete it."] },
    ],
    doThisWeek: ["Put a daily prospecting block on your calendar for the next four weeks.", "Build tomorrow's list of five agents to contact before you finish today."],
    quiz: [
      { q: "When is the best time for a prospecting block?", options: ["Whenever there's a gap", "The same time daily, before the day fills up", "Friday afternoons"], answer: 1, explain: "A fixed early block survives a busy day; gaps don't appear." },
      { q: "You missed today's block for a closing. What now?", options: ["Skip it", "Move it to later today or tomorrow", "Double tomorrow's"], answer: 1, explain: "Move it; the habit matters more than any one day." },
    ],
  },
  {
    id: "p4",
    track: "partners",
    n: 4,
    title: "Building your list",
    minutes: 12,
    goal: "Know which agents to call and why each one.",
    learn: [
      { h: "Who to look for", points: ["Agents active in your area this year, especially those with buyer sides.", "Newer agents who want a lender who teaches and answers the phone.", "Agents whose lender just left, retired or let them down.", "Team leads, who decide for several agents."] },
      { h: "Do your homework", points: ["Look at their recent sales, the neighborhoods and price points they work, and how they market.", "Find one specific thing to mention: a recent listing, a neighborhood they know well.", "Keep them as agent contacts in Command Center, with where you met and what matters to them."] },
      { h: "Respect", points: ["Don't call an agent's buyers or try to go around them.", "Agents are contacted by hand, with real conversations. No automated dialing or mass texts to agents either."] },
    ],
    doThisWeek: ["Add 20 agents to Contacts as agents, each with one note about why they fit.", "Pick the five you'll contact first."],
    quiz: [
      { q: "What's the most useful thing to know before calling an agent?", options: ["Their favorite restaurant", "Their recent sales and how they work", "Their lender's rates"], answer: 1, explain: "Knowing their business lets you open with something specific to them." },
      { q: "May you text 200 agents at once with an offer?", options: ["Yes, they're businesses", "No: agents are contacted by hand, one conversation at a time", "Yes, after 9 a.m."], answer: 1, explain: "Mass texts get you blocked and break the trust you're trying to build (and texting rules still apply)." },
    ],
  },
  {
    id: "p5",
    track: "partners",
    n: 5,
    title: "The first contact",
    minutes: 15,
    goal: "Open a conversation that earns a meeting, without asking for business.",
    learn: [
      { h: "Lead with them", points: ["Open with the specific thing you noticed about their business.", "Say what you do in one sentence that matters to them: \"I call buyers back the same day and I tell them the truth about what they qualify for.\"", "Ask for a short meeting, not referrals: \"Could I buy you a coffee and hear how you like to work with lenders?\""] },
      { h: "Channels", points: ["A call is best, a short email second (see Templates → Agent outreach), and an in-person hello at an open house third.", "Follow up three times over two weeks before you move on, and note each try."] },
      { h: "If they say no", points: ["\"I already have lenders\" is normal. Ask for the chance to be a backup, and stay in touch.", "Thank them, note it, and set a check-in for later."] },
    ],
    doThisWeek: ["Contact five agents with a specific opener and a meeting ask.", "Practice the opener with M8 below until it sounds like you."],
    quiz: [
      { q: "What should the first contact ask for?", options: ["Referrals", "A short meeting to learn how they work", "Their buyer list"], answer: 1, explain: "The meeting is the goal; referrals come from trust you earn later." },
      { q: "An agent says they already have lenders. Best reply?", options: ["Offer a gift if they switch", "Ask to be a backup and stay in touch", "Argue their lender is worse"], answer: 1, explain: "No pressure and no knocks on anyone. Being the backup often becomes being first." },
    ],
    practice: { persona: "a busy listing agent who already has two lenders and gets calls from loan officers every week", opening: "Hi, this is Jordan. Make it quick, I'm between showings.", tryTo: "Open with something specific about their business and ask for a short coffee meeting, without asking for referrals or offering anything of value." },
  },
  {
    id: "p6",
    track: "partners",
    n: 6,
    title: "The meeting",
    minutes: 15,
    goal: "Learn what they need, show how you deliver it, and agree on a first step.",
    learn: [
      { h: "Ask, then listen", points: ["How do you like to work with lenders? What does a great one do?", "What's gone wrong with a lender before?", "Where do your buyers get stuck: knowing what they can afford, timing, documents?", "How do you like updates: text, call, email? How often?"] },
      { h: "Show your system", points: ["Walk through how you take care of a buyer: same-day response, an honest pre-approval, the loan journey and updates at each step (with the buyer's OK).", "Use their words back: \"You said surprises at closing are the worst. Here's how I prevent them.\""] },
      { h: "Agree on one step", points: ["Ask for one buyer to start, even an early one: \"Would you send me the next buyer who isn't sure what they can afford?\"", "Write down what they told you in their contact notes."] },
    ],
    doThisWeek: ["Hold two agent meetings.", "After each, send the after-meeting note (Templates → Agent outreach) the same day."],
    quiz: [
      { q: "Who should do most of the talking at the first meeting?", options: ["You", "The agent", "Equal"], answer: 1, explain: "You learn what matters to them, then show how you deliver exactly that." },
      { q: "What's a good close for a first meeting?", options: ["\"Send me all your buyers\"", "\"Would you send me the next buyer who isn't sure what they can afford?\"", "\"I'll pay for your next listing photos\""], answer: 1, explain: "One clear, small step. And never anything of value for referrals." },
    ],
    practice: { persona: "an agent at a coffee meeting who was burned last year when a lender's pre-approval fell apart a week before closing", opening: "Thanks for the coffee. Honestly, my last lender nearly cost me a deal. Why would you be different?", tryTo: "Ask about what went wrong, listen, show how your process prevents it, and ask for one buyer to start." },
  },
  {
    id: "p7",
    track: "partners",
    n: 7,
    title: "The close and the first file",
    minutes: 12,
    goal: "Ask clearly, then win the partnership on the first loan.",
    learn: [
      { h: "Ask clearly", points: ["People respond to a clear, respectful ask. If the meeting went well, say so and ask for the next step plainly.", "If they hesitate, ask what would make them comfortable."] },
      { h: "The first file decides it", points: ["Call their buyer the same day.", "Tell the buyer the truth about what they qualify for, even if it's not what they hoped.", "Update the agent at every milestone (with the buyer's OK); Command Center's automations can draft these.", "Close on time, and tell the agent before they have to ask."] },
      { h: "Debrief", points: ["After closing, ask the agent what you could do better. Write it down and do it.", "Thank them in a note. Never with something of value tied to the referral."] },
    ],
    doThisWeek: ["For each active agent file, send one proactive update this week.", "Debrief one recent closing with its agent."],
    quiz: [
      { q: "An agent's first buyer won't qualify for their target price. What do you do?", options: ["Stretch the numbers", "Tell the buyer and agent the truth and offer a plan", "Stop answering"], answer: 1, explain: "Honesty on the first file is what agents remember." },
      { q: "How do you thank an agent after their buyer closes?", options: ["A gift card", "A thank-you note and a debrief", "Pay for their next ad"], answer: 1, explain: "A note and a better process next time; nothing of value tied to the referral." },
    ],
    practice: { persona: "an agent whose buyer you just pre-approved, who wants to know how often they'll hear from you", opening: "OK, my buyer liked you. So how do I know I won't be chasing you for updates?", tryTo: "Explain your update rhythm, agree on how they want updates, and confirm you'll only share what the buyer has said is OK." },
  },
  {
    id: "p8",
    track: "partners",
    n: 8,
    title: "Accountability and the next 30 days",
    minutes: 10,
    goal: "Make the system a habit you run every week.",
    learn: [
      { h: "Every week", points: ["Friday: log your numbers and compare them to your targets.", "Pick one thing to do better next week.", "Review with your accountability partner."] },
      { h: "Grow what works", points: ["Co-host open houses with your best partners (Templates → Open houses), with a fair split of costs.", "Teach a short class for an agent's buyers, or for an office, on what buyers should know before they shop.", "Keep in touch with every partner monthly, even when they have nothing for you."] },
      { h: "Your 30-day plan", points: ["Write down your weekly targets, your daily block, the 20 agents on your list and the two meetings you'll hold each week.", "Put the first review on your calendar."] },
    ],
    doThisWeek: ["Write your 30-day plan in the notes for this session.", "Book a weekly 15-minute review with your accountability partner."],
    quiz: [
      { q: "What's the weekly habit that keeps the system working?", options: ["Buying lunch for agents", "Logging and reviewing your numbers with someone", "Waiting for referrals"], answer: 1, explain: "Accountability is what turns the plan into results." },
      { q: "You co-host an open house with an agent. How are costs handled?", options: ["You pay everything", "Each side pays its fair share, in writing", "The agent pays everything"], answer: 1, explain: "A fair split keeps it co-marketing and not a thing of value." },
    ],
  },

  // ---- Track 2: Inviting an agent into lending ----
  {
    id: "l1",
    track: "licensing",
    n: 1,
    title: "Who might want to originate",
    minutes: 10,
    goal: "Recognize agents who may want to become loan officers, and approach them honestly.",
    learn: [
      { h: "Signs of a fit", points: ["They're the agent buyers call with financing questions, and they enjoy answering.", "They like the numbers side of a deal.", "They want work that isn't all evenings and weekends, or a second line of business.", "They're organized, follow through and like helping people plan."] },
      { h: "Be honest", points: ["Never promise income or say what they'll make. Talk about the work, the support and the path.", "Don't pressure an agent who's happy where they are.", "Don't recruit an agent who is another loan officer's close partner in a way that harms that relationship."] },
    ],
    doThisWeek: ["List three agents who might be curious about lending, with why."],
    quiz: [
      { q: "An agent asks how much loan officers make. What do you say?", options: ["Quote a big number", "It varies widely; talk about how compensation works and the support, never a promise", "Show your own paycheck"], answer: 1, explain: "Income claims are off limits. Explain how it works, not what they'll earn." },
    ],
  },
  {
    id: "l2",
    track: "licensing",
    n: 2,
    title: "What getting licensed takes",
    minutes: 12,
    goal: "Explain the licensing path accurately.",
    learn: [
      { h: "The SAFE Act path (NMLS)", points: ["At least 20 hours of NMLS-approved pre-licensing education, including federal law, ethics and nontraditional lending, plus any hours their state adds.", "Pass the SAFE MLO test (the national test with uniform state content).", "A criminal background check (fingerprints) and a credit report through NMLS.", "A state license in each state where they'll originate, sponsored by a licensed company.", "Continuing education every year to keep the license."] },
      { h: "With you", points: ["Help them make a study plan and set a test date.", "Introduce them to the owner for sponsorship; Command Center accounts come after they're licensed and sponsored.", "Check the current requirements on NMLS and their state regulator's site together; they change."] },
    ],
    doThisWeek: ["Bookmark the NMLS licensing pages for your states and read them once."],
    quiz: [
      { q: "What's the minimum federal pre-licensing education under the SAFE Act?", options: ["8 hours", "20 hours", "40 hours"], answer: 1, explain: "Twenty hours, with federal law, ethics and nontraditional lending included; some states add more." },
      { q: "Can someone originate loans before they're licensed and sponsored?", options: ["Yes, under supervision", "No", "Only refinances"], answer: 1, explain: "They need the license (and a sponsoring company) in each state first." },
    ],
  },
  {
    id: "l3",
    track: "licensing",
    n: 3,
    title: "Agent and loan officer: the rules",
    minutes: 12,
    goal: "Understand what changes for someone who holds both licenses.",
    learn: [
      { h: "Holding both", points: ["Some states, and many companies, limit or set conditions on being both the agent and the loan officer on the same transaction. Ask the sponsoring company and counsel before they do it.", "Where both roles are allowed on one deal, the buyer must be told, and the person is paid only for work actually done in each role.", "Their real estate brokerage may have its own policy; they should check it."] },
      { h: "Referrals", points: [RESPA, "As a loan officer, they can't pay or receive anything for referrals, including from their old real estate colleagues."] },
    ],
    doThisWeek: ["Ask your sponsoring company for its written policy on licensed agents who originate."],
    quiz: [
      { q: "Can a licensed agent who becomes a loan officer always act in both roles on the same deal?", options: ["Yes, everywhere", "It depends on the state and the company; ask the sponsor and counsel", "Never"], answer: 1, explain: "Rules differ by state and company, and there are disclosure duties where it's allowed." },
    ],
  },
  {
    id: "l4",
    track: "licensing",
    n: 4,
    title: "The conversation",
    minutes: 15,
    goal: "Invite an agent to consider lending, and answer their questions honestly.",
    learn: [
      { h: "Open with curiosity", points: ["\"You're the one your buyers ask about financing. Have you ever thought about doing that side?\"", "Listen for what they want: steadier work, helping buyers earlier, growing a team."] },
      { h: "What you can offer", points: ["LoanM8 Command Center, M8, this training and the templates, and a sponsoring company.", "A clear licensing path and help studying.", "Membership in a community of loan officers who share an area marketing budget and help each other."] },
      { h: "Common questions", points: ["\"I don't have time to study.\" Most courses are online and self-paced; make a plan for a few hours a week.", "\"Would I lose my real estate business?\" That depends on the state and the companies' policies (session 3). Find out before deciding.", "\"How would I be paid?\" Explain how loan officer compensation works under the sponsor's written plan, never a promise of an amount."] },
    ],
    doThisWeek: ["Have one curiosity conversation with an agent from your list."],
    quiz: [
      { q: "Which opener fits best?", options: ["\"You could double your income\"", "\"Have you ever thought about doing the financing side?\"", "\"Sign up today, spots are limited\""], answer: 1, explain: "Curiosity, with no income claims or pressure." },
    ],
    practice: { persona: "a busy real estate agent who gets financing questions from buyers all the time and is a little curious about lending, but worried about the time it takes", opening: "Me, a loan officer? I barely have time for my listings. What would that even take?", tryTo: "Explain the licensing path honestly, ask what they'd want from it, and invite them to a follow-up conversation, with no income claims." },
  },
  {
    id: "l5",
    track: "licensing",
    n: 5,
    title: "Their first 90 days",
    minutes: 10,
    goal: "Set a new loan officer up to succeed.",
    learn: [
      { h: "Before licensing", points: ["A study schedule and a test date.", "Shadow a few of your client conversations (with the client's OK)."] },
      { h: "After sponsorship", points: ["The owner adds them on Team; they sign in and set up the phone code.", "They take Track 1 of this training and set their own numbers.", "They start with their own sphere and agent relationships, with you reviewing their first files."] },
      { h: "Stay close", points: ["A weekly check-in for the first 90 days.", "Celebrate the first application and the first closing."] },
    ],
    doThisWeek: ["Write a simple 90-day plan you'd give a new loan officer."],
    quiz: [
      { q: "What should a new loan officer do first after being sponsored?", options: ["Buy leads", "Sign in, set up security, take Track 1 and set their numbers", "Mass text their sphere"], answer: 1, explain: "Start with the system and their own relationships." },
    ],
  },
];

export const sessionById = (id: string) => SESSIONS.find((s) => s.id === id);
export const sessionsOf = (t: TrackId) => SESSIONS.filter((s) => s.track === t).sort((a, b) => a.n - b.n);

export const CREDIT = "Track 1 follows the principles The CORE Training (founded by Rick Ruby) describes publicly: systems, accountability and execution; goals and tracking your numbers; time blocking; the initial contact; and the close. The sessions are LoanM8's own material, not The CORE's curriculum. LoanM8 isn't affiliated with The CORE Training.";
