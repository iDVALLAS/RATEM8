# ATTORNEY_REVIEW_LIST.md — counsel-dependent items found during the build

One line each on what needs a decision. Grouped by topic. Items marked
**conflict** are places where the brief asked for something that a
compliance rule (`COMPLIANCE.md`) overrode; the rule won and the
conflict is recorded here.

## Rate display

- `CONFIG.liveRatesEnabled` is false and nothing on the site shows a market rate. Decide what evidence (live pricing integration, disclosures) must exist before it flips.
- Calculators prefill the rate input with 6.5 as an example labeled "Your rate — enter your own." Confirm a neutral prefill is acceptable or require an empty field.
- Sample figures (Second Look demo, `/loan-estimate` mock, `/sample-brief`) show fictional rates/APRs under a SAMPLE badge. Confirm the badge wording and placement satisfy advertising rules, or require removing numeric rates from samples entirely.
- Principle 2 ("Live wholesale pricing.") is a platform promise; confirm it may appear before live pricing is available on the site.
- **conflict:** the brief's Section 8 lender-count chip ("14 lenders") is never rendered because `lenderCountDisplay` is null. Decide whether a verified count may ever be shown.
- Calculator disclaimer text (`CALC_DISCLAIMER`) is locked from the brief; confirm it is sufficient for all four calculators and the 12 legacy `/tools` pages.

## AI disclosure

- Wording "I'm an AI, not a person." appears at the hero orb tap, chat gate, live-chat input, footer, `/ai`, and `/disclosures`. Confirm wording and placement.
- "Built on Claude" appears as a plain mono label in the hero eyebrow and footer. Confirm it needs no trademark attribution language.
- The draft M8 system prompt (`lib/prompts/m8-system.ts`) and Second Look prompt (`lib/prompts/second-look.ts`) require full review before `chatLiveAi` or `SECOND_LOOK_LIVE` is enabled.
- Anti-steering: the prompt presents three options only when a licensed MLO supplies priced options. Confirm the three option definitions ("lowest rate suitable", "lowest rate without risky features", "lowest total points and fees") match the applicable rule text.

## Recording and consent

- Chat consent screen (`copy.chat.gate.*`): confirm the recording sentence, transcript-on-request promise, and the two-party consent line for WA and CA.
- Retention period for chat transcripts and voice recordings is a placeholder. Decide the period and where it is disclosed.
- `CONFIG.states[].twoPartyConsent` marks WA and CA true, AZ and TX false. Confirm.
- Voice is disabled by flag. Decide the consent UX (banner vs. gate) before any voice feature ships.
- Transcript requests route to `privacyEmail`. Confirm the process and response window.

## Second Look data handling

- Retention for uploaded documents is `[RETENTION — confirm with counsel]` (config, consent screen, /privacy).
- Client-side redaction masks SSN-shaped strings, loan IDs, emails, phones, and simple addresses before upload. Confirm whether this is sufficient or whether server-side detection and deletion guarantees are also required.
- The API never logs document content (only byte count, timing, agent origin). Confirm logging policy and where masked documents are stored, if at all, when the feature is enabled.
- Confirm that explaining a borrower's own Loan Estimate without comparing pricing does not constitute advice requiring additional disclosure.
- Decide whether the results screen needs a "this analysis may contain errors" line beyond the existing disclaimer.

## MLO recruiting copy (/join)

- Only one compensation sentence appears ("Compensation details are shared on the intro call."). Confirm this satisfies any state advertising rules for recruiting.
- Routing policy for borrower assignment is undefined (`ROUTING POLICY — to be defined`). Decide the policy and whether it must be disclosed publicly.
- "Sponsorship and state licensing requirements apply." Confirm the sponsoring-entity relationship for recruited MLOs and whether each state needs its own line.
- The page shows a fictional three-option comparison with no figures. Confirm no advertising rule is triggered by an illustrative pipeline.

- Nationwide vetting: `/join` says LoanM8 vets licensed originators in every state ahead of expansion, while borrower work happens only in the four licensed states. Confirm the recruiting copy cannot be read as an offer to originate where LoanM8 is not licensed.
- Territory exclusivity: "One originator per service area. When an area has its originator, it is closed to new applicants." Confirm this is acceptable as a stated policy (it is written as a fact, not as urgency) and whether "service area" needs a definition.
- AI-channel claim: "built to be the source AI assistants can verify and cite" and "routes to the licensed originator for that area" describe the product design, not results. Confirm no productivity or income implication.

