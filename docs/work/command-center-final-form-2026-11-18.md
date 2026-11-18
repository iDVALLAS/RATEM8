<!--
The "final form" design for Command Center, the MLO-owned back-end
platform (owner, 2026-11-18: "the first platform that MLOs will get a stake
in versus large companies"). Produced by an overnight research run: eight
market surveys, rounds of eight idea lenses, three adversarial reviewers per
round (compliance, novelty, economics), then a draft, a hostile critique and
a revision. Legal and financial points are research, not advice: every one
needs counsel. Raw survivors and the critique are in the companion files.
-->

# Command Center: the final plan

*Prepared 2026-11-18 for the founder and revised the same day after a hostile review. This is a plan, not legal advice. Anything marked **[COUNSEL]** needs a lawyer's sign-off before it ships. Anything marked **[OWNER]** needs the founder's decision.*

**How much of this is verified.**
- The market facts come from six research passes run on 2026-11-18. Most vendor facts come from search-result snippets of the cited pages, not full readings. Several hosts were blocked in those sessions: retr.app's knowledge base, ecfr.gov, consumerfinance.gov, the Fannie and Freddie guides, law.cornell.edu and sec.gov.
- The regulatory and homeowner-lifecycle passes ran after the search budget was used up. Their legal points come from model knowledge (cutoff June 2026).
- **This revision ran no new web checks.** The run's search budget (200 searches) was spent. Direct fetches failed because `app.leg.wa.gov`, `www.consumerfinance.gov` and `www.ecfr.gov` are blocked in this session, and someone has to allow them before these points are re-checked. Every legal point the review added comes from model knowledge and carries a confidence label: HIGH, MED or LOW.
- **Repo points were checked in the code:**
  - `lib/messaging/service.ts` `handleInbound`
  - `lib/send-gate/rules.ts` `DEFAULT_RULE`
  - the EBR line in `lib/send-gate/gate.ts`
  - the "one originator per service area" copy in `lib/copy.ts`
- Vendor claims (users, results, prices) are labelled as vendor claims. Get a quote to confirm each price before anyone relies on it.
- **Competitor criticisms are for internal use only.** Several rest on a few reviews or on unverified facts. None of them goes into public copy until it has a dated primary source and a legal review, because comparative claims carry Lanham Act §43(a) and state deceptive-practices risk.

---

## 1. The thesis

**What it is.** Command Center is the back office a licensed loan officer runs their business from. It covers contacts, texting, email, AI voice, agent relationships, loan status, recruiting and compliance. It is its own platform. LoanM8, the consumer site with M8, is the first front end that plugs into it. Any broker, lender or loan officer in the country can run on it, under a sponsoring company as licensing requires.

**Why it can become the standard.** It rests on four things. No competitor we surveyed offers all four, though that survey came mostly from search snippets.

1. **It is designed to have no conflict of interest.** These are ownership and business-model facts, stated internally:
   - Bonzo was acquired by MMI, a data vendor. HousingWire reported the deal. Whether MMI still sells credit-based alerts after the HPPA is **unverified**.
   - Surefire is owned by ICE, the LOS vendor.
   - Total Expert, Jungo and Salesforce are licensed to institutions, not to the loan officer.
   - UWM's AI (Mia) runs a broker's past clients through one wholesaler's system.

   An MLO-governed platform can publish a binding data charter:
   - no lead is ever sold
   - no aggregate data is licensed out
   - a departing loan officer's contacts are never handed to someone else
   - no consumer-report data is ever taken in

   The charter goes into the certificate of incorporation, so only a member vote can change it (§3). Customer contracts carry it as a covenant members can enforce. A competitor can't copy that without changing who controls it.

2. **Compliance is built into how it works, not added on.**
   - Every text, call and email passes one send gate (built in D3; fixes due in D6 and D7).
   - Every AI sentence that could mention a rate is checked before it is spoken.
   - Every consent has proof attached.

   The 2026 lawsuit climate supports this, but the figures below are **unverified**. Check them before they go into copy:
   - NMN reported 11 mortgage TCPA suits in about two months.
   - TCPAWorld reported April 2026 TCPA filings up 40% on the prior year.
   - There are reported AI-voice class actions against Mortgage One Funding and Mr. Cooper.
   - Inman reported an AI-voice suit where the AI kept selling after the person said "no".

3. **The loan officer's contacts follow them. The right to call those contacts does not.** Enterprise CRMs keep the book when the loan officer leaves. Here the seat and the loan officer's personal contacts can follow them, within limits:
   - **Personal contacts only.** These are contacts not drawn from loan files.
   - **Full portability only between sponsors who sign the Portable Seat Addendum.** Everywhere else, only personal contacts move.
   - **Consent records and conversation history are copied, never moved.** Both sponsors keep a copy, because those records are the old sponsor's books and records and its evidence in any TCPA suit.
   - **Loan-file contacts stay with the old sponsor.** Customer lists drawn from loan files are its nonpublic personal information under GLBA.
   - **The right to call does not transfer.** An established business relationship (EBR) belongs to the company the loan closed with. After a sponsor change, the loan officer can't make telemarketing calls to their past clients under EBR. Each client has to give fresh consent through a lawful lane. Even before a move, EBR only exempts a call from the do-not-call rules. It never stands in for the consent required for artificial-voice or autodialed calls (47 CFR 64.1200(a) versus (c)(2), HIGH).

4. **Any member benefit is designed to have nothing to do with loans.** Every ownership program surveyed ties equity to transactions or recruiting:
   - eXp: 5% of commissions taken as stock
   - One Real: RSUs gated on $20M production or a recruit closing
   - reAlpha: RSUs gated on production and employment
   - NEXA: 10 bps of each recruit's loans plus servicing cash flow
   - Fathom: stock per closing
   - Epique: stock for a first sale

   Command Center's member benefits come only from paid subscription spend. They go to **whoever pays for the seat**. The design aims to avoid Reg Z loan-originator compensation and RESPA Section 8 problems. Whether it succeeds is a **[COUNSEL]** question, not a settled fact.

**What this means for an individual loan officer, stated plainly.**
- **If you pay for your own seat** (a broker-owner, or a loan officer whose sponsor lets them pay), member benefits come to you. Those benefits are a member vote and patronage refunds or credits that lower your bill.
- **If your employer pays** (a typical W-2 retail loan officer), the benefit goes to your employer. You get nothing personally unless your employer passes value on through its own Reg Z-compliant plan. This is deliberate: a personal stake from a vendor your employer buys from is exactly what state "paid only by your sponsor" rules may forbid. It could also look like commercial bribery in your employer's vendor review.
- **Ownership is not the reason to join.** The review's math (§3) shows a tenure-only stake is worth little to any one person. Top producers choose on fast pricing, LOS sync, a mobile app and their own lead flow. The stake is a tiebreaker. Lead with what is real:
  - a member veto over the data charter
  - a cap on price increases
  - contact portability within the limits above
  - patronage refunds that lower the bill
- **eXp and Real pay more than this ever will,** because they pay through production. Mortgage comp rules make that illegal here. Say so plainly.

**Copy rule until counsel picks a structure:** the words "stake", "ownership", "equity", "shares", "units" and "owner" stay off every recruiting surface. Add them to `check:copy` for recruiting pages (§10, D6). Paying a subscription in exchange for units is likely a sale of securities (§3), and advertising a stake on a public page can count as general solicitation.

**Why a loan officer picks this over a big company's tools** (positioning; competitor points are internal until substantiated):
- **One published price, month to month, cancellable in the app.** Internally: Capterra has a few reviews alleging Shape kept billing after cancellation. Bonzo's help center lists per-integration fees. Structurely is reported to charge credits plus onboarding.
- **Their personal contacts stay theirs,** within the limits above.
- **AI voice at a solo loan officer's price, used only on consented clients and on inbound calls.** Sela, Flair and Total Expert sell AI voice to enterprises behind sales demos.
- **A real say in the platform,** explained honestly: what members can vote on, where each seat dollar goes, and that any units, if counsel ever approves them, "may be worth nothing".

**What we refuse to build, and say so publicly:**
- dialing purchased or aged lead lists
- credit trigger leads. Since March 2026 the HPPA has **restricted** these: it still allows them with the consumer's consent or an existing mortgage, servicing or deposit relationship (MED-HIGH). We refuse them even where an exception would apply.
- skip-traced phone numbers
- paying agents for referrals
- earnings claims to recruits
- exclusive territories among members (§3)

---

## 2. The market today

*Internal only. The "main gap" column is positioning, not public copy. Allegations from reviews stay internal unless they are substantiated and legally reviewed.*

| Player | What they sell | Price (source type) | Main gap we exploit | Source |
|---|---|---|---|---|
| Bonzo (MMI) | Texting-first CRM, AI responder, MMI data, monitoring alerts | Solo ~$150/seat/mo (review sites); ARIVE integration $100 setup + $25/mo (Bonzo help center) | Capterra 3/5 (11 reviews, a small sample); owned by a data vendor (MMI's current alert products after the HPPA are unverified); no AI voice of its own found | housingwire.com/articles/mmi-acquires-crm-platform-bonzo; support.getbonzo.com/.../21542576428946 |
| Shape | CRM + dialer + POS + AI voice; native mobile app | Core $119/user/mo; voice only in quote-only tiers | A few Capterra reviews allege billing after cancellation (unsubstantiated); voice marketed toward aged leads | g2.com/products/shape-software-shape-mortgage-crm; capterra.co.uk/reviews/173673/setshape |
| Total Expert | Enterprise CRM, Customer IQ, AI Sales Assistant | Not published | Licensed to institutions; its page says the AI discloses itself "when required or if prompted"; credit enrichment on its roadmap | totalexpert.com/features/ai-sales-assistant |
| Jungo (Salesforce) | Configurable CRM | ~$119–149 + Salesforce license (third party) | Ease-of-use score 3.4; needs an admin; cost | capterra.com/p/182058 |
| BNTouch | All-in-one CRM with MAIA AI | $165 single / $95 per seat for 2–10 (vendor) | No AI voice found | bntouch.com/pricing |
| Surefire (ICE) | Marketing CRM tied to Encompass | Quote | Built for Encompass; the LOS vendor owns it | icemortgagetechnology.com/products/surefire-mortgage-crm |
| Salesforce FSC | General finance CRM | $325–700/user/mo + $150 Agentforce | Priced and staffed for institutions | salesforce.com/financial-services/sales-pricing |
| Homebot | Equity digests, Partner Intel | $125/$225/$300/mo + $100 setup | One-way email; lender-sponsored $25 agent seats are a RESPA-sensitive pattern (our reading, not a finding) | homebot.ai/pricing |
| MloFlo | Low-cost CRM | $69.99–199.99 (third party) | One review alleges leads went to other loan officers after a cancellation (single review, unsubstantiated) | capterra.com/p/265185/mloflo |
| AI voice: Sela, Flair, Structurely, Veritus | Outbound and inbound AI calling | Sela and Flair not published; Structurely $499–999 + credits (third party) | Marketed for dialing at volume; we found no published consent method (absence of evidence, not proof). The figures in a HousingWire article on Flair work out to about 3.6% of dials answered (our arithmetic) | housingwire.com/articles/west-capital-flair-ai-voice |
| UWM Mia | Free AI assistant for UWM brokers | Included | Tied to one wholesaler; we found no published consent script | housingwire.com/articles/uwm-mia-borrower-engagement |
| ARIVE (our LOS) | Broker LOS, POS, pricing engine, marketplace | Core $49.99; Pro needed for Zapier, at **$69.99 or $79.99 (unresolved: research passes disagree; confirm on arive.com/pricing)**; Non-Del $99.99/mo | No public API found; Zapier only, limited to each loan officer's own loans; no third-party CRM on its partner page | arive.com/pricing; arive.com/integration-partners |
| Other broker LOSs: LendingPad, Byte, MeridianLink, Calyx | Broker and lender LOS | Not researched | Not yet covered by the plan; see §6 | Not yet researched |
| Co-ops (Lenders One, CUSOs) | Member-owned buying groups | Not public | Members are companies, not individual loan officers | (survey: observer-reporter Lenders One release) |

**Data providers matter too.**
- **RETR** (agent data, $199/mo) updated its Terms of Service on 2026-09-17. They ban using its data with AI, rules engines or automated processes, which conflicts with Agent Intel as first written.
- **Model Match** ($49–399/mo) is AI-friendly, but its licence is limited to internal business purposes and bars "marketing or solicitation purposes". Get its position in writing.
- **NMLS Consumer Access** terms forbid using it for solicitation or bulk monitoring, which conflicts with Recruit Radar as first written.

**Corrections to the build plan and the built code:**
- **Inbound texts leak across tenants (repo bug, checked).** `handleInbound` in `lib/messaging/service.ts` ignores the Twilio `To` number and stores each inbound body on every contact with that phone number, across every loan officer. A START calls `ts.clear(from)`, which wipes the network-wide opt-out. So a START sent to company A cancels a STOP given to company B. That fails the duty to honor revocation under the TCPA. It also shares nonpublic personal information across financial institutions, and Reg P 1016.11 limits a service provider's reuse of it. Fixed first, in D6.
- **The quiet-hours default breaks the plan's own binding rule (repo, checked).** Build prompt §2.1 says to default to 9 AM–8 PM. `DEFAULT_RULE` in `lib/send-gate/rules.ts` is 8 AM–8 PM. Change the default to 9–8 for every state now, not only Connecticut. Connecticut is reported at 9–8 for sales calls and texts (Public Act 23-98, MED).
- **The D3 gate grants EBR from any closed loan within 18 months (repo, checked).** Under the FCC rule an EBR belongs to the company the loan closed with, not to the loan officer, so a recruit's loans from a previous company don't carry over (47 CFR 64.1200(f)(5), HIGH, not opened). EBR also only exempts a call from do-not-call rules. It never satisfies artificial-voice or autodialer consent (HIGH). Fixed in D7.
- **10DLC has to be set up per sponsor (MED-HIGH).** D4 assumes one LoanM8 Messaging Service holding "your 10DLC number". The Campaign Registry and carrier rules require:
  - a brand for each legal sender (each sponsor)
  - a campaign for each use case
  - no sharing of numbers or campaigns across brands
  - "lead generation" campaigns get extra scrutiny

  Fix: Twilio ISV onboarding with a TrustHub secondary profile for each sponsor, and numbers assigned to each loan officer under their sponsor's brand. Each sponsor agreement must also say who keeps the number when a loan officer leaves (D8). Source: twilio.com/docs/messaging/compliance/a2p-10dlc (ISV section, not opened).
- **Floify does have outbound webhooks,** through a "Custom CRM Integration" that Floify Support approves (help.floify.com/en/articles/16300950). The plan said it didn't.
- **FCC Order 26-67** (adopted 2026-09-30) lets callers designate an exclusive revocation method. One source says it was published 2026-10-26 and takes effect 2026-11-25; another session couldn't confirm. Unverified. Our rule stays: honor any reasonable revocation, everywhere, immediately.

---

## 3. The ownership model

**Read this first.** The first draft led with "subscription months earn units". The review showed this probably doesn't work as drafted, for three reasons:
- Units earned by paying are likely a sale of securities with no exemption that fits.
- Personal units for sponsor-paid seats clash with state comp rules.
- An LLC breaks down for thousands of member-customers.

This revision leads with a cooperative and keeps units for a cash purchase lane. **[COUNSEL]** decides all of it.

### What the research rules out
- **Units handed out for a paid subscription (HIGH).** Under Securities Act §2(a)(3), giving out stock in exchange for something of value is a sale. The SEC's 1999 "free stock" enforcement cases took this view (Simplystocks.com, Web Works and others). A paid seat-month is value. No exemption fits the people this plan is for:
  - **Rule 506(c)** excludes non-accredited buyers, which is most rank-and-file loan officers.
  - **Rule 506(b)** is lost the moment a recruiting page advertises "a real ownership stake". That is general solicitation, even if the financials are gated.
  - **Reg CF and Reg A** are for cash offerings through a funding portal or an offering circular, not tenure grants.
  - **Rule 701** covers employees and consultants providing real services. Subscribing loan officers are customers. The SEC's 2020 "platform worker" proposal (Release 33-10892) was never adopted (Foley, Sept 2026).
- **Personal stakes when a sponsor pays (MED-HIGH).** State "paid only by your sponsor" rules may forbid anything of value from a non-sponsor to an active loan officer. Reported examples:
  - Texas SML guidance on paying through the sponsor
  - Cal. B&P 10137 for loan officers licensed through the DRE
  - Arizona's bar on paying unlicensed people

  Washington (RCW 31.04) and Oregon (ORS 86A) are **not checked**; `app.leg.wa.gov` was blocked.
- **Anything tied to loans.** Reg Z 1026.36(d) bans pay based on loan terms or proxies. Volume-based pay is allowed but risky.
- **An LLC for member-customers (MED-HIGH).**
  - It means a K-1 for every member, and possibly state filing nexus for each.
  - Any secondary market risks publicly-traded-partnership treatment under IRC §7704.
  - Profits interests (Rev. Proc. 93-27) are only for people who provide services, not for customers.

### Decide the funding model first [OWNER]

Strong member protections (a sale veto, a right of first offer, a dilution cap, a price cap) together rule out most priced venture rounds. Choose the funding model before the structure:
- **Bootstrap plus a Reg CF community round.** Fits Structure B with an A-style purchase lane.
- **Founding-sponsor strategic notes.** Sponsors lend or invest on a capped return with no governance control. **[COUNSEL]**: RESPA and conflicts, since sponsors are also customers.
- **Revenue-based financing.** Repaid from subscription revenue, no equity, no control.
- **Venture.** Possible only if the protections are cut back to the data charter and the steward. That is a real trade-off and the founder has to choose it knowingly.

The plan below assumes the first three. It does not assume venture.

### Three structures for counsel, in order

**Structure B (lead): a technology cooperative whose members are the payers of seats.**
- **Entity:** a cooperative corporation taxed under Subchapter T. No LLC.
- **Membership:** one nominal membership share per payer of record, at a fixed price with no expected appreciation, and one member one vote. Under *United Housing Foundation v. Forman* (1975), a share bought for use, with no expectation of profit, is likely not a security (MED; counsel must confirm for this design).
- **Who is a member:** whoever pays for seats.
  - A loan officer who pays for their own seat is a member personally.
  - A sponsor that pays seats is an institutional member, the way Lenders One works for companies. Its loan officers get nothing personally from the co-op.
- **Patronage refunds** are calculated only from each member's subscription spend (IRC Subchapter T) and paid to whoever paid for the seat, without exception. Patronage is by nature based on purchases, which fits "subscription only".
  - The default form is a credit on the next invoice, not cash.
  - **[COUNSEL]:** whether a patronage refund on a loan officer's *own* spend counts as a "thing of value" under each state's sponsor-only rule, or as a price reduction.
- **Voting:** a policy and roadmap council. Members may vote on the platform's own seat price (they are the buyers) and on the data charter. They never vote on their own loan pricing, comp, territories or lender terms.
- **Precedent:** Lenders One shows a mortgage co-op can reach scale. Its members originate about 20% of US mortgages, by its own unverified claim. Its members are companies and Altisource manages it, so no precedent with individual loan officers as members exists.
- **[COUNSEL]:**
  - Forman's application here
  - state co-op statutes and where to incorporate
  - whether a co-op can also run a Reg CF round for non-voting investment shares
  - patronage tax treatment and 1099-PATR reporting

**Structure A (secondary): a C-corp public benefit corporation with a cash purchase lane.**
- **Use this if** the founder needs outside equity, or counsel finds the co-op unworkable.
- **Entity:** a Delaware public benefit corporation (a C-corp). The data charter is written into the certificate as part of the public benefit purpose, or protected by a class vote.
- **No units for subscription months.** Tenure-earned units are dropped unless counsel finds an exemption that fits non-accredited customers. None is known.
- **Credits:** subscription credits go to the payer of record's invoice, the same as B. The platform never sends cash to a loan officer.
- **Purchase lane:** any subscribing loan officer or sponsor may buy units with their own money:
  - first through a **Reg CF community round** (up to $5M per 12 months; non-accredited investors allowed within limits)
  - later **Reg A Tier 2** (up to $75M) once the network is large
  - **Reg D 506(b)** only for accredited investors, and only if no recruiting page has advertised the offering
- **Recruiting firewall:** no recruiting page, ad or M8 reply mentions the offering. Offering materials live only on the funding portal or with verified offerees.

**Structure C: steward protections, added to A or B.**
- **Now:**
  - The data charter goes in the certificate or articles.
  - Customer contracts carry it as a covenant that members can enforce as third-party beneficiaries **[COUNSEL]**.
  - The privacy policy forbids transferring personal data, so any bankruptcy sale of that data triggers a consumer privacy ombudsman (11 U.S.C. §363(b)(1), §332, MED).
- **Now: an independent director or steward from day one,** not "later". This person is not a member or a sponsor and holds the casting vote on any conflict involving the founder.
- **Member protective provisions.** Members must vote on:
  - a sale or change of control. A 60-day right of first offer for a member buyout is optional, and the funding decision may require dropping it.
  - any change to the data charter
  - seat-price increases above a published cap (CPI plus itemized pass-through cost changes). This is the platform's own price to its buyers, not members' loan pricing.
  - removing the comp firewall
  - dilution above an annual cap (Structure A only; drop it if the funding model needs to)
- **Later** (at a priced round or before any sale): a purpose trust holding a golden voting share, as Patagonia did in 2022 (precedent from model knowledge).

### Show the math: why the stake is a tiebreaker
- Suppose a 20% member pool shared across 5,000 members. Each member holds about 0.004%.
- At a $20M valuation that is about **$800 per member**, after years of paying.
- A tenure-only stake pays a 200-loan producer the same as a part-timer. That is the price of staying clear of Reg Z.
- So the honest pitch is the vote, the charter, the price cap and the patronage refund, not wealth.

### Rules that apply to every structure
- **Payer of record, always.** Credits, patronage, any units and any vote go to whoever paid for the seat. Portable personal benefits exist only for loan officers who pay for their own seat.
- **Comp firewall:** the reward engine's database role can't read loan, pricing, pipeline, connector or commons tables. This is tested in CI.
- **No exclusive territories (MED-HIGH, antitrust).**
  - Today `/join` and `lib/copy.ts` say "One originator per service area. When an area has its originator, it is closed to new applicants", and CLAUDE.md §2 treats that as policy.
  - Once competing loan officers co-own or govern the platform that assigns exclusive areas among them, it looks like horizontal market allocation (*Topco*, 1972; *Palmer v. BRG*, 1990, per se illegal).
  - **[OWNER + COUNSEL]:** end territorial exclusivity before any member gets a vote, a share or a refund, or get a written antitrust opinion first. "No exclusive territories" goes on the never-list. The `/join` copy changes in D6.
- **Seat Truth, without biometrics.** A seat-month counts only if all of these hold:
  - **The sponsor attests to the person and to the NMLS ID.** For a broker-owner who is their own sponsor, a company officer attests and the NMLS ID is checked through an NMLS-authorized path, never Consumer Access sweeps.
  - **The license is active with that sponsor.**
  - **The seat is not paid for by the person's recruiter.**
  - **There is a minimum level of use that has nothing to do with loans.**
  - **No face match or other biometric.** Biometrics bring in Illinois BIPA, Texas CUBI, and Washington's My Health My Data Act, which counts biometric data as consumer health data and gives people a private right to sue (MED). Washington is the founder's home state.
- **Downturn keep-alive:** a low-cost seat that freezes accrual instead of forfeiting it. The book goes read-only. M8 never routes borrowers to an inactive license. Opt-outs are still honored.
- **Two-key suspension:**
  - Key 1: the platform can freeze sending immediately and narrowly, with a stated reason.
  - Key 2: ending a seat or any forfeiture needs written reasons, time to fix the problem, and the independent director's review. A peer panel comes once there are more than 100 members.
- **The founder's conflict.** The founder is a licensed loan officer who controls a platform holding rival loan officers' books. So:
  - Operator access to any tenant's data only through logged break-glass access, visible to that member.
  - The founder's own tenant runs under exactly the same rules as every other.
  - The founder's interest is disclosed on the routing screen.
  - The independent director handles founder conflicts.
- **Routing and RESPA 8(a) (MED).** If only paying seats receive LoanM8 borrowers, the seat fee can be characterized as a payment for referrals. Equal pricing with "no area premium" is not enough. So:
  - Price the seat at fair market value for software, with routing priced at zero.
  - Write down a routing policy that doesn't depend on holding a seat, or get a written counsel opinion. Either one is needed before LoanM8 routes a borrower to any loan officer other than the founder.
  - In assign states the founder owns the platform and also takes the default route. That raises affiliated-business and steering questions, so the founder's interest is disclosed on the routing screen.
  - The CFPB's 2023 advisory opinion on digital comparison-shopping platforms is reportedly on the May 2025 withdrawn-guidance list (unverified, host blocked). The statute (12 U.S.C. 2607) and *PHH* still apply.
- **Liquidity, in plain terms:** nothing at the start. A swap of units for credits at a yearly rate, cash tender windows and member-to-member transfers are all written as "may be offered" and stay off until counsel answers question 9:
  - **The swap is a standing issuer buyback.** It carries 10b-5 disclosure duties for the company, and a regular program may be a tender offer.
  - **The swap creates a balance-sheet liability.** It turns units into a prepaid subscription.
  - **Any member-to-member market** must run through a registered broker-dealer or alternative trading system, never the platform itself.
  - **Any company tender** follows Regulation 14E (open at least 20 business days).
- **The 12(g) holder count (HIGH).**
  - Units issued under Reg D get no 12(g) exclusion. More than $10M in assets plus either 2,000 holders of record or 500 non-accredited holders forces Exchange Act registration.
  - The Reg CF exclusion is conditional: a registered transfer agent, current annual reports, and total assets of $25M or less.
  - The Reg A Tier 2 exclusion needs a transfer agent, current reports, and either a public float under $75M or, with no float, annual revenue under $50M.
  - Plan for a registered transfer agent from the first unit. The D29 test checks these conditions alongside the counter.
- **Accounting and tax (MED-HIGH).**
  - Under ASC 606-10-32-25, credits, patronage-style credits and any units given to customers are consideration payable to a customer. They are booked as contra-revenue at fair value, so every grant reduces reported revenue. Budget for that in §7.
  - Equity a loan officer receives when someone else paid is likely taxable income to them, with 1099 reporting. The payer-of-record rule avoids most of this.
- **Honesty standard:**
  - No tiers, no downline, no earnings projections.
  - Each year a counsel-cleared report goes to members: where each seat dollar goes, renewal rates, runway, and data-charter compliance (zero leads sold).
  - Financials go only to members and verified offerees.
- **Agents never hold units or memberships.** Agent equity would raise RESPA 8(c)(4) affiliated-business questions.

### Questions for counsel (securities, mortgage, antitrust, tax, accounting)
1. **State comp rules.** For each of WA, OR, AZ, CA and TX: may a non-sponsor give a licensed loan officer anything of value (credits, patronage, units, contributor grants) for activity that isn't origination? Does a refund on the loan officer's own subscription spend count? Is sending all value to the payer of record enough?
2. **Reg Z.** Are subscription-based patronage or units "compensation" under 1026.36(d)? Are dividends or redemptions on purchased units bona fide returns on equity under comment 36(a)-5.vi? The CFPB small-entity guide has a Q&A on this; its answer text was not retrieved.
3. **Securities exemptions.** Does *Forman* make a nominal co-op membership share a non-security here? Does the 1999 free-stock line (sec.gov/litigation/admin/33-7720.txt) rule out any tenure-earned unit? Which exemption fits the cash purchase lane? What blue-sky filings does each state require? How do 12(g) counts treat each class?
4. **Contributor lane.** Is a contributor lane (units for real platform work, such as cited rule rows or red-team cases) a Rule 701 consultant grant, and does each state's comp rule allow it? Exclude anything that looks like recruiting.
5. **Co-op law and tax.** Which state co-op statute should we use? Is a Subchapter T patronage plan feasible for software subscriptions? How should 1099-PATR reporting work?
6. **Antitrust.**
   - Exclusive territories among member loan officers (*Topco*, *Palmer v. BRG*): end them, or get a written opinion first.
   - Buyer-group negotiation with vendors.
   - Member governance (*Sealy*, *Topco*, *American Needle*).
   - Confirm that members voting on the platform's own seat price is lawful buyer conduct, and that they never vote on their own loan pricing, comp, territories or lender terms.
7. **RESPA 8(a) and routing.**
   - Is a seat priced at software fair market value, with routing at zero, safe if routed borrowers go only to seat-holders?
   - What written routing policy, and what disclosure of the founder's interest in assign states, is required?
   - Does any change follow from the reported withdrawal of the 2023 advisory opinion?
8. **SEC petition.** Should the platform file a comment or petition with the SEC to revive a platform-participant rule, as Airbnb did in 2018? It is a low-cost long shot.
9. **Liquidity.** Does a unit-for-credit swap or a recurring tender create 10b-5, tender-offer (Reg 14E) or balance-sheet liability problems? Keep "may be offered" until answered.
10. **Tax and accounting.**
    - Should we use a C-corp PBC or a Subchapter T co-op?
    - What is the PTP risk (IRC §7704) of any transfer market?
    - What is the ASC 606 treatment of credits and grants?
    - What 1099 reporting applies when a third party pays?
11. **Privacy and records.**
    - May a pooled, hashed opt-out list be shared across sponsors under Reg P service-provider limits? A hash is still personal information.
    - What indemnity and litigation-hold terms belong in the Portable Seat Addendum, given DTSA lift-out suits will name the platform?
    - Will the bankruptcy ombudsman mechanism and the member-enforceable charter covenant hold up?

Sources (none re-opened in this revision):
- sec.gov/news/press-release/2020-273
- sec.gov/files/rules/final/2016/33-10075.pdf
- sec.gov/litigation/admin/33-7720.txt
- supreme.justia.com/cases/federal/us/421/837/ (Forman)
- foley.com/insights/publications/2026/09/is-the-gig-up...
- files.consumerfinance.gov/f/201301_cfpb_final-rule_loan-originator-compensation.pdf
- sml.texas.gov/.../Exam-Common-Violations-2025-11.03.2025.pdf
- california.public.law/codes/business_and_professions_code_section_10137
- azdfi.gov/.../SPS-LO 04.23.2021.pdf
- 12 U.S.C. 2607
- 11 U.S.C. 332 and 363

---

## 4. The product, module by module

Labels: **Built** = shipped. **Now** = the next two to three months. **Next** = after that. **Later** = needs scale, partners or counsel.

### 4.1 Foundation (Built, with fixes due now)
- **D1 Accounts and roles (Built):** sign-in by email link; owner, team lead, loan officer and assistant roles; an audit log.
  - **Add Now:** operator break-glass access, logged and shown to the member whose data was opened.
- **D2 Contacts and import (Built):** CSV read in the browser, column matching for common CRMs, a consent log per channel and purpose, a relationship-only default, list provenance, and holds on prior-employer lists.
  - **Add Now:** a "personal versus loan-file" provenance flag, which drives what can move on a sponsor change.
- **D3 Send gate (Built), with fixes due Now:**
  - **Default quiet hours 9 AM–8 PM for every state** (the code says 8–8; the binding rule says 9–8).
  - **Lawful Lanes:**
    - EBR is computed per company the loan closed with, and used only as a do-not-call exemption, never as consent for AI-voice or autodialed calls.
    - An inquiry starts a 3-month clock only when it is a real product question.
    - Lanes for email and mail.
    - A day-one call order sorted by which window closes first.
    - A check that the loan officer owns the phone number before porting it.
    - A clear screen after a sponsor change: "these contacts came with you; you need fresh consent to call them."
  - **State rows:** Connecticut 9–8; Virginia's 10-year STOP memory; Texas SB 140 (below).
  - **Rules become effective-dated rows,** each with a citation and a counsel status.
  - **Law as Tests:** counsel signs plain-English test cases, CI fails if the gate disagrees with counsel, and a rule change can be replayed against past decisions.
- **D4 Texting (Built), with a bug and a setup change due Now:**
  - **Built:** Twilio, signature-checked inbound messages, opt-outs, and line-type lookup.
  - **Bug fix (D6):**
    - Attribute each inbound message to a tenant and loan officer by its `To` number.
    - Never copy message bodies across tenants.
    - Keep the network opt-out as a one-way block on a hashed number **[COUNSEL on cross-sponsor sharing]**.
    - Let START lift a block only for the sender number or campaign it was sent to.
  - **10DLC per sponsor (D8):** each sponsor gets an ISV secondary profile, brand and campaign, and numbers are assigned per loan officer under that brand.
  - **Still missing:** the Reassigned Numbers Database check and automatic do-not-call scrubbing (D10).
- **D5 Today (Built):** ranked cards with reasons.
- **Now, added to the gate:**
  - **Hardship pause:** a borrower who says they're struggling gets 12 months with no marketing.
  - **Protective pause:** signs of coercion or exploitation stop automation, and a human takes over.
  - **Instruction Receipts:** "lock it", "I'm withdrawing" and "stop texting my wife" become dated receipts with an honest status and a human deadline.
  - **Complaint rules:** "how did you get my number" opens a case and a legal hold, and pauses the play.

**State laws to add as gate rows** (all from model knowledge, not re-checked):
- **Texas SB 140** (MED). Texts count as telephone solicitation. Sellers may need to register with the Texas Secretary of State and post security unless exempt. Texas marketing texts stay blocked until a registration or a counsel-confirmed exemption is recorded for that sponsor. Whether mortgage companies are exempt is unverified.
- **Utah AI Policy Act.** Regulated occupations must disclose AI interaction, and some must do so up front. This applies to M8 chat and voice for Utah residents, and the existing "AI disclosure first" rule likely covers it. Counsel to confirm.
- **California CCPA automated-decision rules.** Likely in force for "significant decisions" in financial services, with compliance dates in 2027. Ranking and routing must be checked against them.
- **Colorado AI Act.** Delayed to 2026-06-30; its later status is unverified.
- **Data-level GLBA exemptions.** Some state privacy laws exempt only GLBA-covered data, not GLBA-covered entities (reported for Oregon and Minnesota). That matters because the platform acts as a processor and holds data that may fall outside the exemption.

### 4.2 Consent and proof (Now to Next)
- **Consent passport with possession proof (Now):**
  - Marketing consent needs a texted YES or a typed code.
  - The exact disclosure text is stored as a hash.
  - Consent covers named sellers only, meaning the sponsor brand.
  - A sponsor change flags each consent for re-confirmation, by email or another lawful lane, never by text under the old consent.
- **Spoken consent (Next):** on inbound calls only, a scripted read-back with an audio hash and an instant written copy. A state table decides where a voice signature counts as written consent. The cheaper version ships first: "send the permission link while you're on the call".
- **Consent Archaeology (Now, revocations only):** the loan officer's own Android XML or Google Takeout message history is read in their browser. Old "stops" are found and blocked. Nothing else is uploaded.
- **Sunlight Receipts (Next):** "why did I get this?" links on the first message of each play and on the STOP confirmation, with a dispute button that freezes contact across the network. The Reassigned Numbers check runs before any receipt content is shown.
- **Witnessed Ledger (Next):** an append-only hash chain over consents and gate decisions, with a daily timestamp from an outside time-stamping authority. Sponsor witnesses come later. Never market it as "TCPA-proof".
- **Retention Clock (Next):** each record class is kept for the longest rule that applies (Reg Z 2 or 3 years, TSR 5 years, Reg B 25 months, HMDA, state books and records), with legal hold first. Opt-out hashes survive deletion.
- **Copy, don't move (Next, with the Portable Seat Addendum):** on a sponsor change, consent records and conversation history are copied to the new tenant and stay with the old sponsor. Both keep their evidence.

### 4.3 Conversations, email and plays (Now to Next)
- **Clean Sender email lane (Now):**
  - SPF, DKIM and DMARC on a sponsor-approved domain
  - list cleaning against the network unsubscribe list
  - a warm-up ramp
  - a complaint budget in the gate that pauses only that loan officer
  - one-click unsubscribe
- **Two-way Gmail and Outlook sync and logging (Next):** Microsoft Graph first, then Gmail after Google's restricted-scope assessment. Synced mail is logged to the contact and never grants marketing consent.
- **Plays gallery (Next):** five plays, each approved before it sends.
- **Video messages (Next):** recorded by the loan officer and sent through the same gate, with captions so there is a text equivalent. Any rate mentioned in the transcript is flagged by the Quote Ledger.
- **Churn Guard (Next):**
  - It blocks refinance outreach inside VA IRRRL or FHA streamline seasoning, the VA 36-month recoupment window, or the wholesaler's early-payoff window (a private table per tenant).
  - Every refinance gets a Benefit Record the borrower signs.
  - Questions the borrower starts are always answered.
- **Throughput Governor (Next):** the loan officer sets a weekly capacity. Above it, plays that create new demand slow down; service messages and inbound work never do. A learned pace comes after about 30 closed files.
- **Day Shape and Power Hour (Next):**
  - a time-blocked day built from free/busy calendar data and each person's legal call window
  - one tap per call, with the gate re-checked at every tap
  - dictation after each call
  - recording off by default
- **Pass-Along Card (Next):** a past client shares a link from their own phone. The platform cannot collect the friend's number, the friend gives their own consent, and the thank-you is a handwritten note with a value field that can only hold $0.
- **Ungated Review Desk (Next):** every funded borrower is asked once, the same way, 30 days after closing. Replies are drafted so they never confirm the person is a customer.

### 4.4 Pipeline and processing (Now to Next)
- **Connector layer (Now), the base of the Connector Co-op:**
  - each vendor's signature verified
  - raw events stored for replay
  - a nightly re-read where allowed
  - contract tests on synthetic fixtures
  - health alerts

  Rule: an LOS event never sends a marketing message or changes pay by itself.
  - **ARIVE first:** each loan officer's own Pro credentials through Zapier. ARIVE's terms on this are **unverified**; a vendor (Supergood) claims ARIVE's agreement bars vendors from its APIs. Seek a written partner agreement before scaling, and before any copy says "built for ARIVE".
  - **Floify Custom CRM webhooks.**
  - **Duplicate status texts** are detected when Floify is already messaging the borrower.
- **One Entry (Now):** prep answers from M8 become the ARIVE lead. A phone number that syncs in from the LOS never inherits marketing consent. Co-borrowers give separate consent.
- **Own-source lead intake (Next).** This is how compliant loan officers actually grow: leads from the loan officer's own Meta and Google lead forms, their website, and open-house sign-ins.
  - Consent is captured at the source with the exact disclosure hashed and the seller named.
  - Each lead gets provenance "own ad" or "own event".
  - Forms that don't capture consent land as relationship-only.
  - Bought, shared or aged lists stay refused.
- **Team routing and round-robin (Next):** within one sponsor's team, by rules the team lead sets (availability, licensed state, language). Never by loan terms or demographics, and never across sponsors for pay.
- **Pre-approval letters (Next):** generated only from a file whose verification status the loan officer has confirmed, with the sponsor's template and license lines from config. Each letter has a dated expiry and a record of what was verified. No rate appears unless it comes from a priced result.
- **Lender Mail Room (Next):** loan officers forward wholesale-lender notification emails.
  - DKIM and DMARC are verified, and each lender gets its own parser.
  - Events become conditions and milestones.
  - Emails about wires are quarantined.
  - Start with the 3–5 lenders used most.
- **Deal Clock (Next):**
  - inputs: contract deadlines (AI-extracted, quoted, confirmed by the loan officer), LOS dates, lock expiry
  - the CD 3-day wait and the appraisal-copy clock
  - the initial LE must be **delivered or mailed** 7 business days before closing; the CD must be **received** 3 business days before
  - disclosure dates are read from the LOS, not recomputed
- **File Freshness (Next):** Expiry Stack and Clean Submit merged. Each document's age is checked against the projected closing, and the refresh request goes out the day the new document exists.
- **Credit chip (Next):** age, expiry, cost and reissue ID only. Report contents never enter Command Center. A reissue prompt appears when a file moves lenders.
- **Licensed Hands (Next):**
  - a License Clock: a lapse pauses routing and marketing in that state
  - an Application Meter: M8 stops before collecting the sixth TRID item, and an SSN volunteered in any channel counts as received
  - work sorted into licensed and support lanes; assistants' drafts can't contain terms; a supervision log
- **Instruction Receipts** feed these clocks.
- **Bring your own processor (Next):** sponsor W-2 staff or licensed processing companies get access scoped to items and set to expire. The platform never employs or pays processors.
- **Later:**
  - a Guideline Ledger: agency rules with citations, plus an impact run when county loan limits change
  - a Scenario Runner: de-identified scenarios sent to lenders from the loan officer's own mailbox, filed as the anti-steering record
  - a Lender Switch Kit checklist
  - an Appraisal Desk: Value Gap, ROV and Appraisal merged. It covers the ECOA copy clock, a gap options card, and a reconsideration-of-value request that the borrower starts and signs. Appraisers and AMCs are blocked from contact.

### 4.5 Pricing (Now to Next)
- **The rule:** no rate outside a priced result, ever. Every rate carries the APR and the not-a-commitment line.
- **Now:** keep the manual daily ARIVE pull. Replace the C9 LoanSifter in-tab capture with a licensed path, because Loansifter's licence (section 3.2.1) restricts copying.
- **Next:** one pricing adapter per sponsor:
  - the Optimal Blue Loansifter Broker Product and Pricing API (about $100/mo, per a third party)
  - LenderPrice (Lender Price API)
  - Polly
  - the manual pull

  Pricing for each sponsor stays in its own tenant.
- **Quote Ledger (Next):** M8 and drafted messages must be tied to a priced result. Rates a human types are captured and labelled "unpriced", not blocked. Quotes are reconciled against the LE.
- **Float Watch (Next):** loan officers see when the dated example moves on a floating file.

### 4.6 Partners and agents (Next)
- **Partner Room plus Agent Line:**
  - The borrower grants views scoped to fields, set to expire and revocable.
  - Agents and everyone else get identical tools for free, with no seats paid by the loan officer.
  - A "who looked" log.
  - Sharing pauses when a partner's contact route changes.
  - License status is checked where the registry's terms allow.
- **Agent preference page:** each agent chooses their own channels and purposes, and their stops feed the network opt-out list. A view of files across loan officers comes later, once enough agents use it.
- **Co-branded agent flyers (Next), without a marketing services agreement:**
  - Each party pays its proportional share of the actual cost, recorded in the co-marketing ledger, the way Reg X allows fair cost-splitting.
  - No agent ever gets a free flyer paid for by the loan officer.
  - License lines come from config.
  - Any rate comes only from a dated priced snapshot, and the flyer expires when the snapshot does (Ad Desk).
  - **[COUNSEL]** to approve the cost-split method.
- **Value Trail (Later, sponsor-mandated):** partner spend from receipts or CSV goes into the co-marketing ledger with Reg X categories and caps. Any value-versus-referral review runs only at counsel's direction.
- **Agent Intel:**
  - RETR is **display only** until RETR grants written permission.
  - Bring-your-own-license connectors: each loan officer's own subscription feeds only their tenant.
  - A data-rights ledger tags every field with what its licence allows.
  - AI reasons only over free and openly licensed data: HMDA, city permits, and the loan officer's own closings.

### 4.7 AI voice (Next)
- **Runtime:**
  - Cascaded speech-to-text, then the model, then text-to-speech, through Twilio ConversationRelay ($0.07/min plus voice minutes; GA 2025-05-14). The guard checks every sentence before it is spoken.
  - Native speech-to-speech (Gemini Live, OpenAI Realtime) can't be checked before it speaks, so it is used only for low-risk service turns, if at all.
  - Model IDs are pinned with a tested fallback. `gemini-3.1-flash-live-preview` reportedly hit its earliest shutdown on 2026-11-17 (third-party tracker; unverified).
- **Internal test calls first,** then M8 check-in calls to consented clients only, with live transfer. EBR never authorizes an AI call. Only recorded consent for AI calls does.
- **A compliance receipt per call:** it records when the AI disclosure, recording notice and opt-out were spoken. Any miss pauses that play.
- **Screener protocol:** when a phone's AI screener answers, a fixed card names the caller and gives a callback number. No pitch. A verified "VERIFY" text answers only the number that was actually called.
- **Accommodations** (Accommodation Memory and Equal Ear merged):
  - The borrower states their own preferences, about function only: text only, relay-friendly, slower, read-back.
  - Only the gate and the voice runtime read them.
  - Speech-equity tests run at each model change, on commercially licensed corpora.
- **Answerability, not volume:** branded caller ID and full STIR/SHAKEN attestation. Hiya's 2026 survey reportedly found 86% of people won't answer unknown numbers (unverified).
- **Later:** a broker-side condition chaser by email (the Third-Party Chase Agent: email first, AI calls only where no portal exists).

### 4.8 Past clients and homeowner life (Next to Later)
- **Verified Loan Facts vault (Next):** the borrower uploads their CD or statement, or the POS supplies it for the loan officer's own closings. Every service desk below needs it.
- **Next:**
  - **Refund Radar:** the tolerance-cure card before funding; payoff escrow and PMI refund clocks
  - **Reset Radar:** buydown step-ups first, then ARM resets about 12 months out
  - **Year-One Map:** state-level rows (TX homestead, CA supplemental tax), with policy-renewal and FAIR Plan links folded in from Coverage Guard
  - **PMI Exit**
  - **Escrow Shock Shield**
- **Wave Ready (Next):** a rate-ladder histogram for the loan officer over verified loans, plus alerts at thresholds the borrower sets, with written consent. It ships after Churn Guard.
- **Later:**
  - **Junior Lien desk:** HELOC subordination starts on day 1 of a refinance; HFA second-lien forgiveness dates; Texas 50(a)(6) blocks; the same pay whether the borrower chooses a HELOC or a cash-out refinance
  - **Before You Sign:** PACE, solar, HEI and sale-leaseback explained against the real first lien, starting with "doing nothing"
  - **Home Record Watch:** enrollment links for free county alerts, plus the lien-release clock after the loan officer's own refinances
  - **Servicer Handoff Watch**
  - **the Disaster Desk** with claim guidance
  - **a yearly LOMA screen** for flood-zone clients
  - **Next Home Plan:** sell first, buy first, or keep and rent, with a recast estimate
  - **Advice Receipt:** every option set includes "do nothing", with a pay-parity attestation

### 4.9 Compliance Center (Next)
- **Supervision Desk:**
  - a random floor sample plus lexicon-flagged samples of human and AI conversations for the sponsor's reviewer
  - discouragement flags
  - corrective messages from counsel templates
- **Ad Desk:**
  - checks for Reg Z trigger terms
  - license lines from config
  - ads tied to a priced snapshot, which expire when the snapshot does
  - a sponsor approval queue
  - an archive kept at least 24 months (the MAP Rule)
  - a block on unsubstantiated competitor claims
- **Exam export bundle:** a seeded sample, decision replay, and "find all affected records".
- **Subpoena and litigation-hold playbook (Next):**
  - It covers who at the platform responds, how tenant data is preserved and produced, how the affected sponsor is notified, and the platform's indemnity terms.
  - Lift-out trade-secret suits under the DTSA will name the platform. The Portable Seat Addendum has to allocate that risk.
- **Policy renderer:** the public texting terms, privacy-notice sharing lines and telemarketing policy are generated from live settings so they can't drift. The privacy policy forbids transferring personal data in any sale (§3).
- **Safeguards binder:**
  - a risk assessment template
  - controls mapped to evidence
  - a service-provider list
  - the 30-day FTC notice runbook
  - a pen test bought once for the whole network
- **Security attestations, early, not "when required":**
  - The 2023 interagency guidance on third-party risk management, and state exam practice, mean founding lender sponsors will ask for SOC 2 Type II, cyber and errors-and-omissions insurance, and a pen test at onboarding.
  - Get SOC 2 Type I during D6–D10 and start the Type II observation window then.
  - If a New York sponsor joins, plan for NYDFS Part 500.
- **Paired-Tester Lab:** matched synthetic borrowers run through M8 chat before every promote. **Guard Commons:** approved near-misses become red-team cases.
- **Tripwires:** decoy email addresses and a small pool of numbers in every export and vendor feed. None in the loan officer's own Book Deed export or in LOS syncs.
- **Leak Scan:** a monthly crawl of each brokerage's own pages for trackers.
- **Goal and pipeline analytics (Next):** pipeline, conversion and capacity views for the loan officer and team lead. They never feed rewards, Seat Truth or routing (comp firewall), and they never rank people by demographics or proxies.

### 4.10 Recruiting (Next, member pieces after counsel)
- **Package page** with the published price and the data charter.
  - No "stake", "ownership", "equity" or "units" language until counsel picks a structure and the offering route; `check:copy` enforces this.
  - Plan documents appear only on counsel's approval, and offering materials never appear here.
- **Honest Twin trial:** a synthetic book built from numbers the recruit types in. It shows the real gate's blocks, including "after you move, these contacts need fresh consent to call." Counts only, with the slider defaulting to 0%.
- **Zero-Upload Book Check** (already in the ideas doc).
- **Exit Clause X-ray:** a clause finder that runs only in the browser and quotes the clauses, plus a list of questions for an attorney, plus D2 holds. No conclusions about whether a clause is enforceable.
- **Lift-Out Guard:**
  - no recruiter credit between coworkers or under an attested non-solicit
  - separate join rooms
  - a clean-exit attestation
- **Coverage map and waitlist:** "notify me when LoanM8 is available in my state". Grants as credits to the sponsor come later.
- **Sponsor Commons Portable Seat Addendum** (with the mobility protocol clauses):
  - only personal contacts move, never contacts drawn from loan files
  - consent records and history are copied, and both sponsors keep them
  - the old sponsor gets a matching list
  - announcements go by email only
  - Reg P opt-out applies, with opt-in in CA and VT
  - litigation-hold, subpoena and indemnity terms
- **This replaces Recruit Radar's NMLS and RETR mining,** which their terms forbid.

### 4.11 AI agents and open standards (Later)
- **Own-AI Bridge:** a read-and-draft MCP server for sponsors with approved enterprise AI clients. Every write lands in the approval queue. Attorney review comes first (ATTORNEY_REVIEW_LIST).
- **Pocket Loan Officer** (a connector the borrower installs): deferred.
- **Licensed Agent Gateway and Signed Quote Credential:** consumer AIs can get a dated, verifiable priced example and a handoff to a licensed person. The gateway never accepts consent from an AI.

### 4.12 Mobile (Next)
- **Bonzo and Shape ship native mobile apps; the first draft had none.** A native app (or a strong installable web app first, to save cost) offers:
  - push notifications for inbound texts, Instruction Receipts and Deal Clock deadlines
  - one-tap calling and texting, with the gate re-checked at each tap
  - dictation after a call
  - Today cards
- The app holds no unencrypted contact data. It uses the same roles and audit log as the web app.

---

## 5. The moat

1. **Network effects that need a multi-sponsor, member-governed network:**
   - **One opt-out block across all members,** so every stop protects everyone. It is one-way, on hashed numbers, and a START never lifts another company's block. Sharing across sponsors is **[COUNSEL]** under Reg P.
   - **More front ends returning past clients to their own loan officer** (Homecoming, later).
   - **More licensed coverage,** so fewer "no one here" answers. That never means exclusive territories.
   - **Connector fixes shipped once for all tenants.**
   - **Shared reference tables:** servicer addresses, county rows, lender procedure recipes, condo project facts.
2. **A data cooperative with a gatekeeper.** Pooled features run only through registered, counsel-signed uses. Each use has:
   - a minimum number of contributors
   - a time lag
   - differential-privacy noise (later)
   - a never-list: no prices, comp, wages, territories, or exclusive-area assignments
   - an entry in a public register

   Start now with column classes and the never-list in CI. Turn on the full gate once three or more sponsors are live.
3. **Compliance trust that builds over time and can't be faked later:**
   - counsel-signed rule cases
   - a hash-chained consent history
   - years of supervision and retention logs
   - SOC 2 Type II, started early
   - an annual statement that zero leads were sold
4. **Switching costs that are fair.** The loan officer can always export (Book Deed, in MISMO format where it fits). What they would lose by leaving:
   - their member vote and patronage history
   - a domain reputation they own
   - verified loan facts their clients uploaded
   - contributor credit

   None of that comes from lock-in tricks.
5. **Collective buying:** one rate card for carriers, AI minutes, verification, pen testing, credit reissue and data licences. Savings show up only as lower flat prices or lower borrower pass-through costs, never per loan. **[COUNSEL: RESPA 8 on credit vendors; antitrust on joint purchasing]**

---

## 6. Integrations and data partners, in priority order

| # | Partner | Why | What it needs | Cost (known / assumed) |
|---|---|---|---|---|
| 1 | Twilio messaging, Lookup, Verify, **ISV / TrustHub** | Texting, line type, possession proof | Fix inbound tenant attribution (D6); **a brand and campaign for each sponsor through ISV secondary profiles** (D8); numbers per loan officer under that brand; a written rule on who keeps the number when someone leaves. Carriers have blocked unregistered traffic since 2025-02-01 | Per message plus brand-vetting and campaign fees per sponsor (amounts unverified) |
| 2 | DNC scrub vendor + FCC Reassigned Numbers Database (Somos) | Gate checks D4 still lacks | Vendor accounts; a National DNC Registry SAN per seller (first 5 area codes free) | Quote; RND subscription in tiers |
| 3 | Resend (email) + DNS automation | Email lane | Domains approved by sponsors | In place |
| 4 | ARIVE (Zapier) | Pipeline for the founder's LOS | Each loan officer's Pro seat (price unresolved: $69.99 or $79.99); a **written partner agreement and written permission before any "built for ARIVE" copy**. A vendor (Supergood) claims ARIVE's agreement bars vendors from its APIs (unverified) | Per-loan-officer seat |
| 5 | Floify Custom CRM Integration | POS status webhooks | Floify Support approval | Not public |
| 6 | Pricing: Optimal Blue Loansifter Broker PPE API, LenderPrice, Polly | Licensed replacement for C9 | Licences. Loansifter clause 3.3 takes a perpetual license to customer data | ~$100/mo per BankingBridge (vendor claim); Loansifter base ~$79 (third party); LenderPrice and Polly not researched |
| 7 | Twilio ConversationRelay + model provider + **Google speech-to-text and text-to-speech** | Voice that is checked before it speaks | No data retention and no training on our data (wiretap risk: *Ambriz v. Google*). Confirm whether ConversationRelay's price includes the chosen speech provider (unverified) | $0.07/min + ~$0.013/min outbound voice + model cost + Google STT (~$0.016/min, model knowledge) and TTS (priced per character), metered |
| 8 | Calendar free/busy (Google, Microsoft) | Day Shape | OAuth with the free/busy scope only | Free |
| 9 | Free public data: HMDA, FEMA NFHL, OpenFEMA, FRED (prime), city permit open data, USGS 3DEP | Data AI may use | Respect terms | Free |
| 10 | KMS, RFC 3161 time-stamping; **no biometric identity vendor** | Seat Truth (sponsor attestation + NMLS ID), ledger | Sponsor attestation flow; NMLS-authorized check path | Low; time-stamping authority fees (unverified) |
| 11 | Plaid (Liabilities), Argyle/Truv | Verified loan facts, verification wallet | Borrower authorization; FCRA review (Plaid Check is a consumer reporting agency) | Quote; bank access fees rising |
| 12 | RETR (Level 2 partner, no purchase minimum) | Agent data display | Email api@retr.app with a demo; **written permission** before any AI or rules use | $199/mo per user, paid by the loan officer |
| 13 | Model Match / ATTOM / Cotality | Data AI may use, through their own MCP or API | Licence tier; written OK on marketing use | Model Match $49–399; ATTOM from $500/mo |
| 14 | **Meta and Google lead forms; Microsoft Graph and Gmail mail** | Own-source intake (consent at the source); two-way mail sync | Platform app review; Google restricted-scope assessment for Gmail (costly), so Graph first | Assessment cost (unverified) |
| 15 | **Other broker and lender LOSs: LendingPad Enterprise API, Byte, MeridianLink, Calyx** | Brokers who don't use ARIVE | API agreements; MISMO mapping | Not researched |
| 16 | nCino LO MCP (read-only), Blend events | Coverage on the lender side | Access case by case | Not public |
| 17 | Encompass (ICE ISV) | Retail lenders and independent mortgage banks | Revenue-share fees, source-code review, a ban on aggregation and replication across licensees, plus competition with Surefire. **Do last** | Revenue share on the order form |
| 18 | Google Business Profile | Reviews | API access | Free |

**Standards:** adopt MISMO for the Book Deed export, the importers and LOS mapping, so a loan officer's data moves cleanly in both directions.

**Switching season:**
- The Encompass SDK sunset is 2026-12-31.
- Sphere LOS's free two years start ending around February 2027.
- Blend reports mortgage customers leaving for cheaper tools.

Ship importers for Sphere, Surefire and Encompass CRM exports that run through the D2 provenance check. Loan history comes in as relationship-only and flagged "loan-file".

---

## 7. Business model

All numbers here are **planning assumptions** to test, not quotes. The first draft priced under Bonzo, showed no fixed costs and left a "$X" placeholder. This revision fixes those gaps, but every figure still needs real quotes.

**Pricing: compliance is the premium, so we don't price under Bonzo.**
- **Solo seat: about $199/month**, month to month, cancel in the app. It includes:
  - ARIVE sync
  - a 10DLC number under the sponsor's brand, plus registration help
  - the email lane
  - Today, plays and the Compliance Center basics
  - the mobile app
  - a stated allowance of AI-voice minutes (for example 150)
- **Team seat: about $149/seat** for 2–10 seats, with the same features.
- **Sponsor (company) tier, priced like enterprise software:** an annual platform fee (planning range $12K–60K a year by size) plus seats. It includes the supervision desk, the exam bundle, the Safeguards binder, SOC 2 reports, per-sponsor 10DLC brand management and the pricing adapter.
- **Seat price is fair market value for software.** Routing is priced at zero and never depends on holding a seat (§3).
- **Metered at published cost:**
  - **Voice minutes:** ConversationRelay plus speech-to-text plus text-to-speech plus model plus carrier, shown on a meter.
  - **Data licences** each loan officer brings.
  - **Verification pass-throughs,** at actual cost to the borrower.
- **Never:** per-loan fees, per-lead fees, placement fees, paid routing priority, territory or default-area premiums. RESPA 8 and the Reg Z comp rules forbid them, and staying flat is also the clean base for patronage.

**Variable cost per seat (assumptions):**

| Cost line | Assumption |
|---|---|
| Carrier and texting | $3–8 per seat per month |
| Email | Under $1 |
| Database and hosting | $3–6 |
| AI chat and drafting | $5–15 |
| Included voice | 150 min × ~$0.12–0.15/min (ConversationRelay $0.07 + carrier ~$0.013 + Google STT ~$0.016 + TTS ~$0.005–0.015 + model; speech prices from model knowledge) = ~$18–23 |
| Support at 500+ seats | ~$15–25 |
| Contra-revenue for credits or patronage (ASC 606) | Set by the plan; budget 0–5% of revenue until counsel and the accountant decide |
| **Target gross margin** | **55–70% at scale** |

**Fixed costs per year (assumptions, get quotes):**

| Fixed line | Planning range |
|---|---|
| Mortgage, TCPA and 50-state licensing counsel | $150–300K |
| Securities, co-op, tax and antitrust counsel (one-time plan setup plus ongoing) | $100–250K in year 1; $50–100K after |
| SOC 2 Type I then Type II, with tooling | $30–80K |
| Pen test (one for the network) | $15–40K |
| Cyber and E&O insurance | $20–60K |
| DNC registry, scrub vendor and Reassigned Numbers subscriptions | $10–30K |
| Accounting and audit (reviewed financials; audited if Reg A) | $20–100K |
| Brand vetting and campaign fees per sponsor | Small per sponsor; amount unverified |
| Core team (founder plus 2 engineers plus 1 support and compliance person) | $500–800K |
| **Total fixed** | **About $0.85–1.6M per year** |

**Break-even (assumptions):**
- A blended seat price of about $175 at 60% gross margin contributes about $105 a month, or roughly $1,260 a year, per seat.
- With no sponsor fees, break-even is about **675–1,270 seats**.
- Each sponsor platform fee lowers that number. Ten sponsors at $25K is $250K a year, which cuts break-even by about 200 seats.
- 1,000 seats at the old $99–149 pricing would have made about $1.2–1.8M in annual recurring revenue at most, which does not clear these fixed costs. That is why prices went up.

**Members' report line:** counsel and audit spend is reported to members each quarter as a real number, not "$X".

**Churn target:** below the CRM category's. No independent survey of loan officer CRM churn was found; only vendor claims.

**How membership interacts with pricing:**
- Patronage or credits come from subscription spend only, and go to the payer of record.
- Credits reduce the payer's own invoice.
- Members vote on platform seat-price increases above the published cap.
- Patronage and credits never depend on loans, data use or routing.

---

## 8. Go-to-market

**The first 100 loan officers (months 0–9):**
1. **The founder's own book and states** (WA, OR, AZ, CA, TX), on ARIVE. First fix the inbound tenant leak, the 9–8 default and the D3 EBR issue, so every recruit starts compliant on day one.
2. **Three to five founding sponsors,** signed by hand to the Portable Seat Addendum.
   - Sponsors are the bottleneck. The security packet, SOC 2 Type I, insurance certificates and the Safeguards binder shorten their vendor approval.
   - Each sponsor gets its own 10DLC brand.
3. **ARIVE brokers first.**
   - ARIVE's partner page lists no third-party CRM, and ARIVE claims 25K+ loan officers (vendor claim, unverified).
   - Until ARIVE gives written permission, say "imports from ARIVE using your own Zapier connection", not "built for ARIVE", which implies an endorsement.
4. **Recruiting tools that carry no earnings claims:**
   - the published price
   - the data charter
   - the Honest Twin trial
   - Zero-Upload Book Check
   - the Exit Clause X-ray question list

   No "stake" or "ownership" language until counsel approves. `check:copy` blocks earnings language, scarcity, "commission", and (on recruiting pages) the ownership words.
5. **Before any member gets a vote, a share or a refund: end exclusive territories** or get counsel's written opinion. Change the "one originator per service area" copy on `/join` **[OWNER]**.
6. **Routing:** until a counsel opinion and a written routing policy exist, LoanM8 routes borrowers only to the founder, with the founder's interest disclosed.
7. **Content:**
   - a public rules changelog (FCC 26-67, Virginia, Texas SB 140), with each date verified first
   - a plain explainer on what the 2026 TCPA suits mean for brokers, with statistics verified first
   - an integration truth page about our own integrations only. No claims about competitors unless they are substantiated and legally reviewed.

**To 1,000 (months 9–24):**
- More sponsors through the Commons. Each new state opens through the coverage waitlist and, later, credit grants to sponsors.
- Free affinity entry points: any employer, union or association can link to a branded page where the borrower chooses first. Nothing of value goes to the referrer.
- Switching-season importers (the Encompass SDK sunset, Sphere's free period ending).
- More LOSs (LendingPad, Byte, MeridianLink, Calyx) and pricing engines (Polly, LenderPrice).
- A Spanish-language M8, reviewed by paid bilingual licensed staff.
- Recruit with the members' report, not projections.

**Never:**
- dial bought lists
- pay agents
- run recruiting trees
- say "limited spots"
- show income figures
- assign exclusive territories
- publish unsubstantiated claims about competitors

---

## 9. Risks and how each is handled

| Risk | Handling |
|---|---|
| Inbound texts shared across tenants; a START lifting another company's STOP | D6: attribute by `To` number; one-way hashed block; START lifts only for its own sender; no cross-tenant bodies; test |
| TCPA and state mini-TCPA suits | A gate that fails closed; 9–8 default everywhere; Lawful Lanes EBR fix (EBR is a DNC exemption only); possession-proven consent; counsel-signed rule tests; a compliance receipt per call; evidence export; strict defaults after *McKesson* |
| 10DLC rejection or blocking | ISV secondary profiles; a brand for each sponsor; campaigns per use case; no "lead generation" campaigns |
| Loss of callability after a sponsor change | Said plainly in the thesis and the Honest Twin: contacts follow, call rights don't; a fresh-consent lane |
| AI says a rate or makes a promise | Cascaded voice checked before speech; the guard; rates only from priced results; the Quote Ledger; red-team and paired tests before every promote |
| Securities violation in the member plan | Co-op with nominal shares first; no units for subscription months; a cash purchase lane only under a counsel-chosen exemption; no ownership words in recruiting copy; holder counter and 12(g) conditions; registered transfer agent; no market run by members |
| State "paid only by sponsor" rules | Everything goes to the payer of record, including units and patronage; a counsel matrix per state; a lane closes where it isn't allowed |
| Reg Z comp proxy | Comp firewall in CI; no loan field anywhere in rewards, grants, analytics feeds or Seat Truth |
| RESPA 8 | Identical free agent tools; $0 referral ledger; seat at software fair market value with routing at zero; a routing policy that doesn't depend on a seat; the founder's interest disclosed; agents excluded from membership; no money from insurers, title, credit or data vendors; fair cost-split flyers |
| Antitrust: market allocation | End exclusive territories before any member gets a vote or a share, or get a written opinion; "no exclusive territories" on the never-list; members vote only on the platform's own price and charter |
| The founder as owner and competitor | Logged break-glass access, visible to the member; the founder's tenant under the same rules; the routing interest disclosed; an independent director from day one |
| Funding versus member protections | Funding model decided first; protections trimmed knowingly if outside equity is needed |
| Entity, tax and accounting | No LLC; C-corp PBC or Subchapter T co-op; ASC 606 contra-revenue budgeted; 1099 reporting avoided through payer of record; PTP risk reviewed before any transfer |
| Liquidity duties | No swap, tender or market until counsel answers question 9 |
| Bankruptcy or a sale that breaks the charter | Charter in the certificate; a contract covenant members can enforce; a privacy policy that triggers the §363/§332 ombudsman |
| Portability versus GLBA and books and records | Only personal contacts move; consent records and history copied, not moved; full portability only under the Addendum; litigation-hold and subpoena playbook; indemnity |
| Biometric privacy claims | No biometrics in Seat Truth |
| Lanham Act and deceptive-practices claims | Competitor claims kept internal unless substantiated and legally reviewed; Ad Desk check |
| Vendor terms (ARIVE, ICE, Loansifter, RETR, NMLS) | Official routes only; no scraping or portal automation; written permissions before scaling or endorsement-style copy; RETR display only |
| GLBA, privacy and breach | Tenant isolation; audited reads; Safeguards binder; retention clock; SOC 2 Type I then Type II; NYDFS Part 500 if a New York sponsor joins; network pooling only through the gatekeeper |
| Fair lending | No demographics or proxies stored; triggers based on behavior; paired-tester lab; tract-level tests run by the sponsor; LMI data used only to add outreach |
| Voice model churn and latency | Pinned models with a tested fallback; cascaded design. The best median the caller heard in an independent test was about 1.3s (openbenchmarks), so latency is accepted, not hidden |
| Economics | A fixed-cost budget and break-even count (§7); prices above Bonzo; a sponsor enterprise tier; voice metered at full cost |
| Weak motivation for top producers | Lead with product (mobile, sync, pricing, own-source intake) and governance; the stake is a tiebreaker, with the math shown |
| Unlicensed practice of law and insurance producer rules | Quote and cite, never conclude; government links only; no carrier names; counsel templates |
| Over-building for a small team | Each Later item is gated on member count or a partner; the MVP versions here are deliberately narrow |
| Unverified research | Every fact marked unverified gets a primary-source check before it goes into copy, rules or contracts |

---

## 10. Build roadmap after D5

D1–D5 are built. This replaces the D6–D12 order in the build prompt (§7), subject to the owner's sign-off. Each patch stops for the owner's sign-off. **A parallel track starts with D6:** SOC 2 Type I readiness, insurance quotes, and the counsel engagement on §3 and the territory question.

1. **D6 Urgent fixes: inbound isolation, quiet hours, copy.**
   - Attribute inbound texts by the `To` number; the opt-out becomes a one-way hashed block; START is scoped to its own sender.
   - `DEFAULT_RULE` becomes 9 AM–8 PM.
   - The ownership words go into `check:copy` for recruiting pages.
   - **[OWNER]** `/join` territory copy.
   - *Test:* a START texted to company A's number doesn't lift a STOP given to company B; an inbound body is stored only in the tenant whose number received it; a text at 8:30 AM local is blocked in every state.
2. **D7 Lawful Lanes and Law as Tests.**
   - EBR tied to the closing company and limited to DNC.
   - Connecticut, Virginia and Texas SB 140 rows.
   - Rules dated by when they take effect.
   - Counsel case files in `verify`.
   - *Test:* an imported closing from a prior company can't be hand-dialed under EBR; an AI call can never use EBR; a Texas marketing text is blocked until a registration or exemption is recorded.
3. **D8 10DLC per sponsor.** ISV secondary profiles, a brand and campaign for each sponsor, numbers per loan officer, and the number-ownership rule. *Test:* a loan officer's number can't send under another sponsor's campaign.
4. **D9 Gate safety rules.** Hardship pause, protective pause, Instruction Receipts, complaint case and legal hold. *Test:* "I lost my job" pauses every marketing play for that contact for 12 months.
5. **D10 DNC and Reassigned Numbers.** Vendor scrub and Reassigned Numbers queries feed the gate. *Test:* a number reassigned after its consent date is blocked.
6. **D11 Possession-proven consent and the consent passport.** Texted YES or code, hashed disclosure, seller scope, a flag on sponsor change. *Test:* a web-form consent without confirmation stays relationship-only.
7. **D12 Clean Sender email lane.** *Test:* no marketing email sends before DMARC passes, and the complaint budget pauses only that loan officer.
8. **D13 Connector core and ARIVE sync.** Signed ingest, raw store, replay, contract tests; One Entry; the channel-consent rule. *Test:* replaying a stored ARIVE event rebuilds the milestone, and a synced number has no marketing consent.
9. **D14 Own-source intake and mail sync.** Meta and Google lead forms, website and open-house forms with consent at the source; Microsoft Graph two-way mail. *Test:* a lead form without the consent checkbox lands as relationship-only, and synced mail never grants consent.
10. **D15 Mobile.** An installable app (or a native one) with push, one-tap gated calling and texting, and Today. *Test:* a tap to call a contact who is outside their legal window is blocked on the phone with the reason.
11. **D16 Floify webhooks and Lender Mail Room** (top 3 lenders). *Test:* a spoofed lender email is quarantined, and a real one creates a condition card.
12. **D17 Deal Clock, File Freshness, credit chip and pre-approval letters.** *Test:* a statement that ages out before the projected closing creates a dated refresh card, and a pre-approval letter can't be generated without a confirmed verification record.
13. **D18 Plays gallery, video messages, Churn Guard, Throughput Governor, team round-robin.** *Test:* a VA loan at 150 days gets no refinance card and the reason shows the earliest date; round-robin never uses a loan-term field.
14. **D19 Consent Archaeology (revocations), Pass-Along Card and Review Desk.** *Test:* a 2022 "stop" in an Android export lands on the opt-out list, and the referral form rejects a friend's number.
15. **D20 Partner Room, Agent Line and cost-split flyers** (agents first). *Test:* revoking an agent's grant removes access on their next request, a changed agent email pauses sharing, and a flyer can't be approved without a cost split recorded for each party.
16. **D21 Licensed pricing adapter and Quote Ledger** (Optimal Blue, LenderPrice, Polly or manual). *Test:* an M8 draft with a rate and no snapshot ID can't be sent.
17. **D22 Ad Desk, Supervision Desk and analytics.** *Test:* an ad with "3.5% down" and no disclosures can't be approved; the reviewer queue contains the random floor sample; the reward role can't read the analytics tables.
18. **D23 Licensed Hands and delegation lanes.** *Test:* M8 refuses to ask for the sixth TRID item, and a lapsed license pauses that state's marketing within minutes.
19. **D24 Voice runtime (internal only).** ConversationRelay, pinned models with fallback, metered speech costs, accommodations, screener card. *Test:* a scripted call where the model tries to say a rate is blocked before audio plays.
20. **D25 M8 check-in calls to consented clients.** Live transfer, per-call receipt, Verify-a-call. *Test:* a call without AI-call consent can't start, and a missing disclosure pauses the play.
21. **D26 Verified Loan Facts and the service desks** (Refund Radar, buydown resets, Year-One Map, PMI, escrow). *Test:* an uploaded CD starts the right clocks with citations.
22. **D27 Wave Ready.** *Test:* the ladder counts only verified loans, and a borrower threshold fires only after Churn Guard passes.
23. **D28 Compliance Center exports.** Exam bundle, Safeguards binder, retention clock, policy renderer, tripwires, the subpoena and litigation-hold playbook, and break-glass logging. *Test:* changing the texting cap updates the published texting terms; a legal hold blocks deletion; an operator read of a tenant appears in that member's log.
24. **D29 Agent Intel, data-rights edition.** RETR display only, bring-your-own-license connectors, the use gate, the HMDA lane. *Test:* a RETR field can't be read by M8 or the ranker.
25. **D30 Recruiting surface.** Package page, Honest Twin (with the call-rights note), Exit Clause X-ray, Lift-Out Guard, coverage waitlist. *Test:* no recruiting page passes `check:copy` with an income figure or an ownership word.
26. **D31 Member ledger: patronage and credits, payer of record only** (after counsel signs the plan and the territory question is closed). Subscription spend, the credit floor, Seat Truth without biometrics, the comp firewall test, Two-Key Key 1. *Test:* the reward role can't select from any loan table; a sponsor-paid seat credits the sponsor and never the loan officer; a seat paid by its recruiter earns that recruiter nothing.
27. **D32 Sponsor Commons addendum and seat transfer.** *Test:* a sponsor change moves only contacts with personal provenance; consent records are copied and remain with the old sponsor; CA and VT customers without opt-in stay behind.
28. **D33 Purchase lane and the annual members' report** (only if counsel picks an exemption and the funding model calls for it). *Test:* the holder counter shows total holders against 2,000 and non-accredited holders against 500, with total assets; the Reg CF or Reg A exclusion conditions (transfer agent, current reports, asset or float or revenue limits) show pass or fail.
29. **Later (each gated on members, partners or counsel):**
    - Commons Gatekeeper with differential privacy
    - pooled fair-lending tests
    - list fingerprint
    - Guideline Ledger and Scenario Runner
    - Lender Switch Kit and Appraisal Desk
    - Junior Lien desk
    - Before You Sign
    - Home Record Watch
    - Servicer Handoff
    - LOMA screen
    - Project Book
    - Own-AI Bridge
    - Witnessed Ledger sponsor witnesses
    - more LOS connectors (LendingPad, Byte, MeridianLink, Calyx, then Encompass)
    - SOC 2 Type II report (the observation window started at D6)
    - liquidity, only after counsel answers question 9
    - Steward trust
    - Coverage grants
    - Product Gap report
    - Licensed Judgment gold set

---

## 11. Sources

The 2026-11-18 research passes gathered these, mostly from search snippets. This revision ran no new web checks. "(not opened)" means the page was cited from model knowledge and needs a check.

**Repo:**
- /home/user/RATEM8/LoanM8_MLO_Command_Center_Build_Prompt.md (§2)
- /home/user/RATEM8/docs/work/command-center-ideas-2026-11-18.md
- /home/user/RATEM8/PATCHLOG.md (D1–D5)
- /home/user/RATEM8/lib/messaging/service.ts (`handleInbound`, checked)
- /home/user/RATEM8/lib/send-gate/rules.ts (`DEFAULT_RULE` 8–20, checked)
- /home/user/RATEM8/lib/send-gate/gate.ts (EBR from `loanClosedOn` within 18 months, checked)
- /home/user/RATEM8/lib/copy.ts ("One originator per service area", checked)
- /home/user/RATEM8/CLAUDE.md, AGENTS.md, COMPLIANCE.md, ATTORNEY_REVIEW_LIST.md

**Competitors:**
- housingwire.com/articles/mmi-acquires-crm-platform-bonzo/
- support.getbonzo.com/hc/en-us/articles/21542576428946-Integrations-LOS
- capterra.com/p/212895/Bonzo/
- g2.com/products/bonzo/reviews
- g2.com/products/shape-software-shape-mortgage-crm
- capterra.co.uk/reviews/173673/setshape
- totalexpert.com/features/ai-sales-assistant
- businesswire.com/news/home/20260804509565/en/
- capterra.com/p/182058/Jungo-Mortgage-CRM/reviews/?page=2
- bntouch.com/pricing/
- icemortgagetechnology.com/products/surefire-mortgage-crm
- salesforce.com/financial-services/sales-pricing/
- homebot.ai/pricing
- capterra.com/p/265185/mloflo/
- housingwire.com/articles/west-capital-flair-ai-voice/
- forkast.news/sela-raises-21m-for-voice-ai-agents-that-originate-1b-in-mortgage-loans-monthly/
- aitoolsbakery.com/blog/structurely-pricing-2026/
- housingwire.com/articles/uwm-mia-borrower-engagement/
- nationalmortgagenews.com/news/who-owns-client-data-only-the-contract-knows

**LOS, POS and pricing:**
- arive.com/pricing
- arive.com/integration-partners
- support.arive.com/support/solutions/articles/61000312645
- supergood.ai/api-report-card/arive (vendor)
- developer.icemortgagetechnology.com/developer-connect/reference/webhook
- mortgagetech.ice.com/publicdocs/mortgage/ISV-Partner-Terms-and-Conditions.pdf
- icemortgagetechnology.com/explore/encompass-sdk-and-legacy-integrations-sunset
- help.floify.com/en/articles/16300950-how-to-create-a-custom-integration
- developer.ncinomortgage.com/mortgage/docs/lo-mcp-server
- developers.blend.com/blend/docs/getting-started
- digitalmarketplace.optimalblue.com/product-overview
- www2.optimalblue.com/loansifter-licensing-use-agreement
- bankingbridge.com/post/best-practices-for-integrating-optimal-blue-or-loansifter-apis
- documenter.lenderprice.com/guides/architecture
- housingwire.com/articles/uwm-partners-with-sphere-los-direct-integration-for-mortgage-brokers/
- mismo.org (not opened)

**Data:**
- retr.app/terms
- kb.retr.app/how-do-i-become-a-crm-partner
- modelmatch.com/pricing
- modelmatch.com/terms-of-use
- attomdata.com/solutions/delivery/property-data-api/pricing/
- cotality.com/resources/cotality-launches-trestle-mcp-connecting-ai-to-trusted-governed-mls-data
- mortgage.nationwidelicensingsystem.org/.../Consumer Access Terms of Use.pdf
- ffiec.cfpb.gov/documentation/publications/modified-lar/resources/using-mlar-data
- atg.wa.gov/ago-opinions/listings-taxable-property-lists-names-individuals-requested-commercial-purpose

**Voice, messaging and TCPA:**
- twilio.com/en-us/changelog/conversationrelay-is-now-available-in-ga
- twilio.com/docs/messaging/compliance/a2p-10dlc (ISV section; not opened)
- cloud.google.com/speech-to-text/pricing and cloud.google.com/text-to-speech/pricing (not opened)
- openbenchmarks.com/voice-agent-latency/voice-agent-latency-comparison
- aiengineerguide.com/tools/model-retirements/gemini-3-1-flash-live-preview/
- nelsonmullins.com/.../fcc-adopts-overhaul-of-tcpa-consent-revocation-rules...
- dlapiper.com/en/insights/publications/2026/10/fcc-tcpa-rule
- nationalmortgagenews.com/news/mortgage-tcpa-lawsuits-surge-with-11-new-cases
- tcpaworld.com/2026/06/04/april-tcpa-filings-off-the-chart...
- news.inman.com/2026/02/27/class-action-accuses-lender-of-unsolicited-ai-generated-cold-calls/
- mondaq.com/unitedstates/consumer-law/1821332/...
- privacyworld.blog/2026/01/key-changes-to-virginia-telephone-privacy-protection-act-take-effect/
- goodwinlaw.com/.../ai-voice-products-subject-to-california-invasion-of-privacy-claims
- hiya.com/newsroom/press-releases/state-of-the-call-2026...
- ecfr.gov/current/title-47/.../section-64.1200 (not opened; host blocked)

**Ownership, securities, antitrust, tax and law:**
- sec.gov/Archives/edgar/data/1495932/000110465926019145/expi-20251231x10k.htm
- mortgageorb.com/one-real-mortgage-launches-compensation-and-stock-awards-programs-for-los
- nationalmortgageprofessional.com/news/nexa-removes-guardrails-its-100-revenue-model
- quiverquant.com/news/reAlpha+Tech+Corp+Launches+National+Loan+Officer+Recruitment+Program+with+RSU+Incentives
- sec.gov/news/press-release/2020-273
- sec.gov/files/rules/final/2016/33-10075.pdf
- sec.gov/litigation/admin/33-7720.txt (1999 free-stock cases; not opened)
- supreme.justia.com/cases/federal/us/421/837/ (*United Housing Foundation v. Forman*, 1975; not opened)
- *United States v. Topco Associates*, 405 U.S. 596 (1972); *Palmer v. BRG of Georgia*, 498 U.S. 46 (1990) (not opened)
- cooley.com/news/insight/2020/2020-12-01-sec-proposes-changes-rule-701-form-s8
- foley.com/insights/publications/2026/09/is-the-gig-up-equity-compensation-for-platform-workers-influencers-and-brand-ambassadors/
- files.consumerfinance.gov/f/201301_cfpb_final-rule_loan-originator-compensation.pdf
- files.consumerfinance.gov/f/documents/cfpb_loan_originator_small_entity_compliance_guide.pdf
- sml.texas.gov/wp-content/uploads/2025/11/Exam-Common-Violations-2025-11.03.2025.pdf
- california.public.law/codes/business_and_professions_code_section_10137
- azdfi.gov/sites/default/files/2021-08/SPS-LO 04.23.2021.pdf
- app.leg.wa.gov RCW 31.04 and oregonlegislature.gov ORS 86A (not opened; host blocked)
- consumerfinance.gov/compliance/guidance/withdrawn-guidance/ (host blocked)
- 12 U.S.C. 2607 (RESPA §8); 11 U.S.C. 332 and 363(b)(1); IRC §7704; IRC Subchapter T; Rev. Proc. 93-27; ASC 606-10-32-25 (not opened)
- Interagency Guidance on Third-Party Relationships: Risk Management (June 2023); 23 NYCRR Part 500 (not opened)
- wsgr.com/en/insights/doj-and-ftc-withdraw-antitrust-guidelines-for-competitor-collaborations.html

**Homeowner and regulatory (mostly from model knowledge, not opened):**
- ecfr.gov Reg X 1024.14, .17, .33, .34, .35, .37
- consumerfinance.gov Reg Z 1026.19, .24, .36, .40
- law.cornell.edu/uscode/text/38/3709
- statutes.capitol.texas.gov/Docs/CN/htm/CN.16.htm
- cotality.com/resources/property-taxes-are-reshaping-servicing-operations
- ecfr.gov/current/title-16/chapter-I/subchapter-C/part-314 (Safeguards Rule)

**Still unverified. Check each before it goes into copy, rules or contracts:**
- the Mr. Cooper and Mortgage One Funding AI-voice suits; NMN's "11 suits"; TCPAWorld's "40%"; the Inman AI-voice suit details
- Hiya's 86%
- ARIVE's "25K+ loan officers"; Lenders One's "20%"
- the ARIVE Pro price ($69.99 or $79.99) and ARIVE's terms on vendors using its APIs or per-loan-officer Zapier credentials
- FCC Order 26-67's publication and effective dates
- the Gemini Live model shutdown dates
- the Washington and Oregon comp-payee rules (RCW 31.04, ORS 86A)
- the CFPB small-entity guide's answer on dividends to loan originators
- the HPPA's exact wording and exceptions (described here as "restricted", MED-HIGH)
- MMI's current credit-alert products after the HPPA
- the Rule 701 cap figures
- the 12(g) thresholds and the Reg CF and Reg A conditional-exclusion conditions (HIGH, from model knowledge)
- the 1999 SEC free-stock cases and how *Forman* applies to this design
- Twilio ISV and TrustHub requirements for each sponsor; brand-vetting and campaign fees
- whether ConversationRelay's price includes the speech provider; Google STT and TTS prices
- SOC 2, pen test, insurance and counsel cost ranges in §7
- the RETR permission process
- Loansifter, LenderPrice and Polly API pricing
- the Texas SB 140 registration duty and any exemption for mortgage companies
- the Utah AI Policy Act's disclosure rules for regulated occupations
- the CCPA automated-decision rules' scope and 2027 compliance dates
- the Colorado AI Act's status after 2026-06-30
- the data-level GLBA exemptions in Oregon and Minnesota
- whether the CFPB's 2023 advisory opinion on comparison-shopping platforms was withdrawn
- the CFPB 1033 status
- the Freddie Mac AI governance bulletin
- the commercial licences of the speech corpora
