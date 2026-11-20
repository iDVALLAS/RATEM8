/**
 * lib/content/command-center.ts — Command Center's own marketing lines.
 * The tagline is the owner's (2026-11-20); the pitch under it was agreed the
 * same day. Keep every claim true: "own" means their contacts, mailbox and
 * data stay theirs (D52 mailbox, D53.1 download). No earnings or ownership
 * (equity) claims: the membership credit is credit on their own membership.
 */
export const CC_TAGLINE = "Quit renting your CRM and start owning it.";
export const CC_PITCH = "Your contacts, your mailbox and your data stay yours, and you can download everything any time. Members pool their ad budget for marketing in their own area, and earn credit toward their membership for every loan officer they bring in.";

/**
 * The Concierge team on the sign-in and sign-up pitch (D54, D59). Every line
 * is what's built: the agents plan and draft from the loan officer's own
 * data, only playbooks they approved send on their own (through the contact
 * rules), and nothing spends money without their yes.
 */
export const CC_TEAM_TITLE = "A whole team working your business";
export const CC_TEAM_LINE = "Your Concierge team finds business, keeps every loan moving, builds your realtor partnerships, markets you, coaches you and runs your numbers, every day. Compliance checks every word first, and nothing goes out or gets spent unless you've said yes.";

/** D64 (owner chose layout B): the LOA's featured tile in the team grid. */
export const CC_LOA_TILE = {
  badge: "New",
  line: "Works every file from contract to close. Talk to it: it knows Fannie Mae, Freddie Mac and your lenders' overlays, and it reads the purchase agreement, title, approval and escrow fees for you.",
  steps: ["Contract", "Disclosures", "Title", "Approval", "Close"],
} as const;

/** The channels and tools, newest first. Only what's live; M8 calls stay off the pitch until they're turned on. */
export const CC_POINTS = [
  { icon: "video", text: "Video messages with captions. Every word checked, and you see who watched." },
  { icon: "phone", text: "Voicemail drops: record once, leave it for the people you choose." },
  { icon: "message", text: "Business texting registered for your company, number included." },
  { icon: "send", text: "Emails from your own Gmail or Microsoft 365, plus campaigns that follow up for you." },
  { icon: "mail", text: "Handwritten-style cards and holiday cards by mail, to one person or everyone." },
  { icon: "pipeline", text: "Every loan's journey and deadlines, synced from your loan system." },
  { icon: "shield", text: "Contact rules for all 50 states and DC, checked before anything goes out." },
  { icon: "receipt", text: "Expenses, mileage and profit, kept for your CPA." },
] as const;
