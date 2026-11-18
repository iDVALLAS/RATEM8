# LoanM8 Command Center: build prompt

**For:** the engineering agent (or team) building the loan officer back end.
**From:** the owner, 2026-11-18. Research and draft by Claude Code in the
owner's session.
**Status:** a brief to build from. Nothing here is built yet. Every
compliance item marked **[COUNSEL]** needs sign-off before it ships.

Read `CLAUDE.md` first. Its working rules apply: sequential numbered
patches, the owner signs off on each one, `npm run verify` before every
push, facts come from config, no model identifiers in pushed artifacts,
preview only until the owner says "promote".

---

## 0. The one-paragraph brief

Build **Command Center**, the loan officer's back office inside LoanM8. It
should be the easiest mortgage CRM on the market: Bonzo-simple on day one,
and smarter than anything else by day thirty. A loan officer imports a CSV
of contacts, and the system sorts out who can be contacted, how, and why.
M8 (Google voice) calls and texts past clients to check in, with consent,
an AI disclosure and live transfer to the loan officer. Real estate agent
production data (RETR) turns into specific, timely reasons to call an
agent. Loans sync from the loan officer's POS or LOS (ARIVE first, then
Encompass, Blend and Floify). The recruiting and ownership package lets
loan officers join LoanM8 and share in its growth under a structure counsel
has approved. Every feature is built on LoanM8's existing rules: one
originator per area, no lead is ever sold, AI disclosure before every AI
interaction, and no rate outside a priced result.

---

## 1. What the market already does (research, 2026-11-18)

Most sources are vendor or partner pages, so treat their claims as
marketing until checked with the vendor.

