/**
 * lib/agents/practice.ts — the Coach's call practice (D54.1). M8 plays the
 * person; the loan officer practices; the Coach gives feedback. Same engine
 * as the CORE lessons' practice (lib/academy/service.ts practiceTurn).
 */
export type Scenario = { id: string; title: string; practice: { persona: string; opening: string; tryTo: string } };

export const COACH_SCENARIOS: Scenario[] = [
  {
    id: "coach-rate-shopper",
    title: "A rate shopper",
    practice: {
      persona: "a homebuyer getting quotes from three lenders, polite but short on time, who opens by asking for a number",
      opening: "I'm getting quotes from three lenders. So what's your rate?",
      tryTo: "Don't give a number on the spot. Explain that pricing depends on their scenario, ask the few questions you need, and offer a written Loan Estimate so they can compare fairly.",
    },
  },
  {
    id: "coach-new-lead",
    title: "A new web lead",
    practice: {
      persona: "someone who filled out a web form an hour ago and is wary of being sold to",
      opening: "Hi, yeah, I filled out a form. I'm just looking right now.",
      tryTo: "Lower the pressure, ask what started their search, explain the next steps simply, and book a short follow-up call. No approval or rate promises.",
    },
  },
  {
    id: "coach-past-client",
    title: "A past client",
    practice: {
      persona: "a friendly past client whose loan you closed three years ago, busy with work and kids' schedules",
      opening: "Oh hey! It's been a while. What's up?",
      tryTo: "Reconnect personally, ask about them and their home, offer help without pitching, and ask whether anyone they know is thinking about buying, with nothing offered in return.",
    },
  },
  {
    id: "coach-expired-listing",
    title: "A listing agent after an expired listing",
    practice: {
      persona: "a listing agent whose listing just expired after four months, a little frustrated and wary of lender calls",
      opening: "Yeah, it expired. The seller's not happy. Why are you calling me?",
      tryTo: "Acknowledge the frustration, offer something useful for a relist (financing options for buyers, help at an open house), ask for a short meeting, and offer nothing of value for referrals.",
    },
  },
];

export const scenarioById = (id: string) => COACH_SCENARIOS.find((s) => s.id === id) ?? null;