## Agents page (/agents)

- The sentence "No money, gifts, or marketing dollars flow between LoanM8 and agents." replaces the earlier RESPA co-marketing section. Confirm wording.
- Co-branded pages are described as a future feature. Confirm that any future co-branding needs its own RESPA review before build.
- **conflict:** the prior page promised same-day pre-approval and 24-hour letters; removed as timing claims.

## Agent-facing API and AI readiness

- `/api/agent/*` returns calculator results with a disclaimer, licensed states, and `requires_human_consent_for`. Confirm the disclaimer is sufficient for third-party (AI assistant) consumption.
- `/api/agent/states` returns license placeholders as bracketed strings pre-launch. Decide whether the endpoint should be disabled until values are filled.
- `robots.ts` allows AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) once stealth is off. Confirm the policy; it can be tightened.
- `/llms.txt`, `/ai.md`, `/principles.md` mirror visible pages. Confirm no additional disclaimer is required on machine-readable mirrors.
- The `X-Agent-Origin` header is logged (64 chars, no PII). Confirm this is acceptable under the privacy statement.
- MCP server is not shipped; `AGENTS.md` records the plan. Review before any MCP surface is built.

## State-specific disclosures

- Washington: `entityLicense`, `mloLicense`, regulator name/URL, and any mandated disclosure text. Confirm the statewide service-area statement ("serving Washington"; "Western" removed in v14).
- Arizona: same fields; confirm whether AZ requires a specific license-display format.
- California: licensing language placeholder (`requiredDisclosure`); confirm DFPI-style wording and license type.
- Texas: recovery-fund / complaint notice placeholder; confirm the mandated text and whether it must appear on every page or only `/disclosures` and `/states/texas`.
- Trade name "LoanM8 Loan Intelligence" (of Shapiro Home Loans LLC): confirm registration in each state before the footer claims it.
- Sponsor entities (Home Trust Loans NMLS 1761573; Home Financial AZ 1037722) and the sponsor sentences generated by `buildDisclaimer()`: verify numbers and wording.
- Entity NMLS is a placeholder; confirm which entity's NMLS belongs in the footer.

## Privacy and terms

- /privacy Summary: v1 points carried over; confirm each matches launch behavior (the soft-credit-pull point applies only after a borrower applies).
- /privacy Data we collect: confirm descriptions of Vercel Analytics, Calendly, localStorage theme preference, Second Look (off), chat (off).
- /privacy Sharing: confirm the sponsoring-entity-receives-application sentence and the legal-process sentence.
- /privacy Retention: set periods for analytics, bookings, uploads, transcripts, email; check mortgage record-keeping minimums.
- /privacy Rights: confirm access/export/delete list, the records-we-must-keep exception, and the response window.
- /privacy State notices: California, Texas, Washington, Arizona placeholders; decide which notices apply and insert text.
- /privacy Federal notice: whether a financial-privacy notice is required once applications are taken, and where delivered.
- /terms: every section is a `[COUNSEL REVIEW]` skeleton (acceptance, service description, AI, calculators, no offers online, eligibility, acceptable use incl. agent API, IP, disclaimers/liability, governing law and venue, changes, contact).
- /disclosures: confirm the fair-lending sentence, whether the official Equal Housing Lender logo must appear on the page as well as the footer, the generated disclaimer paragraph, and the complaints/regulator wording per state.

## Third-party vendors

- Vercel (hosting, analytics): confirm the privacy statement's description and any data-processing terms needed.
- Calendly (booking): confirm disclosure that booking data is held by Calendly and what LoanM8 retains.
- Anthropic Claude API (M8, Second Look, when enabled): confirm the vendor disclosure and data-handling terms before any live AI feature.
- Google Fonts are fetched at build time only (self-hosted at runtime); no runtime call to Google. Confirm no disclosure needed.

## Locked-copy conflicts recorded as PROPOSAL comments

- `lib/copy.ts` tagline changed from "Free for all loan mates." to the brief's "Free for the people."; the earlier string is preserved in a comment.
- `lib/copy.ts` removed legacy sections (`purchase`, `refinance`, `equity`, `rates`, `aboutPage`, `contact`) that implied live rate display or lender counts and were not rendered anywhere.
- `lib/principles.ts` bodies now match the brief's verbatim text (earlier bodies named a person and referenced "kickbacks").

