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

- Washington: `entityLicense`, `mloLicense`, regulator name/URL, and any mandated disclosure text. Confirm "serving Western Washington" as the service-area statement.
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
