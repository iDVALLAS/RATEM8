# Competitor deep dive: Broker Marketplace, Viato, Bonzo (2026-11-18)

Read from each company's own public pages on 2026-11-18 (fetched through
the session proxy): the Broker Marketplace demo, features and pricing
pages; Viato's home, platform, pricing and two product posts; Bonzo's
home and pricing pages. Vendor claims are their own and unverified.
Competitor comparisons quoted by one vendor about another are marked as
such.

## 1. What each one is

### Broker Marketplace (broker-marketplace.com)

A marketing and "database mining" suite for loan officers, not a CRM
first.
- **Price:** one plan at $249 a month ($199 annual), with a 7-day trial.
  RETR is a $100 a month add-on.
- **Tools:** the demo lists 37, each with short videos:
  - **Marketing:** Social Genie (auto-posted rate cards and market videos,
    with a preview queue first), Design Studio, AI Website Builder,
    Reachly Video (trackable personal videos), Market Pulse newsletters,
    Research AI podcasts, a course hub, and email and text templates.
  - **Realtor partners:** invites and co-branding, Open House Genie (QR
    sign-in flyers with buydown and payment estimates), Realtor Bot, HomeAI
    and a full CMA, Property 360, a Homes search portal, Listings Finder
    (expired, FSBO and distressed listings with owner contact info), and
    AirSignal (short-term-rental cash flow).
  - **Past clients:** Clients import, Refi Finder (daily morning report
    and rate-drop alerts on the book), Lead Lens (likely-to-refinance,
    tap-equity or sell scores "trained on 150M+ loan records"), and
    Production IQ (RETR-powered LO and realtor production lookups).
  - **Loan tools:**
    - LoanSight (recorded loan comparison presentations)
    - branded soft-pull credit reports, which website visitors can pull
      themselves
    - an income calculator and 7 calculators (mortgage, refinance, net
      proceeds, buydown, DSCR, FHA Streamline, VA IRRRL)
    - AUS Assist (turns underwriting findings into an action plan)
    - Broker Bot (scenario matching across "240+ wholesale lenders")
    - Guideline Updates (agency changes, in plain English)
    - Appraisal Buddy (reconsideration-of-value prep)
    - QuickCondo (FHA and VA condo approvals by address)
    - Credit Repair Analyzer
    - Swift Sign e-signature and a PDF editor
  - **Platform:** an assistant (Homi), an academy, a community forum,
    feature voting, integrations (LOS, CRM, Zapier, webhooks, MCP-style AI
    assistants), custom domains, a mobile app, and "Refer and Earn" for
    referring other loan officers.
- **Pitch:** "the stack you'd otherwise buy separately costs about $1,043 a
  month."

### Viato (viato.ai)

A mortgage CRM, free to start (open beta). It claims "1,500+ LOs". Paid
support is $49 a month per LO, plus usage fees: about $0.03 a text
segment, about $0.0255 a call minute, and $97 a month for a "Viato Phone"
line.
- **Leads in:** forms, webhooks and named lead vendors (LendingTree,
  Zillow, Bankrate, LowerMyBills, LeadPoint and others), with auto-assign
  by branch or team and source tracking.
- **Conversation:** a unified inbox of email (Gmail and Outlook), SMS and
  iMessage from "your Viato Phone number", group threads with borrower and
  realtor, calls through Twilio, RingCentral or Viato Phone, and recorded,
  transcribed and summarised calls that create tasks.
