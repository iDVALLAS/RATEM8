/**
 * lib/content/lead-plan.ts — D86: the budget planner and 90-day roadmap (Option C) on Lead sources.
 *
 * Every figure these lines carry is worked out in code (lib/leads/plan.ts) from the loan officer's own scorecard.
 * Estimates are labeled "estimates" and come only from their own history, never from anyone else's numbers. No line
 * here ties a gift to a referral, suggests paying anyone for referrals, buying lists built from credit checks,
 * contacting anyone before they've said yes, or a rate (a test runs every line through the lead-advice rules).
 * The Business Finder's catalog shows no prices: a marketplace's cost comes from the loan officer's own spend.
 */

export const LEAD_PLAN = {
  title: "Your lead budget plan",
  back: "← Lead sources",
  /** Only loan officers plan spend (assistants see no spend). */
  assistant: "Lead plans use spend, which is private to each loan officer.",
  /** The saved plan, at the top of the planner. */
  saved: {
    title: "Your saved plan",
    line: (budget: string, day: number, of: number) => `${budget} a month · day ${day} of ${of}`,
    done: (budget: string, of: number) => `${budget} a month · all ${of} days done`,
    next: (when: string) => `Next check-in ${when}`,
    over: "Its 90 days are up. Saving now starts a new 90 days.",
    keeps: "Saving changes keeps today’s day count and steps; the version before is kept below.",
    history: (n: number) => `Earlier versions (${n})`,
    historyRow: (when: string, budget: string, why: string) => `${when}: ${budget} a month (${why})`,
    why: { saved: "you saved it", approved: "you approved a Business Manager move", checkin: "you approved a check-in" } as Record<string, string>,
  },
  budget: {
    title: "Monthly lead budget",
    presetsLabel: "Monthly lead budget presets",
    preset: (amount: string) => `${amount} a month`,
    custom: "Or your own amount a month ($)",
    use: "Use this amount",
    errors: { range: "Enter a monthly budget between $100 and $100,000." },
    target: "Target cost per loan ($)",
    saveTarget: "Save target",
    targetHelp: (amount: string) => `The split and the roadmap compare each source with your target, now ${amount}. It’s the same target as your scorecard.`,
    targetSaved: (amount: string) => `Target saved: ${amount} per loan.`,
  },
  split: {
    title: (budget: string) => `How your Concierge splits ${budget}`,
    barLabel: "The split, as a bar (the list below says the same)",
    pct: (n: number) => `${n}% of the budget`,
    leftOutTitle: "Not in the split",
    rulesTitle: "How the split is worked out",
    rules: (p: { sphereMin: string; sphereMax: string; spherePct: number; share: number; testFrom: string; testPct: number; testDays: number; rankLoans: number }) => [
      `Past clients & sphere first, with a small amount: ${p.spherePct}% of the budget, at least ${p.sphereMin} and at most ${p.sphereMax} (all of a smaller budget).`,
      `Paid sources ranked by cost per loan over the last 90 days; a source with fewer than ${p.rankLoans} loans is ranked by cost per lead you can call.`,
      `The best source is funded up to its share (${p.share}% of the budget), then the next, and so on.`,
      `From ${p.testFrom} a month, one test slot of up to ${p.testPct}% for a new source, capped for ${p.testDays} days.`,
      "Sources marked Pause? are left out.",
      `Sources marked Not enough data are capped as tests (up to ${p.testPct}% each).`,
      "Whatever no source can take stays in reserve. Whole dollars; the lines add up to the budget exactly.",
    ],
    /** The line under each part of the split. */
    why: {
      sphere: "Cards and campaigns to people who already know you.",
      bestLoan: (perLoan: string) => `Your best paid source so far: ${perLoan} per loan.`,
      loan: (perLoan: string, rank: number) => `${perLoan} per loan, ranked ${ordinal(rank)}.`,
      callable: (perCallable: string, rank: number) => `${perCallable} per lead you can call (fewer than 2 loans, so ranked by that), ${ordinal(rank)}.`,
      noCallable: (rank: number) => `No leads you can call yet, so it’s ranked ${ordinal(rank)}, last.`,
      capped: (pct: number) => `Capped at its share, ${pct}% of the budget.`,
      thin: (leads: number, days: number) => `Not enough data yet (${leads} ${leads === 1 ? "lead" : "leads"}), so it’s a test, capped for ${days} days.`,
      newTest: (days: number) => `For a source you don’t run yet, capped for ${days} days.`,
      suggests: (names: string) => `Your Business Finder suggests: ${names}.`,
      reserveNone: "No paid source on your scorecard can take it yet. Keep it until one earns it.",
      reserveCap: "Kept back: every source already has its share. Keep it, or test a new source.",
    },
    names: { sphere: "Past clients & sphere", newTest: "One new source to test", reserve: "Not assigned yet" },
    leftOut: {
      pause: (label: string, spend: string) => `${label}: Pause? (${spend} spent in the last 90 days, no loans closed or in progress).`,
      paused: (label: string, until: string) => `${label}: you paused it until ${until}.`,
      noSpend: (label: string) => `${label}: no spend logged, so it can’t be ranked. It keeps working at no cost to the plan.`,
      budget: (label: string) => `${label}: no room left in this budget.`,
    },
    /** What the planner does and doesn't do. */
    never: "Saving only stores your plan and adds its steps to Today. It never spends money, signs you up with a vendor or contacts anyone.",
    noSources: "Your scorecard has no paid sources yet, so the split starts with past clients & sphere and keeps the rest in reserve.",
  },
  estimate: {
    title: "Estimates",
    leads: "Leads a month",
    loans: "Loans a month",
    range: (lo: number, hi: number) => (lo === hi ? `About ${lo}` : `${lo}–${hi}`),
    /** Which of the loan officer's own periods the range comes from ("30d", "90d", "year"). */
    note: (periods: readonly string[]) => {
      const names = periods.map((p) => ({ "30d": "last 30 days", "90d": "last 90 days", year: "this year so far" })[p] ?? p);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "";
      return `Estimates from your own ${list}, at this split. Small numbers swing a lot, so the plan re-checks itself every 30 days.`;
    },
    none: "No estimate yet: your own leads, spend and loans fill this in. Your Concierge never uses someone else’s numbers.",
    leftOut: "The new-source test slot and the reserve aren’t in the estimate: they have no history of their own.",
  },
  roadmap: {
    title: "Your 90-day roadmap",
    intro: "Each step becomes a task in Lead plan steps on Today when its 30 days begin. Your Business Manager checks in every 30 days and proposes the next adjustment for you to approve.",
    phase: (from: number, to: number) => `Days ${from}–${to}`,
    phases: [
      { id: "free", name: "Free first" },
      { id: "test", name: "One paid test" },
      { id: "scale", name: "Scale or cut" },
    ],
    /** Step titles and the line under each (target in dollars where it's used). */
    steps: {
      sphere: { title: "Turn on past-client and sphere campaigns", why: "People who already know you can say yes to you directly. Start one on Campaigns." },
      wording: { title: "Ask every vendor for consent wording that names you", why: "A lead counts as permission only when the wording names you or your company. Use “Copy a note for your vendor”." },
      tag: { title: "Tag each lead dollar in Expenses with its source", why: "So your scorecard counts what each source really costs." },
      move: { title: "Move budget to the lowest cost per lead you can call", why: "Set each source’s monthly amount to match your plan on Lead sources." },
      cap: { title: "Cap the test, so it can’t overspend", why: "Set the new source’s monthly amount to its planned cap, and judge it after 60 days." },
      answer: { title: "Call new leads who named you the day they arrive", why: "Leads without wording that names you need their own yes first." },
      keep: { title: (target: string) => `Keep sources at or under your ${target} target cost per loan`, why: "Your scorecard shows each source’s cost per loan." },
      pause: { title: "Pause any source with no loans after 60 days", why: "Change or remove its monthly amount on Lead sources; nothing changes with the vendor for you." },
      rerun: { title: "Re-run this plan on real numbers", why: "Open the budget planner and save the next 90 days." },
    },
    /** On Home, each step's line starts with its phase. */
    stepWhy: (phase: string, why: string) => `${phase}. ${why}`,
  },
  catalog: {
    title: "Test a new source",
    intro: "When your budget has a test slot, your Business Finder suggests a source type from this list. Each comes with setup steps and how permission works.",
    suggested: "Suggested for your test slot",
    stepsTitle: "Set it up",
    permissionTitle: "Permission",
    rulesTitle: "Rules to follow",
    /** A marketplace's only cost line (no invented prices). */
    cost: "Cost comes from your own spend once you test it.",
    types: {
      "web-form-ads": {
        name: "Your own web form with search ads",
        what: "A short form on your own site, and search ads that bring people to it. Every lead comes through your own form.",
        steps: [
          "Put a short form on your own site with consent wording that names you or your company.",
          "Send the form to Lead sources: a Zapier step from the form to your connection address.",
          "Run search ads to the page with a capped monthly amount, and tag that spend “Your web form” in Expenses.",
        ],
        permission: "Your own form’s wording names you, so a person who agrees there can be called or texted under it. Keep the wording and the page address on file.",
        rules: "Mortgage ads are housing ads: use the ad platform’s housing-ad settings, which turn off targeting by age, gender, family status and ZIP code, and aim by place and interest in homes only. Show your NMLS ID and Equal Housing Opportunity as your sponsor requires.",
      },
      meta: {
        name: "Meta lead forms (Facebook and Instagram)",
        what: "A lead form ad on Facebook and Instagram. People fill it in without leaving the app.",
        steps: [
          "Make a lead form ad in Meta’s Ads Manager and choose the Special Ad Category for housing (mortgage ads count as housing ads).",
          "Put consent wording that names you or your company in the form’s custom disclaimer.",
          "Send the form’s leads to your connection address through Zapier, and tag the spend “Meta” in Expenses.",
        ],
        permission: "Only the form’s own wording counts, and it must name you or your company. Meta’s standard form text alone doesn’t.",
        rules: "With the Special Ad Category, Meta limits age, gender and location choices and turns off targeting by personal traits. Fair housing: never build an audience by who people are.",
      },
      "google-business": {
        name: "Google Business Profile and local search",
        what: "Your free profile on Google Search and Maps, so people nearby can find you and reach out.",
        steps: [
          "Claim your Google Business Profile with the name, NMLS ID and company your sponsor approves.",
          "Make your own web form the profile’s website, so inquiries come in with your consent wording.",
          "Ask past clients for an honest review; never offer anything for one.",
        ],
        permission: "Someone who calls or messages you from your profile reached out to you. Texting them later still needs their own yes.",
        rules: "Keep the profile’s name and details the same as your license and your sponsor’s rules.",
      },
      "open-houses": {
        name: "Open houses with listing agents",
        what: "Answer financing questions at a listing agent’s open house. Nothing of value changes hands either way.",
        steps: [
          "Offer to answer financing questions at a listing agent’s open house.",
          "Bring your own sign-in sheet with consent wording that names you, so visitors can choose to hear from you.",
          "Add the visitors who said yes as contacts, with where you met them.",
        ],
        permission: "Only visitors who sign your sheet’s wording naming you can be called or texted by you. The agent’s own sign-in sheet isn’t permission for you.",
        rules: "Nothing of value is exchanged: you don’t pay for the event, a spot or the agent’s costs, and the agent gets nothing from you for having you there. Any shared marketing needs a written fair-market-value agreement your sponsor sets up.",
      },
      "sphere-campaigns": {
        name: "Past-client and sphere campaigns",
        what: "Check-ins, cards and video messages to people who already know you.",
        steps: [
          "Start a campaign on Campaigns for past clients: a check-in, a home-value note and a holiday card.",
          "Send cards by mail from Cards to people who already know you.",
          "Tag that spend “Past clients & sphere” in Expenses.",
        ],
        permission: "Many past clients already gave you permission; anyone who hasn’t needs their own yes before a text. Every message goes through your contact rules.",
        rules: "Closing gifts and cards are fine on their own. Never tie one to someone sending you business.",
      },
      marketplaces: {
        name: "Vendor marketplaces (Zillow, LendingTree, Bankrate, LowerMyBills)",
        what: "Leads from people who filled in a vendor’s form, sent to you as they arrive.",
        steps: [
          "Before you sign up, ask for the vendor’s consent wording and whether it names you or only “partners.”",
          "Connect the vendor to your connection address, so each lead arrives with its wording.",
          "Set its monthly amount on Lead sources and judge it after 60 days on cost per loan.",
        ],
        permission: "A marketplace lead counts as permission only when that lead’s wording names you or your company.",
        rules: "Buy only leads from forms the person filled in themselves, never lists built from credit checks.",
      },
    } as Record<string, { name: string; what: string; steps: string[]; permission: string; rules: string }>,
  },
  save: {
    button: "Save as my 90-day plan",
    saved: "Saved. Your lead plan starts today; its first steps are on Today.",
    changed: "Saved. Your lead plan keeps its day count; the version before is kept in its history.",
    restarted: "Saved. A new 90 days starts today; the plan before is kept in its history.",
    errors: { range: "Enter a monthly budget between $100 and $100,000.", assistant: "Lead plans use spend, which is private to each loan officer." },
    ask: "Ask your Concierge to change it",
    guardrails: ["No trigger leads", "Nothing of value for referrals (RESPA)", "You approve every dollar"],
    guardLabel: "What your plan never does",
  },
  /** The Business Manager's 30-day check-ins (proposed through the scorecard's banner, Approve or Not now). */
  checkin: {
    update: (day: number) => `Day ${day} check-in: update your lead plan`,
    keep: (day: number) => `Day ${day} check-in: keep your lead plan as it is`,
    change: (label: string, from: string, to: string) => `${label} from ${from} to ${to}`,
    whyChange: (changes: string) => `Your scorecard for the last 90 days moves ${changes}.`,
    whySame: "Your scorecard for the last 90 days points to the same split.",
    end: "Your 90 days are up: open the budget planner to save the next plan.",
  },
  /** Steps an approval adds (Business Manager steps on Today). */
  approved: {
    setAmount: (label: string, to: string) => `Set ${label}’s monthly amount to ${to}`,
    setAmountWhy: (from: string, to: string) => `Your lead plan now gives it ${to} a month (it was ${from}). Change its monthly amount on Lead sources yourself.`,
    pauseWhy: "Approved from your Business Manager. Change or remove its monthly amount on Lead sources; nothing changes with the vendor for you.",
    fixWhy: "Approved from your Business Manager. Use “Copy a note for your vendor” on Lead sources.",
    done: (steps: number, plan: boolean) => `Approved. ${plan ? "Your lead plan is updated" : "No lead plan is saved, so only steps were added"}${steps ? `, and ${steps} ${steps === 1 ? "step is" : "steps are"} on Today.` : "; nothing else changed."}`,
    gone: "That suggestion isn’t waiting any more.",
    held: "Compliance held that suggestion, so it can’t be approved.",
  },
};

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}
