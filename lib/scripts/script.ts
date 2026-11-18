/**
 * lib/scripts/script.ts — a call script, the rules it must follow, and the
 * plain templates used without a model (D9). Pure and client-safe.
 *
 * A script is for the loan officer to read, not for anyone to send. Every
 * line still passes the same checks as the Concierge's drafts: no rate,
 * APR or payment (the loan officer prices first), no promises, no
 * pressure, nothing about protected traits. Lines that fail are dropped;
 * the compliance notes are written here in code, never by the model.
 */
import { guardReply } from "@/lib/m8/guard";
import { redactChatInput } from "@/lib/m8/redact";
import { protectedTopic } from "@/lib/concierge/guard";
import { checkDraft } from "@/lib/concierge/guard";
import { GOAL_LABELS, SERVICE_GOALS, type ScriptGoal, type Signal } from "./signals";

export type Objection = { they: string; you: string };

export type Script = {
  goal: ScriptGoal;
  title: string;
  /** Before you dial: what to have ready. */
  prep: string[];
  opener: string;
  /** Why you're calling, in one sentence you can say. */
  reason: string;
  questions: string[];
  /** Needs to listen for, and what each might lead to. */
  listenFor: string[];
  points: string[];
  objections: Objection[];
  /** The one next step to ask for. */
  close: string;
  voicemail: string;
  /** A text to send after the call, if they're reachable by text. */
  followUp: string;
  followUpPurpose: "service" | "marketing";
  /** Written in code. */
  compliance: string[];
  source: "model" | "template";
  /** How many lines the checks removed. */
  dropped: number;
};

/** The parts the model writes. */
export type ScriptDraft = Omit<Script, "goal" | "title" | "compliance" | "source" | "dropped" | "followUpPurpose">;

/** Pressure and claims a loan officer shouldn't read out (assembled so the copy check doesn't trip on this file). */
const PRESSURE = new RegExp(
  [
    "\\bact\\s+now\\b", "\\blimited\\s+time\\b", "\\bhurr(y|ies)\\b", "\\bdon'?t\\s+(wait|miss)\\b", "\\blast\\s+chance\\b", "\\bwon'?t\\s+last\\b",
    "\\brates?\\s+(are|is)\\s+(going|about\\s+to\\s+go|set\\s+to\\s+go)\\s+up\\b", "\\bbefore\\s+rates?\\s+(rise|go\\s+up|climb)\\b",
    "\\bguarante\\w*", "\\b(best|lowest)\\s+rates?\\b", "\\bbeat\\s+any\\b", "\\bno[- ]brainer\\b", "\\bsave\\s+(you\\s+)?\\$\\s?\\d", "\\bno[- ]cost\\b",
    "\\b(pre-?)?approved\\b(?!\\s+lender)", "\\bwill\\s+(definitely\\s+)?(qualify|close|save)\\b", "\\byou\\s+qualify\\b",
  ].join("|"),
  "i",
);
/** A payment amount ("$1,850 a month") or a monthly saving. */
const PAYMENT = /\$\s?\d[\d,]*(\.\d+)?\s*(\/|a|per)\s*(mo|month)/i;

/** Checks one line a loan officer might read aloud. */
export function checkLine(raw: string): { ok: true; text: string } | { ok: false; reason: string } {
  const text = redactChatInput(String(raw ?? "").trim()).text.replace(/\s+/g, " ").slice(0, 600);
  if (!text) return { ok: false, reason: "empty" };
  const topic = protectedTopic(text);
  if (topic) return { ok: false, reason: `touches ${topic}` };
  // The loan officer can promise to price (pricingLive = true), but no rate may appear.
  const g = guardReply(text, new Set(), new Set(), false, true);
  if (!g.ok) return { ok: false, reason: g.reason };
  if (PRESSURE.test(text)) return { ok: false, reason: "pressure or a promise" };
  if (PAYMENT.test(text)) return { ok: false, reason: "a payment amount" };
  return { ok: true, text };
}

const FIELD_MAX = { prep: 5, questions: 7, listenFor: 6, points: 6, objections: 4 } as const;

