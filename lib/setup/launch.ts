/**
 * lib/setup/launch.ts — the Command Center launch checklist, in order (D32).
 * SERVER-ONLY (reads which Vercel variables are set; never their values).
 *
 * Every outside account and Vercel setting Command Center uses, in the
 * order to do them, with whether each variable is Sensitive. The same list
 * is written out in docs/COMMAND_CENTER_LAUNCH.md.
 */
import { BOOKING_ENV } from "@/lib/config";

export type EnvItem = { name: string; sensitive: boolean; note: string; optional?: boolean };
export type LaunchStep = { phase: number; title: string; detail: string; env?: EnvItem[]; outside?: string };

export const PHASES = ["Accounts", "Command Center settings in Vercel", "Texting", "Before you contact anyone", "Counsel", "Go live"] as const;

export const LAUNCH: LaunchStep[] = [
  // 1. Accounts
  { phase: 1, title: "Database (Neon)", detail: "Everything Command Center keeps lives here. Add it from Vercel → Storage, and the variable is set for you.", env: [{ name: "DATABASE_URL", sensitive: true, note: "Set by the Neon integration." }] },
  { phase: 1, title: "Rate limits (Upstash Redis)", detail: "Shared limits across servers. Add it from Vercel → Storage.", env: [{ name: "KV_REST_API_URL", sensitive: false, note: "Set by the integration." }, { name: "KV_REST_API_TOKEN", sensitive: true, note: "Set by the integration." }] },
  { phase: 1, title: "Email (Resend)", detail: "Sign-in links, the morning and weekly emails, alerts, and your emails to clients (sent in your name, with replies to your own inbox). Verify your sending domain in Resend first, with SPF, DKIM and DMARC.", env: [{ name: "RESEND_API_KEY", sensitive: true, note: "From Resend → API keys." }, { name: "LOANM8_FROM_EMAIL", sensitive: false, note: "The verified address mail comes from." }] },
  { phase: 1, title: "AI for Command Center (Anthropic)", detail: "Make a separate workspace in the Anthropic Console for Command Center, with its own monthly spend limit, and ask Anthropic for zero data retention on it (it handles client messages and notes). The public chat keeps its own key.", env: [{ name: "CC_ANTHROPIC_API_KEY", sensitive: true, note: "The Command Center workspace's key." }, { name: "ANTHROPIC_API_KEY", sensitive: true, note: "The public M8 chat's key (already set)." }] },
  { phase: 1, title: "Texting (Twilio)", detail: "Create the account; the Messaging Service comes in Texting, below.", env: [{ name: "TWILIO_ACCOUNT_SID", sensitive: false, note: "Twilio Console home." }, { name: "TWILIO_AUTH_TOKEN", sensitive: true, note: "Twilio Console home." }] },
  { phase: 1, title: "Do-not-call scrubbing", detail: "A National Do Not Call Registry subscription (SAN) for your area codes, or a DNC vendor that includes state lists such as Texas.", outside: "telemarketing.donotcall.gov, or your vendor" },
  { phase: 1, title: "Reassigned Numbers Database", detail: "Checks whether a number was disconnected since permission was given. Pay per query.", outside: "reassigned.us" },
  { phase: 1, title: "Voice and the mic (Google Cloud, optional)", detail: "M8 reads replies aloud and you can dictate call notes. Enable Text-to-Speech and Speech-to-Text on the key.", env: [{ name: "GOOGLE_CLOUD_API_KEY", sensitive: true, note: "Restrict it to those two APIs.", optional: true }] },
  { phase: 1, title: "Error alerts (Sentry, optional)", detail: "Failures in the morning run and elsewhere are reported here.", env: [{ name: "SENTRY_DSN", sensitive: true, note: "From the Sentry project.", optional: true }] },
  // 2. Command Center settings
  { phase: 2, title: "You, as owner", detail: "Your email becomes the owner account the first time you sign in at /sign-in.", env: [{ name: "MLO_OWNER_EMAIL", sensitive: false, note: "Your sign-in email." }] },
  { phase: 2, title: "The morning run", detail: "Runs the Concierge, recipes, the morning email and the Monday report each day (the schedule is already in vercel.json).", env: [{ name: "CRON_SECRET", sensitive: true, note: "Any long random value." }] },
  { phase: 2, title: "Client page links", detail: "Signs each client's private page link.", env: [{ name: "CC_LINK_SECRET", sensitive: true, note: "Any long random value. Changing it replaces every client link." }] },
  { phase: 2, title: "Your portal and booking links", detail: "Application and document texts point to your secure ARIVE borrower portal; clients book time with you.", env: [{ name: "APPLICATION_URL_MLO_001", sensitive: false, note: "Your ARIVE borrower portal (https)." }, { name: "APPLICATION_URL_MLO_002", sensitive: false, note: "Your team loan officer's (mlo-002).", optional: true }, { name: BOOKING_ENV["mlo-001"], sensitive: false, note: "Your booking link." }, { name: BOOKING_ENV["mlo-002"], sensitive: false, note: "Your team loan officer's (mlo-002) booking link.", optional: true }] },
  { phase: 2, title: "A code from your phone at sign-in", detail: "Turn it on for yourself at Sign-in security (an authenticator app, a minute to set up). When everyone on the team has it, require it for all. The Safeguards Rule asks for this wherever client files are reached.", env: [{ name: "CC_REQUIRE_MFA", sensitive: false, note: 'Set to "true" to require it for everyone.' }, { name: "CC_MFA_KEY", sensitive: true, note: "Any long random value; encrypts the phone keys (otherwise one derived from CC_LINK_SECRET).", optional: true }] },
  { phase: 2, title: "Retire the shared admin login", detail: "Once your own sign-in works, turn off the old shared login.", env: [{ name: "MLO_BASIC_AUTH", sensitive: false, note: 'Set to "false".' }] },
  { phase: 2, title: "AI plans and models (optional)", detail: "Each member's plan (Standard or Unlimited, set on Membership) picks the model for each feature and the monthly AI allowance (lib/config.ts AI_PLANS). Set the Anthropic workspace's own monthly spend limit as a backstop. Leave the override unset.", env: [{ name: "CC_CONCIERGE_MODEL", sensitive: false, note: "Overrides every feature's model (for testing only).", optional: true }] },
  // 3. Texting
  { phase: 3, title: "A Messaging Service for your sponsor", detail: "In Twilio, create one Messaging Service per sponsoring company. Set its incoming-message webhook to /api/twilio/inbound and its status callback to /api/twilio/status (exact addresses on Texting setup).", env: [{ name: "TWILIO_MESSAGING_SERVICE_SID_1761573", sensitive: false, note: "Home Trust Financial's service (or TWILIO_MESSAGING_SERVICE_SID while it's the only sponsor)." }] },
  { phase: 3, title: "Register the brand and the Customer Care campaign (10DLC)", detail: "Use the wording on Texting setup. Register Customer Care first; mortgage marketing campaigns are often refused, and a refusal is final.", outside: "Twilio Console → Messaging → Regulatory compliance" },
  { phase: 3, title: "The opt-out confirmation, before 2026-11-25", detail: "In the Messaging Service's Advanced Opt-Out, set the confirmation so it only confirms (no \"reply START\", no marketing). The exact wording is on Texting setup.", outside: "Twilio Console → Messaging Service → Opt-out management" },
  // 4. Before you contact anyone
  { phase: 4, title: "Connect your loan system", detail: "Pipeline → make a connection key, then add the Zapier step from ARIVE (instructions on the Pipeline page)." },
  { phase: 4, title: "Import your contacts", detail: "Contacts → Import. Mark where each list came from; lists from a previous employer stay on hold until you clear them." },
  { phase: 4, title: "Record the permission you already hold", detail: "Contacts → Record permission for past clients, with where the signed consent is." },
  { phase: 4, title: "Scrub do-not-call and reassigned numbers", detail: "Contacts → Record permission: copy each list, run it with your vendor and the FCC database, paste the results back." },
  { phase: 4, title: "Turn on your Concierge, automations and emails", detail: "Concierge: on, how you sound, the morning and weekly emails. Automations: the loan updates you want." },
  // 5. Counsel
  { phase: 5, title: "Questions for counsel", detail: "The client-page opt-in wording; whether AI-drafted texts need a disclosure; the Connecticut existing-customer reading; the RESPA wording on asking for introductions; how long call notes and Concierge notes are kept; adding the client page and the Concierge to the privacy notice." },
  { phase: 5, title: "State switches (only after counsel clears them)", detail: "Each stays closed until set to exactly \"true\".", env: [{ name: "GATE_TX_302_CLEARED", sensitive: false, note: "Texas sales calls and texts (ch. 302).", optional: true }, { name: "GATE_AZ_PHONE_CLEARED", sensitive: false, note: "Arizona sales calls and texts.", optional: true }, { name: "GATE_CA_AI_VOICE_CLEARED", sensitive: false, note: "M8 AI-voice calls to California.", optional: true }] },
  { phase: 5, title: "Membership plan (only after counsel clears it)", detail: "Recruiting credit (10%, 15% after a year, one level, credit on the recruiter's own membership, never from loans) is tracked and held until this is on. Ask counsel about the plan, the co-op budget and whether the plan needs any securities or franchise filing.", env: [{ name: "RECRUIT_REWARDS", sensitive: false, note: 'Set to "true" once approved.', optional: true }] },
  { phase: 5, title: "Production share (only after counsel and the sponsor approve it)", detail: "The NEXA-style share (10 basis points of recruits' closed loan amounts, three levels down, vested after three years; from lib/config.ts) is tracked until this is on. The sponsoring company pays it through its written compensation plan; ask counsel about Reg Z loan originator pay (12 CFR 1026.36(d)), state rules for any levels beyond the first, and how agents who get licensed are paid on their own deals.", env: [{ name: "PRODUCTION_OVERRIDE", sensitive: false, note: 'Set to "true" once approved.', optional: true }] },
  // 6. Go live
  { phase: 6, title: "Open the site", detail: "When the public site is ready: lift the tester password and stealth, and turn on loan officer routing.", env: [{ name: "SITE_LOCK", sensitive: false, note: 'Set to "false".' }, { name: "NEXT_PUBLIC_STEALTH_MODE", sensitive: false, note: 'Set to "false".' }, { name: "MLO_ROUTING", sensitive: false, note: 'Set to "true".' }] },
];

/** Which variables are set (never their values). */
export function envStatus(name: string): boolean {
  if (name === "TWILIO_MESSAGING_SERVICE_SID_1761573") return !!(process.env[name]?.trim() || process.env.TWILIO_MESSAGING_SERVICE_SID?.trim());
  if (name === "DATABASE_URL") return !!(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim());
  if (name === "KV_REST_API_URL") return !!(process.env.KV_REST_API_URL?.trim() || process.env.UPSTASH_REDIS_REST_URL?.trim());
  if (name === "KV_REST_API_TOKEN") return !!(process.env.KV_REST_API_TOKEN?.trim() || process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  if (name === "MLO_BASIC_AUTH") return process.env.MLO_BASIC_AUTH === "false";
  if (name === "SITE_LOCK" || name === "NEXT_PUBLIC_STEALTH_MODE") return process.env[name] === "false";
  if (name === "MLO_ROUTING") return process.env.MLO_ROUTING === "true";
  if (name === "CC_REQUIRE_MFA" || name === "RECRUIT_REWARDS" || name === "PRODUCTION_OVERRIDE") return process.env[name] === "true";
  if (name.startsWith("GATE_")) return process.env[name] === "true";
  return !!process.env[name]?.trim();
}