- **Automation:** triggers on lead status, dates, tags and forms. If/then
  conditions. Multi-step chains of texts, emails, tasks and tags. Pipeline
  stage drives follow-up ("text the borrower the moment the loan hits
  Clear to Close", "alert your referral partner the day their client's
  loan funds").
- **LOS:** two-way Arive and LendingPad sync. Statuses map to the LO's own
  stages; loan amount, rate, APR, LTV, credit, dates, milestones and
  notes come across; a scheduled reconciliation sweep runs. They can push
  a new loan from the CRM into the LOS. UWM conditions show live.
- **AI ("Super Agent"):**
  - plain-English commands that take action ("text Maria her pre-approval
    and set a follow-up Thursday")
  - a "Brain" of pipeline data plus the LO's own docs
  - scheduled "Jobs" ("every weekday at 7am text me my new leads and the
    files that need a touch")
  - "Skills" (a playbook taught once)
  - an MCP marketplace, web research and browser use
  - Voice AI agents that place and answer calls
  - a 1003 (Fannie 3.4) generated from a call
- **Power dialer:** rings up to three contacts at once, with automatic
  voicemail drop; "Do-Not-Disturb contacts are skipped".
- **Everyday features:** reporting with points, streaks and leaderboards;
  Kanban, list and calendar tasks; booking pages; custom fields;
  handwritten notes (coming soon). It "sends contacts and closed loans
  into Broker Marketplace".
- **Its own comparison table** (Oct 2026): Bonzo $150 a seat; several
  "LO CRMs" are GoHighLevel resellers at $197–$297 a month.

### Bonzo (getbonzo.com)

"Conversation software": texting-first follow-up.
- **Price:** Solo $150 a seat a month; Small team and Enterprise are
  custom.
- **Add-on:** MonitorBase (credit and licensing trigger alerts on past
  clients).
- **Features:** "full telephony" (SMS, MMS, video, email, voicemail drops,
  calling), a campaign builder with "over 20 pre-written, proven campaign
  templates", segmenting by loan type, stage, credit score and prospect
  type, birthday, refinance-reminder and review-request messages after
  closing, "My MMI Data" (past loans, refinance-ready borrowers), a
  pipeline with forecasting, partner management with co-branded
  collateral, automatic logging "for audit readiness", team impersonation,
  and Zapier, Zillow, Bankrate and LendingTree integrations.
- **Its own number:** a "Bonzo Business" number that forwards.
- **Gaps:** competitors say it lacks built-in LOS sync, VoIP and a 1003
  portal. That claim comes from Shape and BNTouch marketing, so weigh it
  accordingly.

## 2. Where Command Center already stands

| Their feature | Command Center today |
|---|---|
| CSV import with mapping (all three) | D2: import wizard, provenance, prior-employer hold |
| Texting, inbox (Bonzo, Viato) | D4: Twilio, inbox, platform-wide opt-out, signature |
| LOS sync (Viato) | D7: ARIVE-style webhook, milestone guardian (learned pace) |
| AI teammate (Viato Super Agent) | D8/D8.1: the Concierge (drafts, reminders, kept memory, Ask), with lanes and guards none of them describe |
| Who to call today (BM Refi Finder, Bonzo MMI) | D5: Today, ranked with reasons |
| Call scripts | D9: per-contact AI scripts with compliance notes written in code (none of the three has this) |
| Compliance (Viato "DND skipped", Bonzo "audit logging") | D3: the send gate (permission strength, DNC within 31 days, caps, quiet hours in every zone of the state, licensing), consent log, audit, and the D8.1 red team |
| Calculators (BM) | Public `/calculators`: affordability, points break-even, refinance break-even, rent vs buy, temporary buydown |

## 3. What to take, and what not to

**Take (built in D10–D12):**

1. **Milestone updates and partner updates** (Viato: "text the borrower
   the moment the loan hits Clear to Close"; "alert your referral partner
   the day their client's loan funds"). They are the most valuable
   automation for a working LO.
   - Built as recipes that fire once per loan stage from the loan system
     sync, and draft into the approval desk.
   - Partner updates only go out when the borrower has said their agent
     may be kept updated (GLBA: the ledger's rule, "agent introductions
     only on a written, revocable client direction").
2. **Pre-built campaigns** (Bonzo's 20+ templates, Viato's flows),
   reshaped for compliance:
   - post-close check-ins, a welcome-and-permission ask for new contacts,
     and a 30-day "how's the house" check
   - every step a draft or a reminder
   - the gate checks at approval
   - no auto-send until counsel signs off
3. **Morning digest** (Viato "Jobs": "every weekday at 7am text me my new
   leads and the files that need a touch"; Broker Marketplace's Refi
   Finder "daily morning reports"). One email with Today, the drafts, the
   people to answer personally, notes to keep and loans needing a touch.
   - It has no rates or client words (email is less protected than the
     app).
4. **Call session** (Viato's power dialer, done the compliant way): a
   one-at-a-time queue of the people worth calling today.
   - Each person has their script, a hand-dialed `tel:` link and one-tap
     outcomes.
   - People the gate blocks are skipped, with the reason shown.
   - **Not** multi-line auto-dialing. FCC abandonment rules apply to
     predictive dialers (47 CFR 64.1200(a)(7)), simultaneous ringing makes
     dropped "hello?" calls, and automatic voicemail drops are
     prerecorded messages that need prior express written consent for
     marketing.
5. **Refi watch** (Broker Marketplace Refi Finder, Bonzo "refinance-ready
   borrowers"). For the LO's eyes only:
   - past clients whose note rate sits above today's priced example
   - an estimated balance from their own loan amount and close date
   - the estimated principal-and-interest difference and months to break
     even for a closing-cost estimate the LO enters
   - always labelled an estimate, with "price their real scenario first"

**Later, worth doing:**
- **Lead-vendor intake webhooks** (Viato): a per-LO key like the pipeline
  key. Each vendor's consent language would be stored as the evidence, and
  counsel would review each vendor's TCPA consent wording.
- **"Tell your Concierge"** (Super Agent commands that act). Plain-English
  requests would become drafts and reminders that still need approval.
- **Post-call dictation** (Viato call intelligence, the spec's §4.6). The
  LO's own voice memo would become notes, reminders and a follow-up draft,
  with no client audio.
- **Partner co-branding and an agent portal** (Broker Marketplace, Bonzo).
  Needs a RESPA 8 review of anything of value given to agents.
- **Guideline-change digests** (Broker Marketplace). Needs a licensed feed,
  or the agency announcement pages read by hand.

**Don't take:**
- **Viato's** AI voice agents placing calls to clients: the FCC treats AI
  voices as artificial voice, so it needs prior express written consent,
  and California's ADAD is unresolved (ledger §A, §B). Also not: the
  triple-line power dialer and automatic voicemail drops (above), or
  iMessage from a personal number (no carrier registration, no opt-out
  infrastructure, and Apple's terms bar bulk commercial use).
- **Broker Marketplace:**
  - Listings Finder's owner contact info and Lead Lens "likely to" scores
    on strangers: cold outreach to bought data, plus FCRA and trigger-lead
    exposure (HPPA, March 2026), which the ledger blocks.
  - Production IQ on RETR data: RETR's 2026-09-17 terms bar AI and
    automated processes.
  - Website visitors pulling soft credit reports under the LO's name:
    FCRA permissible-purpose and consumer-report reseller terms.
  - "Refer and Earn" for referring loan officers: our recruiting rewards
    are subscription and tenure only, and that program would need review.
- **Bonzo:** GIF-and-emoji "fun" campaigns, which clash with our voice.
  Review requests only once counsel has cleared the testimonial rules.

## 4. The pricing context

- Broker Marketplace sells everything for $249 a month.
- Viato gives the CRM away and charges for usage and support.
- Bonzo charges $150 a seat.
- Command Center's answer is ownership. The co-op seat is priced against
  these numbers, and its edge is what none of them offers:
  - a gate that proves every message was allowed
  - an AI that is provably safe
  - patronage refunds to the loan officers who use it

## Sources

- https://broker-marketplace.com/demo?tool=overview&clip=2
- https://broker-marketplace.com/features
- https://broker-marketplace.com/pricing
- https://www.viato.ai/
- https://www.viato.ai/platform
- https://www.viato.ai/pricing
- https://www.viato.ai/news/meet-super-agent-ai-teammate-for-loan-officers
- https://www.viato.ai/news/los-integration-two-way-sync-mortgage-crm
- https://getbonzo.com/
- https://getbonzo.com/pricing