## Pricing display (v13, Patch A — manual path)

- **Example pricing approval scope.** The owner reports counsel approved example pricing. Confirm the approval covers Reg Z 1026.24(b) ("actually are or will be arranged or offered") for fictional example figures, and the exact label "Example pricing · [date] · not a quote or commitment to lend."
- **Manual snapshots as advertising.** Confirm the required disclosures for a dated snapshot pulled from the sponsoring brokerage's pricing engine: APR prominence (WAC 208-660-440), trigger terms (1026.24(d)) given the displayed principal-and-interest payment, the Texas requirement to show company and originator names and NMLS IDs on rate ads (7 TAC § 56.203), and California DRE criteria (10 CCR § 2848).
- **Record retention.** Confirm the write-once snapshot + source screenshot + audit log satisfies Reg N 1014.5 (24 months) and WAC 208-660-440 (supporting rate information and APR calculation), and set the retention period.
- **Sponsoring brokerage approval.** Confirm each sponsor (Home Trust Loans; Home Financial) must approve the display before it goes public, and whether the snapshot must reflect the sponsor's compensation plan.
- **ARIVE terms.** Confirm with ARIVE in writing that a licensed user copying results by hand onto the brokerage's own site is permitted (Terms of Use "compete" clause; Platform Subscription Agreement "software vendor or technology provider" clause), and what changes once other LOs pay LoanM8 a subscription.
- **Lender terms.** PRMG and Plaza rate materials say "not for distribution to consumers"; HomeXpress sheets say "broker use only"; Plaza limits pricing tools to bona fide quotes. These lenders are excluded until written consent. Confirm anonymization cures the name-use clauses (Provident, Plaza, HomeXpress, Newrez) and that Provident's uniform-compensation clause is satisfied by a flat-compensation display.
- **Anti-steering presentation.** Confirm the three-card layout, the "Includes a risky feature" badge, and the rationale wording; and that showing fewer than three eligible creditors with the stated notice is acceptable.
- **Loan officer notes.** Confirm the screening categories and the placement ("Your loan officer's notes", after the three options, lender anonymized) avoid steering and fair-lending risk.
- **M8 and examples.** Confirm M8 may cite the dated example figures as examples in the tester-only live chat.
- **noindex.** `/rates` is noindex and out of the sitemap so dated figures are not presented by search engines as current offers. Confirm.

## v14 additions (2026-10-01)

- **`/investors`** (`copy.investors`): confirm the fine print ("This page is for informational purposes only and is not an offer to sell, or a solicitation of an offer to buy, any securities.") is sufficient, and that "Interested in investing in LoanM8's growth? Let's start with a conversation." is acceptable general solicitation language for the entity's securities posture. The page carries no raise amount, valuation, terms, returns or structure.
- **Naming loan officers** (`lib/mlo-match.ts`): public pages are generic by default. A named MLO appears only after the borrower states a region or ZIP, picks an MLO, or (assign states only) is matched by IP, and the footer then shows that MLO's name and NMLS number on the same page. Confirm this satisfies each state's advertising rules (company NMLS on every page; individual NMLS whenever an individual is named). `/disclosures` still lists every MLO with their NMLS number.


## v15 additions — Patch B: state routing, location beacon, Oregon (2026-10-01)

### Routing and assignment
- **Assign vs choose rule** (`lib/routing.ts`). A state auto-assigns a loan officer only when every MLO serving it is sponsored by one of the operator's sponsoring companies (today Home Trust Loans and Home Financial). The moment an MLO from another brokerage serves a state, it becomes "choose": every licensed MLO is listed in random order, nothing is pre-selected, and there is no paid placement. Confirm this satisfies RESPA §8 for the current single-sponsor setup, and for future independent subscribers. The rule is enforced by a build check, not by convention.
- **Choose-mode disclosure** (`copy.routing.chooseDisclosure`): "Loan officers pay LoanM8 the same flat software fee. Placement is never paid. LoanM8 is owned by {operator} (NMLS #…), a loan officer on this platform." Confirm the wording, and that the "same flat software fee" statement will be true when shown. No fee arrangement exists in this repo.
- **Resolution order**: the borrower's choice cookie, then the property state they gave us, then the IP region, then asking. Licensing follows the property. When the IP state differs, the site and M8 say so plainly. Confirm that an IP-based starting guess may name a loan officer in assign states before the borrower confirms the property state (v14's rule allows it; choose states never name on IP).
- **Unlicensed states**: no assignment and no pricing, plus "We don't have a licensed loan officer in {State} yet." Confirm that no further disclosure is needed when a visitor from an unlicensed state still reads general content.
- **Oregon**:
  - Entity license number, regulator and any required disclosure are placeholders.
  - Recording consent is set to one-party for phone and online chat (ORS 165.540); confirm.
  - Confirm Home Trust Loans' sponsorship of Ryder Fasse's Oregon license, and the "Licensed in Oregon … through Home Trust Loans (NMLS #1761573)" line.
