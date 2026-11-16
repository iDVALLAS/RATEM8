/**
 * lib/prompts/m8-owner.ts — the owner's instructions for M8 (C19), added
 * after the production prompt (m8-system.ts, unchanged) on every chat.
 * SERVER-ONLY.
 *
 *  - OWNER_RULES: standing rules from the owner's review of a real test
 *    conversation (2026-11-16): no emoji, honest handoffs, the boxes.
 *  - The owner's training notes, typed on /mlo/training and saved in the
 *    pricing store's settings row TRAINING_SETTINGS_ID.
 *
 * The production prompt's rules win over anything here.
 */
import { getStore } from "@/lib/pricing/store";
import { CALL_HOURS, inCallHours, pacificNow } from "@/lib/call-hours";

export const TRAINING_SETTINGS_ID = "site-training";
export const TRAINING_MAX_CHARS = 12_000;

export const OWNER_RULES = `

OWNER'S INSTRUCTIONS (added by the owner; the rules above still win)
- Never use emoji, emoticons or stage directions like *smiles*. Replies may be read aloud.
- Connecting to the loan officer: you can connect the borrower to their licensed loan officer right now. When they want to talk to a person, call show_options with call_loan_officer (add book_time if they'd rather schedule). During call hours (${CALL_HOURS.label}) that shows a box that calls the loan officer directly; outside them, a box where they leave their number for a call back, plus a booking link. Then point to "the box below". Never describe buttons you didn't show this way.
- Never say the loan officer has been notified, will reach out, or will call unless the borrower gave a phone number or email and the request was sent. request_handoff alone doesn't give the loan officer a way to reach anyone.
- Don't promise a priced example before get_pricing returns one. Say you'll check whether today's examples cover their scenario; if none does, say so plainly and offer the box to reach the loan officer.
- Before a tool call, say at most one short sentence, and don't announce a result you don't have yet.
- When the borrower's question seems cut off or garbled (they may be speaking), ask them to finish it in one short sentence.`;

let cached: { text: string; at: number } | null = null;

export async function ownerTraining(): Promise<string> {
  if (cached && Date.now() - cached.at < 60_000) return cached.text;
  let text = "";
  try {
    text = (await getStore().latestSettings(TRAINING_SETTINGS_ID))?.trainingText?.trim() ?? "";
  } catch {
    // Store unreachable: the standing rules still apply.
  }
  cached = { text, at: Date.now() };
  return text;
}

export async function saveTraining(text: string, actor: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (t.length > TRAINING_MAX_CHARS) return { ok: false, error: `Keep it under ${TRAINING_MAX_CHARS.toLocaleString("en-US")} characters.` };
  const store = getStore();
  if (!store.writable) return { ok: false, error: store.reason ?? "Settings storage is read-only." };
  await store.putSettings({ tenantId: TRAINING_SETTINGS_ID, activeLenderKeys: [], playbook: [], trainingText: t, updatedBy: actor, updatedAt: new Date().toISOString() });
  cached = { text: t, at: Date.now() };
  return { ok: true };
}

/** Everything appended to the system prompt for one request. */
export async function ownerAddendum(now = new Date()): Promise<string> {
  const training = await ownerTraining();
  const clock = `\n- Right now it's ${pacificNow(now)} Pacific, so calls are ${inCallHours(now) ? "open" : "closed"}.`;
  return OWNER_RULES + clock + (training ? `\n\nOWNER'S TRAINING NOTES\n${training}` : "");
}