/** Runs every line through the checks. Single lines that fail fall back to the template's line. */
export function cleanScript(d: ScriptDraft, fallback: ScriptDraft): { script: ScriptDraft; dropped: number; reasons: string[] } {
  let dropped = 0;
  const reasons: string[] = [];
  const one = (v: string, fb: string) => {
    const r = checkLine(v);
    if (r.ok) return r.text;
    dropped++;
    reasons.push(r.reason);
    return fb;
  };
  const many = (vs: string[], max: number, fb: string[]) => {
    const kept = (Array.isArray(vs) ? vs : []).flatMap((v) => {
      const r = checkLine(v);
      if (r.ok) return [r.text];
      dropped++;
      reasons.push(r.reason);
      return [];
    });
    return (kept.length ? kept : fb).slice(0, max);
  };
  const objections = (Array.isArray(d.objections) ? d.objections : []).flatMap((o) => {
    const a = checkLine(o?.they ?? "");
    const b = checkLine(o?.you ?? "");
    if (a.ok && b.ok) return [{ they: a.text, you: b.text }];
    dropped++;
    reasons.push(!a.ok ? a.reason : !b.ok ? b.reason : "");
    return [];
  });
  const fu = checkDraft(d.followUp ?? "");
  const fuLine = fu.ok ? checkLine(fu.text) : fu;
  if (!fuLine.ok) {
    dropped++;
    reasons.push(fuLine.reason);
  }
  return {
    script: {
      prep: many(d.prep, FIELD_MAX.prep, fallback.prep),
      opener: one(d.opener, fallback.opener),
      reason: one(d.reason, fallback.reason),
      questions: many(d.questions, FIELD_MAX.questions, fallback.questions),
      listenFor: many(d.listenFor, FIELD_MAX.listenFor, fallback.listenFor),
      points: many(d.points, FIELD_MAX.points, fallback.points),
      objections: (objections.length ? objections : fallback.objections).slice(0, FIELD_MAX.objections),
      close: one(d.close, fallback.close),
      voicemail: one(d.voicemail, fallback.voicemail),
      followUp: fuLine.ok ? fuLine.text.slice(0, 320) : fallback.followUp,
    },
    dropped,
    reasons,
  };
}

/** What the compliance notes depend on. */
export type ComplianceInput = { goal: ScriptGoal; stateName: string | null; allPartyRecording: boolean; callAllowed: { ok: boolean; reason: string | null }; textAllowed: { ok: boolean; reason: string | null } };

/** Written in code, always shown, never by the model. */
export function complianceNotes(x: ComplianceInput): string[] {
  const out: string[] = [];
  if (!x.callAllowed.ok) out.push(`Don't call right now: ${(x.callAllowed.reason ?? "your contact rules don't allow it").replace(/\.$/, "")}.`);
  out.push("Don't quote or estimate a rate, APR or payment on this call. If they ask, say you'll price their actual scenario and follow up with the numbers in writing.");
  out.push(x.allPartyRecording ? `${x.stateName ?? "Their state"} requires everyone's consent to record a call. Ask first, or don't record.` : "If you record the call, tell them at the start.");
  out.push("Let them bring up their personal life. Don't steer toward family, marriage, health, age or retirement, religion or national origin, and never base an offer on any of it.");
  out.push("If they ask you not to contact them, mark it on their page under Permission right after the call.");
  if (x.goal === "equity") out.push("A home equity line or cash-out is new debt secured by their home, with costs. Give them the trade-offs and alternatives, not a push.");
  if (x.goal === "refi_review" || x.goal === "arm_reset" || x.goal === "mortgage_insurance") out.push("Price their real scenario first (balance, value, credit). Talk about total costs and how long it takes to break even, not only the rate.");
  if (x.goal === "referral") out.push("Don't offer gifts, payments or discounts for introductions (RESPA Section 8; counsel to confirm). A thank-you is fine.");
  if (x.goal === "loan_status") out.push("Share only what's in their loan file. Don't promise a closing date, an approval or a rate.");
  if (x.goal === "permission") out.push("Record their answer on their page with how they said it (for example, \"said yes on a call, date and time\"). A yes on an unrecorded call is your word, not proof, for marketing texts.");
  if (x.goal === "partner") out.push("Keep it about working together on clients. Nothing of value for referrals, and no use of production data from RETR or similar services in this script.");
  if (!x.textAllowed.ok) out.push(`The follow-up text can't go out yet: ${(x.textAllowed.reason ?? "no permission on file").replace(/\.$/, "")}. Ask on the call how they'd like to hear from you.`);
  return out;
}

