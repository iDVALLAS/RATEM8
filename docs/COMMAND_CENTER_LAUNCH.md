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

Sign-in links, the morning and weekly emails, alerts, and your emails to clients (sent in your name, with replies to your own inbox). Verify your sending domain in Resend first, with SPF, DKIM and DMARC.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes | From Resend → API keys. |
| `LOANM8_FROM_EMAIL` | No | The verified address mail comes from. |
| `MLO_NOTIFICATION_EMAIL` | No | Where chat questions and alerts go. Email (sign-in links included) only sends once this is set too. |

### Gmail and Microsoft 365 (send-only)

So each loan officer's client emails go from their own mailbox (D52). Google Cloud: an OAuth client (Web application), the Gmail API on, scope gmail.send, redirect URI (your site)/api/cc/mail/callback/google; Google checks the app's brand before outside Workspaces can use it. Microsoft Entra: an app for accounts in any organization, Web redirect URI (your site)/api/cc/mail/callback/microsoft, a client secret, delegated Graph permissions Mail.Send, User.Read and offline_access. Register the preview and production addresses. Exact addresses on the Email page.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` (optional) | No | Google Cloud → APIs & Services → Credentials. |
| `GOOGLE_OAUTH_CLIENT_SECRET` (optional) | Yes | Same place. |
| `MS_OAUTH_CLIENT_ID` (optional) | No | Entra → App registrations → the app's Application (client) ID. |
| `MS_OAUTH_CLIENT_SECRET` (optional) | Yes | Entra → the app → Certificates & secrets (the secret's Value). |
| `CC_MAIL_KEY` (optional) | Yes | Any long random value; encrypts the saved connections (otherwise one derived from CC_LINK_SECRET). Changing it means everyone reconnects. |

### Cards by mail (Thanks.io, optional)

Each loan officer connects their own Thanks.io account and pays for their own cards (D53). Register Command Center once: in Thanks.io, Settings → API Access → OAuth Applications → Create Application, with the redirect address (your site)/api/cc/cards/callback for the preview and production addresses.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `THANKSIO_CLIENT_ID` (optional) | No | From the OAuth application. |
| `THANKSIO_CLIENT_SECRET` (optional) | Yes | From the OAuth application. |

### Video messages and voicemails (private Vercel Blob store, optional)

Stores the short videos loan officers record and send (D55) and their voicemail recordings (D57), in a PRIVATE store: files open only through Command Center, for the loan officer, the person a video was sent to, or Twilio playing a voicemail (D65.1). In Vercel: the project → Storage → Create → Blob, choose Private, and connect it to this project with "Add a read-write token env var" ticked. Already made one without the token? Storage → the store → Projects → reconnect ratem-8 with that box ticked. Then redeploy. The word check uses the Google key below, with Speech-to-Text on.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `BLOB_STORE_ID` (optional) | No | Set by Vercel when the store is connected (the server reads and saves through Vercel's own sign-in). |
| `BLOB_READ_WRITE_TOKEN` (optional) | Yes | Set by Vercel when "Add a read-write token env var" is ticked. Recording and uploading from the browser need it. |

### Voicemail drops (Twilio, optional)

Loan officers leave a recorded voicemail through their contact rules (D57). Calls come from the company's own number once Command Center registers its texting (D56), or from a number you set here. For voicemails with an offer, the law asks for a toll-free opt-out line: a toll-free number in Twilio with its Voice webhook set to (your site)/api/twilio/voice (HTTP POST), or a toll-free number elsewhere (such as NumberBarn) forwarded to a Twilio number with that webhook (D61). If the forwarding hides the caller's number, the line asks them to key it in. A number you set by hand needs the same Voice webhook. Uses the Blob store (Video messages) and the Google key (Voice and the mic).

| Variable | Sensitive | Note |
| --- | --- | --- |
| `TWILIO_OPTOUT_NUMBER` (optional) | No | The toll-free opt-out line (+18…), as it's said in voicemails. |
| `TWILIO_OPTOUT_RING_TO` (optional) | No | When the toll-free number lives elsewhere: the Twilio number it forwards to. |
| `TWILIO_CALLER_ID` (optional) | No | A Twilio number drops can come from while a company has no registered number (TWILIO_CALLER_ID_<company NMLS> for one company). |

### M8 loan-update calls (off until you turn them on)

M8, an AI voice, calls a client who gave permission with proof (written, or a yes on a recorded call; D61) to tell them where their loan stands, and passes anything else to the loan officer (D58). It checks it's them before saying anything about the loan, tells them it's an AI and keeps a written note, never quotes numbers or promises, and stops on request. The owner approved these on 2026-11-20. California stays held by the contact rules until cleared. Uses the calling number from Voicemail drops.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `CC_AI_CALLS` (optional) | No | Set to "true" to turn M8 calls on. |

### AI for Command Center (Anthropic)

Make a separate workspace in the Anthropic Console for Command Center, with its own monthly spend limit, and ask Anthropic for zero data retention on it (it handles client messages and notes). The public chat keeps its own key.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `CC_ANTHROPIC_API_KEY` | Yes | The Command Center workspace's key. |
| `ANTHROPIC_API_KEY` | Yes | The public M8 chat's key (already set). |

### Texting (Twilio)

Create the account (upgraded, with billing). Then, so Command Center can register each company itself (D56): in Twilio, Trust Hub → Customer Profiles, create and get approved the platform's own Primary Business Profile (as the software company, ISV). Its BU… SID goes below.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | No | Twilio Console home. |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio Console home. |
| `TWILIO_PRIMARY_PROFILE_SID` (optional) | No | Trust Hub → your approved Primary Business Profile (starts with BU). |

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

### A code from your phone at sign-in

Turn it on for yourself at Sign-in security (an authenticator app, a minute to set up). When everyone on the team has it, require it for all. The Safeguards Rule asks for this wherever client files are reached.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `CC_REQUIRE_MFA` | No | Set to "true" to require it for everyone. |
| `CC_MFA_KEY` (optional) | Yes | Any long random value; encrypts the phone keys (otherwise one derived from CC_LINK_SECRET). |

### Retire the shared admin login

Once your own sign-in works, turn off the old shared login.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `MLO_BASIC_AUTH` | No | Set to "false". |

### AI plans and models (optional)

Each member's plan (Standard or Unlimited, set on Membership) picks the model for each feature and the monthly AI allowance (lib/config.ts AI_PLANS). Set the Anthropic workspace's own monthly spend limit as a backstop. Leave the override unset.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `CC_CONCIERGE_MODEL` (optional) | No | Overrides every feature's model (for testing only). |

### Pilot label and reports (optional)

While you test with a few loan officers: a Pilot label in everyone's top bar, a pilot line in invite emails, and the pilot welcome. Report a problem works either way and emails your sign-in address; triage on Pilot.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `CC_PILOT` (optional) | No | Set to "true" during the pilot. |

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

### Counsel review

The owner reported counsel's approval of everything through D44 on 2026-11-19 (and of the launch series on 2026-10-31). Keep the written sign-off with the questions it answered: The client-page opt-in wording; whether AI-drafted texts need a disclosure; the Connecticut existing-customer reading; the RESPA wording on asking for introductions; how long call notes and Concierge notes are kept; adding the client page and the Concierge to the privacy notice.

### State switches (only after counsel clears them)

Each stays closed until set to exactly "true".

| Variable | Sensitive | Note |
| --- | --- | --- |
| `GATE_TX_302_CLEARED` (optional) | No | Texas sales calls and texts (ch. 302). |
| `GATE_AZ_PHONE_CLEARED` (optional) | No | Arizona sales calls and texts. |
| `GATE_CA_AI_VOICE_CLEARED` (optional) | No | M8 AI-voice calls to California. |

### Membership plan (only after counsel clears it)

Recruiting credit (10%, 15% after a year, one level, credit on the recruiter's own membership, never from loans) is tracked and held until this is on. Ask counsel about the plan, the co-op budget and whether the plan needs any securities or franchise filing.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `RECRUIT_REWARDS` (optional) | No | Set to "true" once approved. |

### Production share (only after counsel and the sponsor approve it)

The NEXA-style share (10 basis points of recruits' closed loan amounts, three levels down, vested after three years; from lib/config.ts) is tracked until this is on. The sponsoring company pays it through its written compensation plan; ask counsel about Reg Z loan originator pay (12 CFR 1026.36(d)), state rules for any levels beyond the first, and how agents who get licensed are paid on their own deals.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `PRODUCTION_OVERRIDE` (optional) | No | Set to "true" once approved. |

## 6. Go live

### Open the site

When the public site is ready: lift the tester password and stealth, and turn on loan officer routing.

| Variable | Sensitive | Note |
| --- | --- | --- |
| `SITE_LOCK` | No | Set to "false". |
| `NEXT_PUBLIC_STEALTH_MODE` | No | Set to "false". |
| `MLO_ROUTING` | No | Set to "true". |