| Product | What it's known for | Gap we can beat |
|---|---|---|
| **Bonzo** | "Conversation software": texting and MMS, AI texting, dedicated numbers, call recording, automated text, email and voicemail follow-up. About $150 per seat per month on the Solo tier. | Thin CRM depth; pipelines are a separate purchase; no native LOS connection (Zapier or add-ons); many loan officers pair it with a second CRM. |
| **Shape** | AI voice and text agents that work leads around the clock; lead scoring; high-volume teams. | Broad, not mortgage-deep; the AI calls *leads*, not your own past clients' life moments. |
| **Total Expert** | Enterprise marketing CRM for banks and large lenders; RETR partner. | Heavy, slow to set up, built for marketing departments, not one loan officer. |
| **Jungo** | Salesforce-based mortgage CRM, about $96–125 per user; deep LOS links. | Configuration-heavy; paid buildout; no AI voice agent (per a competitor). |
| **BNTouch** | All-in-one with built-in AI ("MAIA") on every plan, about $165 per month. | Dated UX; a lot of features, no single "what do I do now" screen. |
| **Homebot** | Monthly home-value and equity reports to past clients. | One-way email; no conversation; no agent intelligence. |
| **Aidium** | AI propensity modelling (who's likely to transact). | Scores without a next step; no voice. |
| **RETR** | Nationwide production data on agents and loan officers since 2017: units, volume, loan types, which loan officer and title company each agent's buyers used, plus builder, refi, LMI and MMCT searches. Transactions update in 0–3 days; loan, refi and builder data lag 4–6 weeks. No borrower or buyer contact data. Already integrated with OptifiNow, MloFlo and Total Expert. Competitors: Model Match, MMI. | It's a research tool; loan officers still have to turn the data into a call. |

**POS and LOS reality:**
- **ARIVE:** the documented route is Zapier. Triggers include new loan, POS application submitted and loan status updated, plus configured webhooks on loan created, application completed, key date, loan tracker and status changes. Sources disagree on whether there's a public REST API; confirm with ARIVE.
- **Encompass (ICE):** Developer Connect has REST milestone endpoints and webhooks with attribute-level change events. This is the cleanest real-time option.
- **Blend:** syncs Encompass milestones and is driven by webhooks.
- **Floify:** one-way milestone sync from Encompass, which triggers Floify's own email and SMS. No documented outbound webhooks to a CRM, so Floify data comes through the LOS.

**Google voice:** Google's Gemini Live API does real-time, interruptible voice conversation with function calling, over a persistent connection. Google has no phone service of its own: calls reach it through a phone carrier (Twilio, Plivo, Telnyx, Voximplant) or a media framework (LiveKit, Pipecat, FreeSWITCH). A phone call is 8 kHz μ-law audio, so the bridge converts it to PCM. LoanM8 already has a Google Cloud project ("Loanmate") with Text-to-Speech and Speech-to-Text on one API key, and M8's voice is picked at `/mlo/voice`. Check current Live model names and per-minute prices on Google's docs before building: this session couldn't open `ai.google.dev`.

---

## 2. Non-negotiable rules (build these first, not last)

These come before any feature. A feature that can't satisfy them doesn't
ship.

### 2.1 Calls and texts [COUNSEL]
- **AI voice counts as "artificial voice" under the TCPA.** The FCC ruled this on 2024-02-08. M8 calling a mobile number needs the person's prior express consent, and **prior express written consent** if the call is marketing. A check-in with a past client that mentions a refinance or a new purchase is likely marketing. Build the consent model for the strict case.
- **Every AI call opens with an identity and AI disclosure.** For example: "Hi, this is M8, an AI assistant calling for [loan officer] at LoanM8 [sponsor line]." It also offers an opt-out in the call: say "stop", or press a key.
- **Revoking consent:**
  - The FCC rule effective 2025-04-11 says people can revoke consent "by any reasonable means", and it must be honored within 10 business days. STOP, QUIT, END, REVOKE, OPT-OUT, CANCEL and UNSUBSCRIBE are always valid by text.
  - An October 2026 FCC change reportedly lets a sender designate one exclusive revocation method. This comes from a single source this session couldn't open, so verify it before relying on it.
  - **Build for the strict version:** honor any reasonable revocation on any channel, everywhere, **immediately**. Not in 10 days.
- **The one-to-one consent rule was vacated** (Eleventh Circuit, 2025-01-24). Consent itself is still required. Never buy leads, and never import a list whose consent can't be proven.
- **10DLC:** every texting number is registered with The Campaign Registry (brand and campaign). Carriers have blocked unregistered A2P traffic since 2025-02-01. Use a toll-free number only with toll-free verification.
- **State laws ("mini-TCPAs"):**
  - Florida's FTSA (timing and frequency limits; a 15-day window to stop after a do-not-text request).
  - Texas brought texts into its telephone solicitation act in 2025.
  - Oklahoma, Maryland and others need checking.
  - **Build:** a per-state rules table with quiet hours, a calls-per-day cap and a texts-per-week cap. Default to the strictest window: 9 AM–8 PM in the *recipient's* local time.
- **Do Not Call:**
  - Check the national DNC registry, state DNC lists and LoanM8's internal DNC before every marketing touch.
  - An existing business relationship can help for calls, but not for artificial-voice calls to mobiles. Default to consent.
- **Recording:**
  - Two-party consent states (WA, CA and others, from `CONFIG.states[].twoPartyConsent` plus a full US table) get "this call is recorded" at the start, *before* any substance.
  - Store transcripts like chat transcripts: sensitive numbers redacted, kept for the counsel-set period, deletable.
- **Licensing:** M8 only discusses a loan with someone whose property state is one where the loan officer is licensed (`lib/routing.ts`). Otherwise it says so and stops.

### 2.2 Data [COUNSEL]
- **Trigger leads are effectively banned** for mortgages under the Homebuyers Privacy Protection Act, effective March 2026. Never buy credit-bureau trigger lists. Every "signal" in this product comes from the loan officer's own relationship data, public records, partner data (RETR) or what the borrower tells M8.
- **GLBA:** borrower data is nonpublic personal information.
  - Encrypt it at rest and in transit.
  - Isolate each tenant's data (row-level security).
  - Keep an audit log of every read of a borrower record.
  - No borrower data in logs, analytics or model training.
  - Uploaded CSVs are deleted after import.
- **Fair lending:** RETR offers LMI and MMCT (majority-minority census tract) searches.
  - **Never** use race, ethnicity, census-tract demographics or any proxy to *exclude* or *deprioritize* anyone. Scoring models can't take them as inputs.
  - LMI and MMCT data may only be used to *add* outreach, such as down-payment-assistance education, and that use is logged.
  - An automated fair-lending check runs on every scoring model.
- **No lead is sold** (`copy.join`). Contacts belong to the loan officer who imported them. When a loan officer leaves, their contacts leave with them, unless the borrower has an active loan with the sponsor, under the sponsor's record-keeping rules.

### 2.3 Agents and RESPA [COUNSEL]
- **RESPA Section 8:** nothing of value goes to an agent for referrals.
  - In August 2023 the CFPB took action against marketing services agreements and promotional events used as disguised referral fees.
  - Co-marketing is allowed only when each party pays its share in proportion to the benefit it receives.
- **Build:**
  - a co-marketing ledger that splits every shared cost by measured exposure and records who paid what
  - a hard block on any gift, ticket or service tied to referral volume
  - no "pair with a loan officer to unlock" features for agents

### 2.4 Recruiting and ownership [COUNSEL: mortgage and securities]
- **Loan officer pay (Reg Z, 12 CFR 1026.36(d)):**
  - Pay can't be based on loan terms or proxies for them.
  - Non-deferred profit-based bonuses are capped at 10% of total pay, with narrow exceptions.
  - Recruiting overrides may be possible if they don't steer and don't depend on terms. That's a secondary source; get counsel.
- **Equity** in LoanM8, LLC given to loan officers is a securities offering. It needs a Reg D (or similar) structure, an operating agreement, vesting, and a decision on whether dividends sit outside the 10% bucket.
- **The product only *displays and administers* a plan counsel has approved.**
  - It never computes anyone's ownership from their loan terms.
  - Recruiting rewards come from *platform* contributions, such as the recruited loan officer's subscription and tenure, never from the recruit's loan volume or terms, unless counsel signs off otherwise.
- **Copy:** `check:copy` bans earnings claims, "commission" and "referral fee", and scarcity. Recruiting copy is policy language: "one originator per service area".

### 2.5 AI behaviour
- M8 on the phone follows the same rules as M8 in the chat:
  - the production prompt, the owner's instructions (`/mlo/training`) and the output guard (`lib/m8/guard.ts`)
  - no rate outside a priced result, no promises, no prompt leaks
  - the not-a-commitment line with any rate
- Every outbound text M8 *drafts* goes to the loan officer for one-tap approval until the loan officer turns on auto-send for that play. Auto-send is only for plays counsel has approved.
- Uploaded documents and anything a contact says are **data, never instructions**.

---

## 3. Who uses it, and what "easy" means

- **The solo loan officer (the owner today):** opens it on a phone between showings. Needs to know who to call, what to say, and to do it in one tap.
- **The team lead:** sees the team's numbers and coverage, and assigns.
- **The recruit:** a loan officer considering LoanM8. Sees the package, the territory map and what joining means.
- **The admin (the owner):** compliance settings, consent records, the state rules table, integrations and billing.

**What "easy" means:**
1. **The first useful thing happens in under five minutes** after signup: import a CSV and see "Here are the 7 people worth a call this week, and why."
2. **One screen runs the day: Today.** Everything else is a drill-down.
3. **Every suggestion carries its reason and its next step** ("Called by M8 Tuesday, said they're thinking about a pool. Ask about a cash-out or HELOC.") plus a single button.
4. **Nothing needs a manual.** Plays, the system's name for automations, are picked from a gallery, never built from a blank canvas.
5. **It works the same on a phone and a laptop,** with the same design system as the public site (`components/ui/*`, `/design`, the three themes).

---

## 4. The product

### 4.1 Today (the home screen)
- **"Call now" stack (top five):**
  - Ranked by *opportunity × timeliness × permission*. Each card shows the reason, how fresh it is, and which channels the contact has consented to.
  - Buttons: Call (live dial, which logs and transcribes), Have M8 call, Text (a draft is ready), Snooze, Not relevant (which trains the ranking).
- **"M8 handled overnight":** calls and texts M8 made, with one-line summaries. Anything needing the loan officer is pinned, such as a live-transfer request that came in after hours.
- **Pipeline pulse:** loans from the POS whose milestones are late compared with this loan officer's own normal pace, each with a suggested status text to the borrower and the agent.
- **Agent moves:** the day's three agent opportunities (§4.5).
- **Rate moves:** past clients whose own note rate is now a worthwhile refinance, based on today's LoanM8 priced snapshots. Shown to the loan officer only; nothing goes to the client without consent and a priced result.
- **Voice briefing:** "Hey M8, what's today?" reads the screen aloud while driving and takes spoken commands. "Text Sarah the appraisal's in" is drafted, read back and confirmed.

### 4.2 Contacts and import
- **CSV import in three steps:**
  1. Drop the file.
  2. Auto-map the columns. Common exports from Bonzo, Total Expert, Jungo, Salesforce, Google, Outlook and Excel are recognized, and the loan officer confirms with one screen of dropdowns.
  3. Review the summary: duplicates merged, phone numbers checked, landline or mobile looked up, DNC checked, state found, consent status per channel.
- **Consent is a first-class column:**
  - per contact and per channel (call, AI call, text, email) and purpose (service or marketing)
  - with the source, timestamp and proof (a form, recording or message)
- **Imported contacts with no provable consent are "relationship only".** The loan officer can call them personally, by hand. M8 can't call or text them until consent is captured. The system offers a compliant way to capture it: a personal email or a one-tap link to M8 chat with a consent checkbox.
- **Enrichment from allowed sources only:** public property records (purchase date, price and estimated equity, from a vendor such as ATTOM, [VENDOR TBD]), the loan officer's own closed loans (from the POS), and what the contact told M8. **No credit data. No trigger leads.**
- **The contact page** is one timeline (calls, texts, emails, M8 chats, Loan Estimate uploads, loans, agent links, notes) with a "what M8 knows" summary the loan officer can correct.

### 4.3 Conversations
- **One inbox for text, email and voicemail**, plus M8 call transcripts.
- Each thread shows the contact's consent and quiet-hours status, and blocks sending when either says no.
- **M8 suggests replies.** The loan officer taps to send or edit. Suggestions use the owner's training notes and the playbook.
- **Live transfer:** when M8 is on a call and the contact wants the loan officer, M8 conferences the loan officer in during their availability window (the C19 call hours, per loan officer). Otherwise M8 books a time (Calendly, or the loan officer's calendar) and texts the confirmation.

### 4.4 M8 voice check-ins (Google voice)
- **What M8 calls about:** home anniversaries, a rate move worth discussing (with a priced result), "how's the house", annual mortgage reviews, PMI removal eligibility (estimated equity crosses 20%, then 22%), hazard insurance renewal reminders, post-closing satisfaction, and agent introductions the contact asked for.
- **Before every call (the consent gate):**
  - AI-call consent for this purpose
  - inside quiet hours for the contact's state
  - under the frequency caps
  - not on any DNC list
  - the loan officer is licensed in the property's state
  - recording disclosure set by state

  If any check fails, the call doesn't happen, and the card says why.
- **How the call is built:**
  - a phone number on Twilio, Telnyx or Plivo
  - media streams to a voice-agent runtime (Pipecat or LiveKit) that runs Gemini Live with the M8 voice
  - tools limited to: `book_time`, `live_transfer`, `request_callback`, `note`, `opt_out`, `get_pricing` (dated examples only, same guard)
  - interruptions allowed; voicemail detection, with a short legal voicemail or none, per counsel
  - a 3-minute soft cap and a hard cap
- **After the call:** a summary, intent tags (moving, renovating, refinance interest, selling, referral offered, opt-out) and a suggested next step. The redacted transcript is stored. Opt-outs take effect immediately on every channel.
- **The owner reviews it first:** for the first 50 calls of any new play, a person listens to a sample before M8's call volume goes up.

### 4.5 Agent Intel (RETR)
- **Connect RETR:** first check whether RETR offers an integration programme (OptifiNow, MloFlo and Total Expert all integrate). Get access as a partner; until then, a CSV export from RETR works with the same import flow.
- **Agent profiles:** production, trend, price bands, loan types their buyers use, which loan officers and title companies they work with, and listing activity (0–3 days fresh).
- **Opportunities, not dashboards. Each is a specific reason to call today with a script:**
  - **New listing by a partner agent:** offer a co-branded property page with a payment example (priced, dated and guarded), a "decode a Loan Estimate" link and M8 chat for buyers. Costs are split on the co-marketing ledger (§2.3).
  - **An agent's usual loan officer just moved:** a change of company, detected from RETR plus NMLS Consumer Access. That's an introduction window. (See §5.1.)
  - **An agent's buyers use loan types you're strong in** (FHA, VA, non-QM bank statement, DPA).
  - **Growing agents:** rising production year over year, still unattached.
  - **Builder activity in your area.**
- **Meeting prep:** one tap gives a one-page brief before coffee with an agent. It covers their year, their mix, how you could help, and the co-marketing ledger.
- **No referral payments, ever** (§2.3).

### 4.6 Pipeline (POS and LOS sync)
- **A connector interface with one adapter per system:**
  - **ARIVE:** webhooks or Zapier.
  - **Encompass:** Developer Connect webhooks and milestones.
  - **Blend:** webhooks.
  - **Floify:** through the LOS sync.
  - **LendingPad and BeSmartee:** later.
  - **Manual:** CSV.
- **Data flow:**
  - **Read:** borrower, agent, milestones, key dates (application, lock expiry, appraisal, CTC, closing) and the loan amount and type.
  - **Write back** only where the system supports it: notes and tasks.
- **The milestone guardian:**
  - It learns this loan officer's normal time between milestones and flags a loan that's late, before the borrower asks.
  - It drafts the status text to the borrower and the agent. The loan officer approves it, or auto-sends if that play is approved.
- **Lock-expiry and closing-date alerts,** with the "never promise a closing date" guard.
- **Post-close:** closed loans become past clients, with anniversary and review plays set up automatically, if consent allows.

### 4.7 Plays (automation, the easy way)
- **A gallery of ready-made plays,** each with: what it does, who it touches, the channels and consent it needs, the copy (editable, run through `check:copy` rules and the guard), and a preview of the next 10 people it would reach.
- **Examples:**
  - Speed-to-lead (M8 chat or form → text within 60 seconds, M8 call within 5 minutes, if consented)
  - Post-close (day 3, day 30, year 1)
  - Home anniversary
  - PMI removal check
  - Rate watch (§5.6)
  - New listing co-marketing
  - Lock expiring
  - Missing documents
  - Agent weekly update for active files
- **Every play runs through one "send gate"** that applies §2. There's no other path to a phone or an inbox.

### 4.8 Recruiting and ownership (the platform package)
- **The territory map:**
  - "One originator per service area" made visible: areas that are live, being vetted or open.
  - An open area shows what it takes to join.
- **Recruit Radar (for the owner and team leads):**
  - Uses RETR and NMLS data to find licensed loan officers in open areas whose production fits.
  - Outreach is personal, by hand and consented. No scraped auto-dialling of loan officers either.
- **The package page for a recruit** sets out what they get and what they pay, in plain policy language:
  - Command Center
  - M8 chat and voice under their name
  - the LoanM8 site with their territory
  - priced daily examples
  - the agent intel
  - the ownership plan **as approved by counsel**
- **The ownership ledger (admin):**
  - It records the plan counsel approved: units, a vesting schedule, cliff, transfers and buyback, and the documents signed.
  - It shows each loan officer their own position.
  - It never calculates anything from loan terms, and it never makes an earnings claim.
- **Recruit rewards:** whatever counsel approves, tracked and shown. The default design ties rewards to platform contributions (subscription and tenure), not to the recruit's loans.

### 4.9 Compliance Center (admin)
- **The consent register:** searchable, with proof attached, exportable for an exam.
- **The rules table:** quiet hours, caps, two-party states and DNC refresh status, per state.
- **The send-gate log:** every blocked touch and why. Every sent touch and its consent basis.
- **Call reviews:** sampled AI calls with a scoring rubric. The owner's corrections feed `/mlo/training`.
- **Fair-lending report** on scoring models.
- **Data requests:** export or delete a contact's data, with sponsor record-keeping holds where they apply.

### 4.10 Numbers (analytics)
- **Measures of loan officer results, never vanity:**
  - conversations started
  - appointments
  - applications
  - funded loans by source (past client, agent, M8 chat, Second Look)
  - agent relationships gained
  - M8 call outcomes
  - opt-out rate (a quality alarm)
  - time-to-first-touch
- **Every number links to the people behind it.**

---

## 5. New ideas nobody ships yet

These combine LoanM8's existing parts (daily priced snapshots, the guard, M8 chat and voice, Second Look, routing, consent) with RETR, public records and POS data. All of them stay within §2.

### 5.1 Orphaned-agent alerts
When an agent's main loan officer partner (from RETR's loan officer on the buyer side) changes company or goes inactive (from NMLS Consumer Access), the agent is suddenly without a lender they trust. Command Center flags it within days. The loan officer gets a respectful, specific script ("I saw [loan officer] moved; if you need a backup lender for anything in flight, I'm local and licensed here"), with no inducements. Nobody watches loan officer moves from the agent's side today.

### 5.2 Listing-to-buyer kit
When a partner agent lists (RETR, 0–3 days), Command Center builds a co-branded property page:
- a payment example from today's priced snapshot of a scenario that matches the list price, dated and guarded
- a "Have an offer? Decode the Loan Estimate" link (Second Look)
- M8 chat that already knows the property

The agent shares it, and buyers who engage reach the loan officer with consent captured. The cost split is recorded automatically on the co-marketing ledger. *Our edge:* priced, compliant examples generated per listing, which no CRM has.

### 5.3 The consent passport
Consent becomes something the borrower holds and controls, rather than a checkbox buried in a form:
- One tap in M8 chat, at an open house (QR code) or on a property page grants consent per channel and per purpose.
- The borrower can see and change their own choices at a private link.
- The send gate reads it in real time.

It turns the compliance burden into a trust feature ("you control how we contact you"), and every touch can be proven.

### 5.4 Refi ripeness from the borrower's own loan, not a guess
Past clients' actual note rate, balance and term (from the POS), plus today's LoanM8 priced snapshot for a matching scenario, plus the break-even math the site already uses (points, credits, buydowns) give a specific number: "a refinance would pay back its costs in 19 months".
- Only shown to the loan officer.
- Only offered to the client with consent, a priced result and the not-a-commitment line.
- Uses no credit data and no trigger leads.

### 5.5 The milestone guardian with "status before anxiety"
It learns each loan officer's normal pace between POS milestones. When a loan stalls compared with that pace, it drafts the proactive update to the borrower *and* the agent before either asks. The agent gets a clean weekly summary of every shared file automatically. Agents choose lenders by communication; this makes it automatic and honest.

### 5.6 Rate watch, borrower-set and honest
In M8 chat or on a call, a borrower says "tell me if I can get under X". Each day's priced snapshot is checked against their saved scenario. When a dated example crosses their number, M8 texts the dated example (rate, APR and not-a-commitment), with consent and opt-out. The borrower sets the threshold, so it's a service, not marketing spam. The LoanSifter pipeline LoanM8 already runs makes this possible.

### 5.7 The voice stand-up
"M8, what's today?" in the car gives a 60-second spoken briefing: today's calls, late loans, agent moves, rate moves. Then voice commands produce drafts that M8 reads back and the loan officer confirms. It uses the same Google voice stack as the borrower side. Nobody offers a hands-free mortgage desk.

### 5.8 Second Look for agents
Agents get a private link to send a buyer who already has an outside Loan Estimate. M8 explains it neutrally (the C20 rules), and the loan officer can offer to price against it, with the buyer's consent. It turns competing offers into conversations without disparaging anyone and without referral payments.

### 5.9 Recruit Radar with territory truth
The recruiting map pairs open territories with real production data (RETR and NMLS) and the borrower demand LoanM8 sees from routing (states and areas where M8 chat says "no licensed loan officer yet"). Recruiting goes where borrowers are already waiting, so the growth loop is driven by demand, not cold outreach.

### 5.10 The training loop
Every owner correction becomes training for M8:
- a corrected M8 summary
- a rejected text draft
- a reviewed call

These become suggested additions to `/mlo/training`, and the owner approves them with one tap. M8 gets better at *this* loan officer's voice and rules every week, with the owner in control.

---

## 6. Architecture

- **Same repo and stack:** Next.js 15 App Router, React 19 and TypeScript strict.
  - The admin lives under `/mlo` (with its own auth), growing into real accounts.
  - Move it to a subdomain (`desk.loanm8.com`) once multi-tenant accounts exist.
- **Accounts:**
  - real sign-in with passkeys plus email magic links, replacing HTTP Basic
  - roles: owner, team lead, loan officer, assistant
  - tenant = sponsoring brokerage (`lib/pricing/tenants.ts`); seats = loan officers
- **Database:** Neon Postgres (already connected) with row-level security per tenant and loan officer.
  - Core tables: `contacts`, `contact_channels`, `consents` (append-only), `touches`, `calls`, `messages`, `plays`, `play_runs`, `agents`, `agent_events`, `loans`, `loan_milestones`, `co_marketing_ledger`, `ownership_plans`, `ownership_grants`, `audit_log`, `state_rules`.
- **Jobs:** a durable queue (Upstash QStash or Vercel Queues) for imports, plays, call scheduling and webhook processing. Every job is idempotent and retried.
- **Messaging:** Twilio or Telnyx for 10DLC SMS, voice and number provisioning (per-loan-officer numbers, local presence only if counsel approves). Resend for email (already used).
- **Voice agent:**
  - The phone carrier's media stream feeds Pipecat or LiveKit, which runs Gemini Live with M8's selected voice.
  - Tools are limited to the M8 tool set.
  - The guard (`lib/m8/guard.ts`) runs on every spoken reply before it's voiced; streaming sentence by sentence is already built in C18.
  - Barge-in, voicemail detection and conference transfer are part of the runtime.
- **The send gate:** one server module, the only way any message or call leaves. It applies consent, DNC, quiet hours, caps, licensing and recording rules, logs the decision, and fails closed.
- **Connectors:** an adapter interface (`connectors/arive`, `encompass`, `blend`, `retr`, `csv`), each mapping into the core tables. Webhooks are verified (signatures) and stored raw for replay.
- **Security:** encryption, the audit log, no borrower data in logs, an incident runbook, and a vendor list for the GLBA safeguards rule [COUNSEL].

---

## 7. Build order (patches, each signed off by the owner)

**Phase 1 is the foundation, and nothing else starts before it:**
- **D1 Accounts and roles.** Replace Basic auth with real sign-in, keeping `/mlo`.
- **D2 Contacts and CSV import,** with consent columns, dedupe, phone check, state and the relationship-only default.
- **D3 Send gate and state rules table.** Every channel goes through it; unit-tested against the §2 rules.
- **D4 Conversations:** texting (10DLC registration flow), email, the inbox, opt-out handling on every channel.

**Phase 2 adds the day:**
- **D5 Today screen** with ranking and reasons.
- **D6 POS sync:** ARIVE first (webhooks or Zapier), with the milestone guardian.
- **D7 Plays gallery:** five plays, approve-to-send by default.

**Phase 3 adds M8 on the phone:**
- **D8 Voice runtime:** phone carrier, Pipecat or LiveKit, and Gemini Live, under the guard. Internal test calls only.
- **D9 M8 check-in calls** behind the consent gate, with live transfer, summaries and the owner's sample review.

**Phase 4 covers agents and growth:**
- **D10 Agent Intel:** RETR connection or CSV, opportunities and meeting prep.
- **D11 Listing-to-buyer kit and co-marketing ledger.**
- **D12 Recruiting:** territory map, package page, ownership ledger. Ships only after counsel approves the plan documents.

**Phase 5, the new ideas:** consent passport, refi ripeness, rate watch, voice stand-up, Second Look for agents, Recruit Radar, the training loop. Each is its own patch.

**Every patch must have:**
- tests (the send gate's tests are the most important in the repo)
- `npm run verify`
- a PATCHLOG entry
- a phone and desktop check
- an accessibility check (keyboard, screen reader, contrast)
- a red-team case for anything M8 says or does

---

## 8. Questions for the owner before D1

1. Which **phone carrier**? Twilio (most documented with Gemini Live) or Telnyx (lower cost, owns its network).
2. **RETR:** do you have a subscription? Will RETR give LoanM8 partner API access, or do we start with CSV exports?
3. **POS order:** ARIVE first (your current system), then Encompass? Any others your recruits use?
4. **Property data vendor** for public records and equity estimates (ATTOM, CoreLogic or another).
5. **Counsel:**
   - AI-call consent language
   - which check-ins count as marketing
   - voicemail policy
   - the state rules table
   - the recruiting and ownership structure and its securities filing
   - the co-marketing ledger method
   - retention periods for call transcripts
6. **Pricing** for loan officers who join (seat price, what's included) and whether solo loan officers outside the ownership plan can subscribe.
7. Should **M8 call under each loan officer's own number and name**, or as LoanM8 with the loan officer named?

---

## 9. Sources (research, 2026-11-18)

Vendor and partner pages are marketing claims. Legal sources are
commentary, not advice: confirm everything with counsel.

- RETR: [what is RETR](https://kb.retr.app/what-is-retr), [data available](https://kb.retr.app/what-data-is-available-on-retr), [data freshness](https://kb.retr.app/data-accuracy-missing-transactions-and-loans), [retr.app](https://retr.app), [HousingWire profile](https://housingwire.com/company-profile/retr/), [OptifiNow integration](https://www.destinationcrm.com/Articles/CRM-News/CRM-Across-the-Wire/OptifiNow-Integrates-with-RETR-175654.aspx), [MloFlo integration](https://mloflo.com/?p=5690), [Total Expert partner](https://www.totalexpert.com/partners/retr), [Homebot vs RETR](https://homebot.ai/vs/homebot-vs-retr)
- Bonzo and CRMs: [Bonzo demo](https://demo.getbonzo.com/close-more-deals-1-1), [Bonzo pricing review](https://prospeo.io/s/bonzo-pricing-reviews-pros-and-cons), [Shape vs Bonzo](https://setshape.com/compare/bonzo-alternatives), [Shape vs Jungo](https://setshape.com/compare/jungo-alternatives), [BNTouch switching from Bonzo](https://bntouch.com/switching-from-bonzo/), [2026 mortgage CRMs](https://www.bankingbridge.com/post/2026s-top-8-mortgage-crms), [LeadPops 2026 CRMs](https://leadpops.com/blog/best-mortgage-crms-2026), [Bonzo integrations](https://intercom.help/bonzo-help-center/en/articles/9390198-integrations-101)
- POS and LOS: [ARIVE Zapier](https://support.arive.com/support/solutions/articles/61000312645-how-does-zapier-integration-work-), [Empower LO on ARIVE webhooks](https://empowerlo.com/faqs/arive-integration), [Bonzo ARIVE](https://support.getbonzo.com/hc/en-us/articles/21542576428946), [Encompass webhooks](https://developer.icemortgagetechnology.com/developer-connect/reference/webhook), [Blend loan updates](https://help.blend.com/support/solutions/articles/156000371700-loan-updates), [Floify Encompass sync](https://help.floify.com/en/articles/15141079-encompass-third-party-recipient-sync)
- Google voice: [Gemini Live API (Vertex)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api), [Gemini Live with Twilio](https://dev.to/googleai/add-telephony-to-a-gemini-live-agent-with-twilio-1elc), [Pipecat Gemini Live](https://docs.pipecat.ai/guides/features/gemini-live), [Plivo with Pipecat](https://www.plivo.com/docs/voice-agents/audio-streaming/integration-guides/pipecat/gemini-live.md), [FreeSWITCH with ADK](https://medium.com/google-cloud/gemini-live-part-1-building-a-low-latency-telephone-voice-agent-with-freeswitch-and-adk-agents-ceafd209f017)
- TCPA and texting: [FCC AI-voice ruling (Orrick)](https://www.orrick.com/en/Insights/2024/02/Did-the-FCC-Really-Ban-AI-Generated-Voice-Calls-No-But-Restrictions-Apply), [Womble on the ruling](https://www.womblebonddickinson.com/us/insights/blogs/fcc-adopts-declaratory-ruling-confirming-ai-voice-calls-are-subject-tcpa-takes), [revocation rule effective April 2025 (Kelley Drye)](https://kelleydrye.com/viewpoints/blogs/ad-law-access/fcc-sets-effective-date-for-tcpa-reasonable-consent-revocation-rules), [one-to-one rule vacated (Kelley Drye)](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/eleventh-circuit-vacates-tcpa-11-consent-rule), [10DLC (Faegre Drinker)](https://www.faegredrinker.com/en/insights/publications/2025/6/launching-text-campaigns-ins-outs-of-10dlc-registration), [state TCPA updates (ByteBack)](https://www.bytebacklaw.com/2026/07/looking-back-on-the-last-year-of-state-level-tcpa-updates/), [Florida FTSA amendment (Manatt)](https://www.manatt.com/insights/newsletters/tcpa-connect/florida-amends-ftsa), [October 2026 FCC change (DLA Piper, not opened: blocked here)](https://www.dlapiper.com/en-am/insights/publications/2026/10/fcc-tcpa-rule)
- Trigger leads: [NAMB on the ban](https://www.namb.org/understanding-the-trigger-leads-ban), [Hunton on HPPA](https://www.hunton.com/privacy-and-information-security-law/homebuyers-privacy-protection-act-amends-fcra), [ban in effect (RISMedia)](https://ace.rismedia.com/2026/03/05/trigger-lead-practical-ban-in-effect/)
- RESPA: [Mayer Brown on 2023 enforcement](https://www.mayerbrown.com/en/insights/publications/2023/08/respa-enforcement-is-back-the-cfpb-takes-aim-at-marketing-and-promotional-activities), [WBK on consent orders](https://thewbkfirm.com/industry/cfpb-issues-respa-consent-orders-against-mortgage-company-and-real-estate-company-over-event-tickets-msas-and-online-subscriptions), [NAR on RESPA](https://nar.realtor/respa)
- Loan officer pay: [CFPB 2013 final rule](https://files.consumerfinance.gov/f/201301_cfpb_final-rule_loan-originator-compensation.pdf), [recruiting bonus commentary](https://mortgage-faqs.blogspot.com/2018/08/bonus-for-loan-officers-recruitment-of.html), [10% rule discussion](https://bankersonline.com/forum/ubbthreads.php/topics/1821104/too-confused-prohibited-vs-10-percent-limit), [Floify on equity plans](https://floify.com/blog/6-ways-mortgage-loan-officer-compensation)