/** Plain scripts, used without a model and as the fallback for any line the checks remove. */
export function templateScript(goal: ScriptGoal, first: string, signals: Signal[], me = ""): ScriptDraft {
  const name = first || "there";
  const who = me || "your loan officer";
  const why = signals.find((s) => s.goal === goal)?.why ?? "";
  const base: ScriptDraft = {
    prep: ["Open their page: last conversation, what your Concierge remembers, permission.", ...(why ? [why] : [])],
    opener: `Hi ${name}, it's ${who}. Do you have a couple of minutes?`,
    reason: "I'm calling to check in and see how everything's going with the house.",
    questions: ["How's everything going with the home?", "Anything coming up this year I can help you think through?", "What's the best way to keep in touch: calls, texts or email?"],
    listenFor: ["Projects, repairs or debt they want to deal with: equity options may help.", "A move, a second property or a rental: a purchase conversation.", "Insurance or tax increases: review their escrow and options."],
    points: ["You're their loan officer for the life of the loan, not only the closing.", "You can review their options any time, with no obligation."],
    objections: [
      { they: "We're all set, thanks.", you: "That's great to hear. I'll check in now and then; if anything changes, I'm a call away." },
      { they: "Is this a sales call?", you: "No, just a check-in. If you ever want me to look at your options, I'm happy to." },
    ],
    close: "Would it be all right if I checked in again in a few months?",
    voicemail: `Hi ${name}, it's ${who}, just checking in on how things are going with the house. No need to call back unless you'd like to. Talk soon.`,
    followUp: `Hi ${name}, it's ${who}. Good to catch up. If anything comes up with the house, I'm here.`,
  };
  const set = (p: Partial<ScriptDraft>): ScriptDraft => ({ ...base, ...p });
  switch (goal) {
    case "reply":
      return set({ reason: "I saw your message and wanted to call and answer it properly.", questions: ["Can you tell me a bit more about what you're looking for?", "What timing are you thinking about?", "Is there anything that's worrying you about it?"], close: "Let me put that together and follow up. What's the best way to send it?", voicemail: `Hi ${name}, it's ${who}. I got your message and want to answer it properly. Call or text me back when it suits you.`, followUp: `Hi ${name}, I tried calling about your message. When's a good time to talk?` });
    case "loan_status":
      return set({ prep: ["Open the loan in Pipeline: the current milestone, conditions and key dates.", ...(why ? [why] : []), "Know what's next and who owes what before you dial."], reason: "I'm calling with an update on your loan and what happens next.", questions: ["Have you had any questions since we last talked?", "Has anything changed: your job, your accounts, any new credit?", "Is there anything you're waiting on from us?"], listenFor: ["New credit, a job change or large deposits: these can affect the file; tell processing.", "Worry about timing: walk them through the next steps and who's doing what.", "Questions about closing costs or cash to close: point to their Loan Estimate or Closing Disclosure."], points: ["Here's where the loan is and the next step.", "Please don't open new credit or move large sums until after closing.", "Call me any time something changes."], objections: [{ they: "Why is this taking so long?", you: "I understand. Here's exactly where it is and what we're waiting on; I'll update you as soon as it moves." }], close: "I'll update you when the next step is done. Is this number still the best way to reach you?", voicemail: `Hi ${name}, it's ${who} with a quick update on your loan. Give me a call back when you can.`, followUp: `Hi ${name}, I tried calling with a quick update on your loan. Call me back when you have a minute.` });
    case "anniversary":
      return set({ opener: `Hi ${name}, it's ${who}. I noticed it's almost your home anniversary, and I wanted to say congratulations.`, reason: "Calling to say happy home anniversary and see how the house is treating you.", questions: ["How's the house treating you?", "Any projects you've done or are planning?", "Anything about your plans for the home that's changed?"], close: "I'll check in again next year, and you know where to find me before then.", voicemail: `Hi ${name}, it's ${who}. Happy home anniversary! Hope the house is treating you well. No need to call back.`, followUp: `Hi ${name}, happy home anniversary! Hope the house is treating you well.` });
    case "refi_review":
      return set({ prep: ["Price their actual scenario first: current balance, estimated value, credit.", "Work out total costs and the months to break even.", ...(why ? [why] : [])], reason: "I've been reviewing loans like yours, and yours may be worth a closer look. I'd like to see if it makes sense for you.", questions: ["How long are you planning to stay in the home?", "Do you know roughly what you owe on it today?", "What matters most to you: a lower payment, paying it off sooner, or something else?"], listenFor: ["Plans to move soon: the break-even may not work.", "Debt they'd like to roll in: talk about the trade-offs.", "Cash for a project: compare a cash-out with a home equity line."], points: ["You'll look at the full cost, not only the rate.", "If the numbers don't work, you'll say so.", "No obligation, and nothing happens without their go-ahead."], objections: [{ they: "We just want to wait and see.", you: "That's fine. I'll watch it for you and only call if the numbers really make sense." }, { they: "Refinancing costs too much.", you: "It can. That's why I'd show you the total cost and how long it takes to pay off before you decide anything." }], close: "Could I pull a few details and get back to you with a side-by-side?", voicemail: `Hi ${name}, it's ${who}. I've been looking at loans like yours and want to see if yours is worth a closer look. Call me back when it's convenient.`, followUp: `Hi ${name}, it's ${who}. I'd like to review your loan with you. When's a good time for a quick call?` });
    case "arm_reset":
      return set({ prep: ["Check their note: when the first change is, the index, margin and caps.", "Price a fixed-rate option so you can compare.", ...(why ? [why] : [])], reason: "Your loan has an adjustable rate, and its first adjustment is coming up. I want to make sure you know what to expect and what your options are.", questions: ["Did you know when your rate is set to change?", "Are you planning to stay in the home for a while?", "Would a payment that can't change matter to you?"], points: ["Here's how their rate can change, and the caps that limit it.", "Options: keep the loan, refinance to a fixed rate, or make extra payments. You'll show the costs of each.", "No decision needed today."], objections: [{ they: "I'll deal with it when it happens.", you: "Of course. I'd still like to show you the numbers ahead of time so there are no surprises." }], close: "Can I put together a comparison of your options and walk you through it?", voicemail: `Hi ${name}, it's ${who}. Your loan's rate is set to adjust soon, and I'd like to walk you through what that means. Call me back when you can.`, followUp: `Hi ${name}, your loan's rate is set to adjust soon. Want me to walk you through your options?` });
    case "mortgage_insurance":
      return set({ prep: ["Check their loan type, original value and current balance.", ...(why ? [why] : []), "For conventional loans, know the servicer's removal process and whether an appraisal is needed."], reason: "I wanted to see whether the mortgage insurance on your loan could come off. It's something people often don't know they can ask about.", questions: ["Do you know if you're still paying mortgage insurance?", "Have you made improvements or extra payments since you bought?", "How long are you planning to stay in the home?"], points: ["On conventional loans, they can usually ask the servicer to remove it once the balance reaches 80% of the original value, and it ends on its own at 78% on schedule.", "On FHA loans it often stays, and a conventional refinance may remove it if they qualify; you'd compare the costs.", "You'll help either way, even if it's just a call to their servicer."], close: "Would you like me to look into it and tell you what I find?", voicemail: `Hi ${name}, it's ${who}. I wanted to check whether the mortgage insurance on your loan could come off. Call me back when it's convenient.`, followUp: `Hi ${name}, I'd like to check whether your mortgage insurance could come off. Want me to look into it?` });
    case "equity":
      return set({ reason: "I'm checking in on the house and any plans you have for it.", questions: ["Any projects you're thinking about: a remodel, repairs, anything big?", "How are you planning to pay for them?", "Is there other debt you'd like to get a handle on?"], listenFor: ["A project with a cost estimate: compare a home equity line, a cash-out refinance and paying cash.", "High-interest debt: talk about the trade-offs of using the home to pay it.", "No plans: that's fine; just stay in touch."], points: ["Using home equity has costs and puts the home on the line; you'll lay out the trade-offs.", "There may be better options than borrowing against the home, and you'll say so."], objections: [{ they: "We don't want more debt.", you: "That makes sense. I'm not suggesting any; I just want you to know your options if a project comes up." }], close: "If you get a quote for the project, would you like me to show you a few ways to pay for it?", voicemail: `Hi ${name}, it's ${who}, checking in on the house and any plans you have for it. Call me back if you'd like to talk.`, followUp: `Hi ${name}, it's ${who}. If you're planning any projects for the house, I'm happy to walk you through options.` });
    case "next_home":
      return set({ reason: "I remembered you'd mentioned thinking about your next move, and I wanted to see how that's going.", questions: ["Where are you at with the move: just thinking, or starting to look?", "Would you keep or sell your current home?", "What timing are you thinking about?"], listenFor: ["Selling first or buying first: talk about how each works.", "Keeping the current home as a rental: an investment property conversation.", "An agent they're already working with, or none yet."], points: ["You can look at what they'd qualify for before they start looking.", "You'll coordinate with their agent and keep things on schedule."], objections: [{ they: "We're not ready yet.", you: "No rush at all. When you are, a quick look at the numbers helps you plan. I'll check back in a few months." }], close: "Would it help to sit down and go over the numbers so you can plan?", voicemail: `Hi ${name}, it's ${who}. You'd mentioned thinking about a move, and I wanted to see how it's going. Call me back when it's convenient.`, followUp: `Hi ${name}, it's ${who}. Happy to help you plan the numbers for your next move whenever you're ready.` });
    case "referral":
      return set({ reason: "I'm checking in, and I also wanted to thank you for trusting me with your loan.", questions: ["How's everything with the house?", "Do you know anyone who's thinking about buying or refinancing this year?", "Would it be all right if I mentioned you sent them?"], points: ["You'll treat anyone they introduce the same way you treated them.", "There's no pressure: an introduction is a favor, not an obligation."], close: "If anyone comes to mind, feel free to pass along my number.", voicemail: `Hi ${name}, it's ${who}, checking in and saying thanks again. Hope all is well.`, followUp: `Hi ${name}, it was good to catch up. Thanks again for trusting me with your loan.` });
    case "permission":
      return set({ reason: "I'd like to keep you posted now and then, and I want to do it the way you'd prefer.", questions: ["Is it all right if I text you now and then about your loan or helpful updates?", "Would you rather hear from me by email, or only by phone?", "Is this the best number for you?"], points: ["You'll only reach out the way they choose.", "They can tell you to stop any time, and you'll respect it."], objections: [{ they: "Just call me if something comes up.", you: "Will do. I'll only call when there's a real reason." }], close: "Thanks. I'll note that so I reach you the way you prefer.", voicemail: `Hi ${name}, it's ${who}. I'd like to know the best way to keep you posted. Call me back when it's convenient.`, followUp: `Hi ${name}, thanks for talking. You can reply STOP any time and I won't text again.` });
    case "re_engage":
      return set({ opener: `Hi ${name}, it's ${who}, the loan officer you spoke with a while back. Do you have a minute?`, reason: "We talked a while ago about a home loan, and I wanted to see where things stand.", questions: ["Are you still thinking about buying or refinancing?", "Has anything changed since we last talked?", "What would be most helpful right now?"], listenFor: ["Still looking: offer to review the numbers again.", "Bought or refinanced elsewhere: congratulate them and stay in touch.", "Paused for a reason: note it and check back later."], close: "Would it help to go over your numbers again?", voicemail: `Hi ${name}, it's ${who}, the loan officer you spoke with a while back. I wanted to see where things stand. Call me back if it's helpful.`, followUp: `Hi ${name}, it's ${who}, the loan officer you spoke with a while back. If you're still thinking about a home loan, I'm happy to help.` });
    case "partner":
      return set({ prep: ["Know which clients you're working on together and where each one stands.", "Have one useful thing to offer: a status update, a market note, a co-hosted event idea."], opener: `Hi ${name}, it's ${who}. Got a minute?`, reason: "Checking in on the clients we're working on together and how I can make your deals easier.", questions: ["How are things going for you this season?", "Anything I could do better on the files we share?", "Any buyers who'd like a review of their numbers?"], listenFor: ["Frustration with a past lender: ask what went wrong and how you'd handle it.", "Buyers who aren't pre-qualified yet: offer to help."], points: ["You keep their clients updated at every step.", "You're reachable when deals get tight."], objections: [{ they: "I already have a lender I use.", you: "Totally fair. If you ever want a second option for a client, I'm here." }], close: "Can I send you a quick update on our shared files every week?", voicemail: `Hi ${name}, it's ${who}, checking in on the files we're working on together. Call me back when you can.`, followUp: `Hi ${name}, good to catch up. Let me know if any of your buyers want a review of their numbers.` });
    case "check_in":
    default:
      return base;
  }
}

/** A whole script from the template, with the code-written notes. */
export function assemble(goal: ScriptGoal, draft: ScriptDraft, comp: ComplianceInput, source: Script["source"], dropped: number): Script {
  return { goal, title: GOAL_LABELS[goal], ...draft, followUpPurpose: SERVICE_GOALS.includes(goal) ? "service" : "marketing", compliance: complianceNotes(comp), source, dropped };
}
