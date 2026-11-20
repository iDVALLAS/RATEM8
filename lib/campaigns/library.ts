/**
 * lib/campaigns/library.ts — starter campaigns (D51). Client-safe.
 *
 * Each one is a sensible default to edit, not a script to follow. The
 * wording passes the same checks as templates: no rates, no promises, no
 * pressure, and nothing about who a home is for. Texts name the loan
 * officer and company in the first message.
 */
import type { CampaignKind, CampaignTrigger, StepChannel } from "./store";

/** The fields a campaign may fill in for each person. */
export const CAMPAIGN_FIELDS = ["first", "myFirst", "myName", "myPhone", "company", "bookingLink"] as const;
export const FIELD_LABELS: Record<(typeof CAMPAIGN_FIELDS)[number], string> = {
  first: "Their first name",
  myFirst: "Your first name",
  myName: "Your full name",
  myPhone: "Your phone",
  company: "Your company",
  bookingLink: "Your booking link",
};

export type StarterStep = { channel: StepChannel; waitDays: number; subject?: string; body: string };
export type Starter = { id: string; name: string; summary: string; kind: CampaignKind; purpose: "service" | "marketing"; trigger: CampaignTrigger; steps: StarterStep[] };

export const STARTERS: Starter[] = [
  {
    id: "new-lead",
    name: "New lead: the first two weeks",
    summary: "A quick hello by text and email, a reminder to call, then a few friendly follow-ups. Stops as soon as they reply.",
    kind: "followup",
    purpose: "marketing",
    trigger: "new_lead",
    steps: [
      { channel: "text", waitDays: 0, body: "Hi {first}, it's {myFirst} with {company}. I got your request about a home loan. What's a good time to talk today or tomorrow?" },
      { channel: "email", waitDays: 0, subject: "About your home loan question", body: "Hi {first},\n\nThanks for reaching out. I'm {myFirst}, a loan officer with {company}, and I'll be your point of contact.\n\nTo give you useful answers, it helps to know a little about your plans: are you buying or refinancing, and roughly when?\n\nJust reply to this email, or text me, whichever is easier.\n\n{myName}" },
      { channel: "task", waitDays: 1, body: "Call {first}. If there's no answer, send a short text saying you tried." },
      { channel: "text", waitDays: 2, body: "Hi {first}, {myFirst} again. Are you looking to buy or to refinance? Happy to answer questions right here by text." },
      { channel: "email", waitDays: 3, subject: "A few questions so I can help", body: "Hi {first},\n\nWhen you have a minute, these help me point you in the right direction:\n\n1. Buying or refinancing?\n2. Roughly when would you like to move forward?\n3. Is there anything you're unsure about?\n\nThere's no obligation. Reply whenever it suits you.\n\n{myName}" },
      { channel: "text", waitDays: 4, body: "Hi {first}, should I keep your file open? Reply here anytime and I'll pick it up from there." },
    ],
  },
  {
    id: "app-unfinished",
    name: "Application started, not finished",
    summary: "Gentle help for someone who started their application. About their loan, so it uses the permission they gave for their loan.",
    kind: "followup",
    purpose: "service",
    trigger: "manual",
    steps: [
      { channel: "text", waitDays: 0, body: "Hi {first}, it's {myFirst} with {company}. I saw your application is partway done. Want help with the rest? I can walk you through it by phone." },
      { channel: "email", waitDays: 2, subject: "Help finishing your application", body: "Hi {first},\n\nYour application is saved where you left off. If any question was unclear, reply with which one and I'll explain it, or we can go through the rest together on a short call.\n\n{myName}" },
      { channel: "task", waitDays: 2, body: "Call {first} about finishing their application." },
      { channel: "text", waitDays: 3, body: "Hi {first}, {myFirst} here. Just checking whether you'd like help with your application. Reply anytime." },
    ],
  },
  {
    id: "preapproved-shopping",
    name: "Pre-approved buyer: while they shop",
    summary: "A weekly check-in while they look at homes, so you hear about an accepted offer early.",
    kind: "nurture",
    purpose: "marketing",
    trigger: "manual",
    steps: [
      { channel: "text", waitDays: 0, body: "Hi {first}, it's {myFirst} with {company}. How's the home search going? If you find one you like, text me and I'll be ready to help." },
      { channel: "email", waitDays: 7, subject: "How the search is going", body: "Hi {first},\n\nChecking in on your home search. If anything has changed, like your price range, the area or your timing, let me know and I'll update your numbers so you're ready when you find the right place.\n\n{myName}" },
      { channel: "text", waitDays: 7, body: "Hi {first}, {myFirst} here. Seen anything you like this week? I'm here if you have questions." },
      { channel: "task", waitDays: 7, body: "Call {first} to see how their search is going and whether anything has changed." },
    ],
  },
  {
    id: "past-client",
    name: "Past client: stay in touch all year",
    summary: "A light touch every few months, so you're the first call when they or a friend need a loan. Keeps going after replies.",
    kind: "nurture",
    purpose: "marketing",
    trigger: "manual",
    steps: [
      { channel: "email", waitDays: 0, subject: "Checking in", body: "Hi {first},\n\nIt's {myFirst} from {company}. I hope the house is treating you well. If you ever have questions about your loan, your home's value or a project you're planning, I'm happy to help, even if it's just a quick question.\n\n{myName}" },
      { channel: "text", waitDays: 90, body: "Hi {first}, it's {myFirst} with {company}. Just checking in. Anything I can help with on your home or loan?" },
      { channel: "email", waitDays: 90, subject: "A yearly look at your loan", body: "Hi {first},\n\nOnce a year I offer past clients a short review of their loan and goals: whether your current loan still fits, what your options are, or just questions you've been saving up. No pressure either way.\n\nReply if you'd like to set one up.\n\n{myName}" },
      { channel: "task", waitDays: 90, body: "Call {first} to say hello and ask how things are going." },
      { channel: "email", waitDays: 90, subject: "Thinking of you", body: "Hi {first},\n\nIt's been about a year since we last caught up properly. If anyone you know is thinking about buying or refinancing, I'd be glad to help them the way I helped you.\n\n{myName}" },
    ],
  },
  {
    id: "agent-partner",
    name: "Agent partner: stay in touch",
    summary: "Useful check-ins with agents you work with. Nothing of value is offered for referrals (RESPA).",
    kind: "nurture",
    purpose: "marketing",
    trigger: "manual",
    steps: [
      { channel: "email", waitDays: 0, subject: "Helping your buyers", body: "Hi {first},\n\nIt's {myFirst} with {company}. If any of your buyers have financing questions, I'm glad to take a call with them and keep you posted on where things stand.\n\n{myName}" },
      { channel: "task", waitDays: 14, body: "Call {first} to ask what their buyers are running into with financing." },
      { channel: "email", waitDays: 30, subject: "Anything I can help with?", body: "Hi {first},\n\nChecking in. If a buyer needs a quick answer on financing, or you want a second look at a tricky file, send them my way or reply here.\n\n{myName}" },
      { channel: "text", waitDays: 30, body: "Hi {first}, it's {myFirst} with {company}. Anything I can help with for your buyers this month?" },
    ],
  },
];
