# Command Center launch checklist

Every outside account and Vercel setting Command Center uses, in the order to do them. The live version, showing which variables are already set, is in Command Center → Launch checklist (`/mlo/launch`). Generated from `lib/setup/launch.ts` (D32).

Add each variable in Vercel → the project → Settings → Environment Variables (Production and Preview), then redeploy. **Sensitive** means mark it Sensitive in Vercel.

## 1. Accounts

### Database (Neon)

Everything Command Center keeps lives here. Add it from Vercel → Storage, and the variable is set for you.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Set by the Neon integration. |

### Rate limits (Upstash Redis)

Shared limits across servers. Add it from Vercel → Storage.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `KV_REST_API_URL` | No | Set by the integration. |
| `KV_REST_API_TOKEN` | Yes | Set by the integration. |

### Email (Resend)

Sign-in links, the morning and weekly emails, and alerts. Verify your sending domain in Resend first.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes | From Resend → API keys. |
| `LOANM8_FROM_EMAIL` | No | The verified address mail comes from. |

### AI for Command Center (Anthropic)

Make a separate workspace in the Anthropic Console for Command Center, with its own monthly spend limit, and ask Anthropic for zero data retention on it (it handles client messages and notes). The public chat keeps its own key.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `CC_ANTHROPIC_API_KEY` | Yes | The Command Center workspace's key. |
| `ANTHROPIC_API_KEY` | Yes | The public M8 chat's key (already set). |

### Texting (Twilio)

Create the account; the Messaging Service comes in Texting, below.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | No | Twilio Console home. |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Console home. |

### Do-not-call scrubbing

A National Do Not Call Registry subscription (SAN) for your area codes, or a DNC vendor that includes state lists such as Texas. (telemarketing.donotcall.gov, or your vendor)

### Reassigned Numbers Database

Checks whether a number was disconnected since permission was given. Pay per query. (reassigned.us)

### Voice and the mic (Google Cloud, optional)

M8 reads replies aloud and you can dictate call notes. Enable Text-to-Speech and Speech-to-Text on the key.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `GOOGLE_CLOUD_API_KEY` (optional) | Yes | Restrict it to those two APIs. |

### Error alerts (Sentry, optional)

Failures in the morning run and elsewhere are reported here.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `SENTRY_DSN` (optional) | Yes | From the Sentry project. |

## 2. Command Center settings in Vercel

### You, as owner

Your email becomes the owner account the first time you sign in at /sign-in.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `MLO_OWNER_EMAIL` | No | Your sign-in email. |

### The morning run

Runs the Concierge, recipes, the morning email and the Monday report each day (the schedule is already in vercel.json).

| Variable | Sensitive | Note |
| --- | --- | --- |
| `CRON_SECRET` | Yes | Any long random value. |

### Client page links

Signs each client's private page link.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `CC_LINK_SECRET` | Yes | Any long random value. Changing it replaces every client link. |

### Your portal and booking links

Application and document texts point to your secure ARIVE borrower portal; clients book time with you.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `APPLICATION_URL_MLO_001` | No | Your ARIVE borrower portal (https). |
| `APPLICATION_URL_MLO_002` (optional) | No | Your team loan officer's (mlo-002). |
| `NEXT_PUBLIC_CALENDLY_BORROWER` | No | Your booking link. |
| `NEXT_PUBLIC_CALENDLY_RYDER` (optional) | No | Your team loan officer's (mlo-002) booking link. |

### Retire the shared admin login

Once your own sign-in works, turn off the old shared login.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `MLO_BASIC_AUTH` | No | Set to "false". |

### Which AI model (optional)

Leave unset for the default.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `CC_CONCIERGE_MODEL` (optional) | No | A model id. |

## 3. Texting

### A Messaging Service for your sponsor

In Twilio, create one Messaging Service per sponsoring company. Set its incoming-message webhook to /api/twilio/inbound and its status callback to /api/twilio/status (exact addresses on Texting setup).

| Variable | Sensitive | Note |
| --- | --- | --- |
| `TWILIO_MESSAGING_SERVICE_SID_1761573` | No | Home Trust Financial's service (or TWILIO_MESSAGING_SERVICE_SID while it's the only sponsor). |

### Register the brand and the Customer Care campaign (10DLC)

Use the wording on Texting setup. Register Customer Care first; mortgage marketing campaigns are often refused, and a refusal is final. (Twilio Console → Messaging → Regulatory compliance)

### The opt-out confirmation, before 2026-11-25

In the Messaging Service's Advanced Opt-Out, set the confirmation so it only confirms (no "reply START", no marketing). The exact wording is on Texting setup. (Twilio Console → Messaging Service → Opt-out management)

## 4. Before you contact anyone

### Connect your loan system

Pipeline → make a connection key, then add the Zapier step from ARIVE (instructions on the Pipeline page).

### Import your contacts

Contacts → Import. Mark where each list came from; lists from a previous employer stay on hold until you clear them.

### Record the permission you already hold

Contacts → Record permission for past clients, with where the signed consent is.

### Scrub do-not-call and reassigned numbers

Contacts → Record permission: copy each list, run it with your vendor and the FCC database, paste the results back.

### Turn on your Concierge, automations and emails

Concierge: on, how you sound, the morning and weekly emails. Automations: the loan updates you want.

## 5. Counsel

### Questions for counsel

The client-page opt-in wording; whether AI-drafted texts need a disclosure; the Connecticut existing-customer reading; the RESPA wording on asking for introductions; how long call notes and Concierge notes are kept; adding the client page and the Concierge to the privacy notice.

### State switches (only after counsel clears them)

Each stays closed until set to exactly "true".

| Variable | Sensitive | Note |
| --- | --- | --- |
| `GATE_TX_302_CLEARED` (optional) | No | Texas sales calls and texts (ch. 302). |
| `GATE_AZ_PHONE_CLEARED` (optional) | No | Arizona sales calls and texts. |
| `GATE_CA_AI_VOICE_CLEARED` (optional) | No | M8 AI-voice calls to California. |

## 6. Go live

### Open the site

When the public site is ready: lift the tester password and stealth, and turn on loan officer routing.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `SITE_LOCK` | No | Set to "false". |
| `NEXT_PUBLIC_STEALTH_MODE` | No | Set to "false". |
| `MLO_ROUTING` | No | Set to "true". |
