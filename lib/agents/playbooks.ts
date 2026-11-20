/**
 * lib/agents/playbooks.ts — messages the team may send on its own once the
 * loan officer approves them (D54). Each one is checked by Compliance
 * before it can be approved, and again before every send. Editing the text
 * (a new version) needs a new approval.
 *
 * Fields: {first} (their first name), {myFirst}, {myName}, {company}, {area}.
 * Purpose sets the permission the contact rules require.
 */
import { createHash } from "node:crypto";
import type { AgentKey } from "./team";

export const PLAYBOOK_FIELDS = ["first", "myFirst", "myName", "company", "area"] as const;

export type Playbook = {
  id: string;
  agent: AgentKey;
  label: string;
  when: string;
  channel: "text" | "email";
  to: "client" | "agent";
  purpose: "service" | "marketing";
  subject: string;
  body: string;
};

export const PLAYBOOKS: Playbook[] = [
  {
    id: "lead-first-touch",
    agent: "finder",
    label: "New lead: first hello",
    when: "A new web lead with permission on file and no reply from you yet.",
    channel: "text",
    to: "client",
    purpose: "marketing",
    subject: "",
    body: "Hi {first}, this is {myFirst} with {company}. Thanks for reaching out about a home loan. When's a good time for a quick call?",
  },
  {
    id: "anniversary-email",
    agent: "finder",
    label: "Home anniversary",
    when: "A past client's loan closed a year or more ago this week.",
    channel: "email",
    to: "client",
    purpose: "marketing",
    subject: "Happy home anniversary, {first}",
    body: "Hi {first},\n\nHappy home anniversary! I hope the past year in your home has been a good one.\n\nIf anything comes up with your home or your loan, I'm always glad to help.\n\n{myFirst}",
  },
  {
    id: "check-in-email",
    agent: "finder",
    label: "Past client check-in",
    when: "Someone with permission on file you haven't been in touch with for 90 days.",
    channel: "email",
    to: "client",
    purpose: "marketing",
    subject: "Checking in, {first}",
    body: "Hi {first},\n\nIt's been a while, so I wanted to check in and see how you're doing.\n\nIf you or anyone you know has questions about a home loan, I'm here to help.\n\n{myFirst}",
  },
  {
    id: "new-agent-welcome",
    agent: "partner",
    label: "Welcome a new agent",
    when: "An agent you added from a new-agent list.",
    channel: "email",
    to: "agent",
    purpose: "marketing",
    subject: "Welcome to the business, {first}",
    body: "Hi {first},\n\nCongratulations on your license and welcome to {area} real estate. I'm {myName}, a loan officer with {company}.\n\nIf it would help, I'm happy to walk you through how financing works for your first buyers, from pre-approval to closing. Would you be open to a short coffee meeting?\n\n{myFirst}",
  },
  {
    id: "listing-agent-intro",
    agent: "partner",
    label: "Listing agent: canceled or expired listing",
    when: "An agent whose listing canceled or expired, from a list you added.",
    channel: "email",
    to: "agent",
    purpose: "marketing",
    subject: "A thought on your listing, {first}",
    body: "Hi {first},\n\nI'm {myName}, a loan officer with {company}. I work with agents in {area} on financing for buyers, including programs that can widen the pool for a home that's been on the market a while.\n\nIf you relist, I'd be glad to walk your buyers through their financing options. Would a short call this week work?\n\n{myFirst}",
  },
];

export const playbookById = (id: string) => PLAYBOOKS.find((p) => p.id === id) ?? null;

/** Approval is tied to this exact text. */
export const playbookVersion = (p: Playbook) => createHash("sha256").update(`${p.channel}|${p.purpose}|${p.subject}|${p.body}`).digest("hex").slice(0, 16);

export function fillPlaybook(text: string, v: Record<string, string>): string {
  return text.replace(/\{([a-zA-Z]+)\}/g, (_m, k: string) => v[k] ?? `[${k}]`);
}
