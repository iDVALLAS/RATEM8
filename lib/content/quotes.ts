/**
 * lib/content/quotes.ts — strings for personal estimates (v37, L4):
 * M8 quote mode, the estimate page, and the emails. ⚖ Counsel reviews the
 * disclaimer (owner's wording, 2026-10-31) before PERSONAL_QUOTES is on in
 * production.
 */
export const ESTIMATE_DISCLAIMER =
  "This is not an offer or commitment to lend. It is estimated pricing for the scenario you gave in your LoanM8 session, priced and approved by {name}, NMLS #{nmls}, on {when}.";

export const quotesCopy = {
  flow: {
    intro: "I'll ask a few quick questions so your loan officer can price your exact scenario. No Social Security number, no address, and no credit pull. A licensed loan officer prices it and approves it before it reaches you.",
    back: "Back",
    other: "Type an amount",
    send: "Send to my loan officer",
    change: "Change something",
    sending: "Sending…",
    summaryLead: "Here's what I'll send to your loan officer:",
    emailPrompt: "Where should your estimate go?",
    emailPlaceholder: "you@email.com",
    consent: "Email me this estimate. It's not an application, and nothing is shared with anyone else.",
    needConsent: "Tick the box so we can email your estimate.",
    badEmail: "Check the email address.",
    doneLead: "Got it. Your request is {id}.",
    doneBody: "A licensed loan officer prices your exact numbers and approves them. You'll get an email when your estimate is ready. It will also be at this link:",
    nearestLead: "Closest scenario priced this week:",
    nearestNone: "This week's pricing isn't posted yet, so there's no close scenario to show. Your own estimate is on its way.",
    nearestNote: "That's the published scenario as priced, not adjusted to your numbers.",
    failed: "That didn't send. Nothing was saved. Try again in a moment, or talk to your loan officer.",
    unlicensed: "LoanM8 can only price homes in {states} right now. That ZIP is outside them.",
    off: "Personal estimates aren't open yet.",
  },
  questions: {
    purpose: "Are you buying or refinancing?",
    loanType: "What kind of loan? \"Not sure\" is fine.",
    term: "30-year or 15-year fixed?",
    price: "What's the purchase price?",
    value: "Roughly what's the home worth?",
    down: "How much are you putting down?",
    balance: "What's left on your current mortgage?",
    cashOut: "How much cash do you want to take out?",
    creditBand: "Your credit score range? Your best guess is fine.",
    zip: "What's the property's ZIP code?",
    propertyType: "What type of property?",
    occupancy: "How will you use it?",
  },
  estimate: {
    title: "Your estimate",
    pending: "Your estimate isn't ready yet. A licensed loan officer is pricing it; you'll get an email when it's approved.",
    rejected: "Your loan officer couldn't price this scenario as sent. They may reach out, or you can book a call.",
    notFound: "We couldn't find that estimate. Check the link in your email.",
    noteLead: "A note from your loan officer",
    options: "Your three options",
    assumptions: "Rate assumptions",
    closing: "Estimated total closing costs: about {pct}% of the loan amount ({amount}), including third-party fees such as title and appraisal. Your Loan Estimate will itemize them.",
    lenderFees: "APR includes LoanM8's lender fees: underwriting {uw} and processing {proc}. The loan officer's compensation is paid by the lender.",
    book: "Book a call",
  },
  email: {
    alertSubject: "Quote {id} is waiting for your pricing",
    alertBody: "A new personal estimate request came in.\n\n{line}\n\nPrice and approve it here: {url}\n\nThe borrower's email is not included in this alert.",
    receivedSubject: "We got your LoanM8 estimate request ({id})",
    receivedBody: "Thanks. A licensed loan officer is pricing this scenario:\n\n{line}\n\nYour estimate will be here once it's approved:\n{url}\n\nNothing has been submitted as an application, and there's no credit pull.\n\n— LoanM8",
    readySubject: "Your LoanM8 estimate is ready ({id})",
    readyBody: "Your estimate for this scenario is ready:\n\n{line}\n\nSee your three options: {url}\n\n{disclaimer}\n\n— LoanM8",
  },
} as const;