- **Cookies and privacy**: two first-party, httpOnly cookies (property state, chosen MLO) for 30 days. The IP region is used in-request only and never stored. Confirm the `/privacy` paragraph "Matching you with a loan officer".

### Lender-note display (Patch A, still pending)
- Playbook notes are shown under anonymized lender letters after the three cards. They are screened for fair-housing proxies and never feed selection. Confirm the display, and that notes can't re-identify a lender.

### Pricing display (Patch A, still pending)
- With routing on, a visitor whose state has no licensed loan officer sees no pricing on `/rates`. Example pricing stays dated and labelled as examples; manual snapshots stay dated and anonymized. Confirm example and snapshot pricing may be shown to visitors from any licensed state, regardless of which state the fixture scenario is in.

### Credential copy
- The line under the MLO card reads "Licensed in [State] · NMLS #[ID] · Verify on NMLS Consumer Access →". Per the brief it avoids "vetted", because no `/standards` page describes the vetting process. The owner's v14 copy elsewhere ("Licensed and vetted loan officers", "A licensed, vetted loan officer of your choosing") does use "vetted". Confirm, or require a `/standards` page first.
- The footer swaps name, NMLS number, state license number and sponsoring entity together for the matched MLO, so a page never shows two MLOs. Confirm the order and wording: "{Name}, {Title}, NMLS #{n}. Licensed in {State} (license {#}) through {Sponsor} ({label} #{id})."

## v18 additions (2026-10-02)

- **"Start your application"** (`copy.apply`):
  - The button opens the matched loan officer's own secure application
    (POS/1003) in a new tab.
  - The note reads "Opens {name}'s secure application. Your credit isn't
    pulled until you authorize it there." Confirm the wording.
  - Confirm that naming the officer here (with their NMLS # in the
    footer) is sufficient.
- **"Prep my application with M8"** (`lib/prep/machine.ts`, `copy.prep`):
  - It collects loan purpose, property type, property state, a price
    range, a down-payment range, occupancy, employment type, an income
    range, timeline and free-text questions.
  - It never collects a name, SSN, DOB, property address, exact income,
    account numbers or documents. Nothing is sent or stored; the borrower
    can copy the summary.
  - Confirm this falls short of a TRID "application" (name, income, SSN,
    property address, estimated value, loan amount) and of an ECOA/Reg B
    application. Confirm the copy "This is prep, not an application".
  - **Owner, 2026-10-02:** counsel confirmed the prep data is fine as
    built ("good to go … no stop on the data").
- **M8 system prompt §10** (DRAFT) adds the ready-to-apply hand-off and
  the never-ask list; review with the rest of the prompt.
- **Paper-mode accent** changed to #0F6E56 for contrast; no copy change.


## v19 additions (2026-10-02)

- **Savings copy (live):** "Less overhead. Lower costs." and "…we pass
  the savings on to you" (homepage band and About paragraph); "Your
  buyers / borrowers get lower costs because our overhead is lower."
  (`/agents`, `/join`). These are cost-structure statements and name no
  baseline. Confirm they are acceptable as written.
- **`RateVsAverage` (built, OFF behind `SHOW_NATIONAL_AVG_COMPARISON`):**
  a dated example rate next to the Freddie Mac PMMS weekly average for the
  same product and week. It shows both rates, points/fees, dates and an
  assumptions footnote, and says "below" only when the rate is lower and
  the points are no higher.
  - The full list of claim locations and exact strings is in the v19 patch
    log entry.
  - Before the flag goes on, confirm:
    - Reg Z §1026.24 advertising terms
    - Reg N comparison rules
    - PMMS attribution and permission
    - the cost-side method if PMMS does not publish fees and points
- **M8 prompt rule 1** (DRAFT) now bars comparing any rate with a survey,
  index or benchmark.
