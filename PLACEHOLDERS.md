# PLACEHOLDERS.md — every value to fill before launch

Bracketed values render as-is on the site on purpose: an unfilled
placeholder is visible, a wrong fact is not. Fill each one, then run
`npm run verify`. Values marked **carried over** were already in the repo
before this build (entered by the site owner in earlier patches); they were
not invented here, but each still needs verification on
nmlsconsumeraccess.org and with counsel.

## lib/config.ts (the single source of truth)

| Key | Current value | Fill with |
|---|---|---|
| `PLATFORM` (L1) | LoanM8, LLC · LoanM8 Loan Intelligence | Done (owner 2026-10-29). No NMLS: LoanM8, LLC is not a licensee, so `entityNmls` is gone |
| `SPONSOR` (L1) | Adcom Group Inc dba Home Trust Financial, NMLS 1761573, five state licenses | Done (owner 2026-10-29). WA, OR, CA, TX loans originate here. Entity license per state is derived from `SPONSOR.stateLicenses` |
| `principalMlo.licenses[AZ]` | `AZ-1037722`, sponsor Adcom (Home Trust Financial) | Done (owner business card, 2026-10-30). "Home Financial" was a shortened Home Trust Financial; one sponsor in all five states |
| Principal MLO and Ryder Fasse name / NMLS | 1844143 / 119822 | Done (owner 2026-10-29). The operator's license is `NMLS ID 1844143` in WA, AZ, TX and `CA-DFPI 1844143` in CA |
| `states[*].regulatorName` / `regulatorUrl` | Filled (L1) | Official regulator sites; could not be fetched from the build sandbox, so open each once |
| `states[*].marketed` (L1) | WA, AZ, CA, TX true; OR false | Marketing scope, separate from licensing |
| `demo.loBio` | `17 years … Avg close: 22 days (varies by loan)` | Done (owner 2026-10-30) |
| `entityTradeName` | `LoanM8 Loan Intelligence` (carried over) | Verify trade-name registration in WA, AZ, CA, TX |
| `principalMlo.bioShort` | `[BIO — …]` | Two or three plain sentences; no years-in-business or volume claims unless verifiable |
| `principalMlo.photo` | `[PHOTO]` | Optional headshot path under `/public` (not rendered while bracketed) |
| `principalMlo.licenses[*].sponsorSince` | `[SPONSOR EFFECTIVE DATE]` | Date each current sponsorship took effect |
| `team[Ryder Fasse].bioShort` / `.photo` | `[BIO — …]` / `[PHOTO]` | Same rules as above |
| `team[Ryder Fasse].licenses[OR]` | `NMLS ID 119822`, sponsor since `2021-08-06` (from his NMLS record, v15.1) | Done. Oregon issues no separate number |
| `team[Ryder Fasse].calendly` | empty (or `NEXT_PUBLIC_CALENDLY_RYDER`) | Ryder's booking link; until set, his matched visitors see "Booking link coming soon" |
| `principalMlo.applicationUrl` / `team[Ryder Fasse].applicationUrl` | `[APPLICATION URL — POS / 1003 link]` (or server env `APPLICATION_URL_MLO_001` / `APPLICATION_URL_MLO_002`) | Each MLO's own secure application link (https). Until set, "Start your application" stays hidden for that MLO (v18) |
| `team[Ryder Fasse].title` | `Mortgage Loan Originator` | His signature says "Mortgage Loan Officer"; confirm which to show |
| `contactEmail` | `[EMAIL]` (or `NEXT_PUBLIC_CONTACT_EMAIL`) | Public contact address at loanm8.com |
| `privacyEmail` | `privacy@loanm8.com` | Confirm the mailbox exists |
| `investorContactHref` | `mailto:investors@loanm8.com` (or `NEXT_PUBLIC_INVESTOR_CONTACT_HREF`) | Confirm the mailbox exists, or set a booking link (v14, `/investors`) |
| `demoContactEmail` | `info@loanm8.com` (or `NEXT_PUBLIC_DEMO_CONTACT_EMAIL`) | Where testers ask for the /demo password (v17); confirm the mailbox exists |
| `lenderCountDisplay` | `null` | Leave null unless a verified, current count is approved for display |
| `liveRatesEnabled` | `false` | Leave false until a live pricing integration and counsel sign-off exist |
| `states[washington].requiredDisclosure` | `[STATE-SPECIFIC DISCLOSURE — confirm with counsel]` | Any WA-mandated disclosure text, or empty string if none |
| `states[arizona].requiredDisclosure` | placeholder | AZ disclosure text or empty |
| `states[california].requiredDisclosure` | `[… CA licensing language]` | CA-mandated licensing language |
| `states[texas].requiredDisclosure` | `[… TX recovery-fund / complaint notice]` | TX-mandated complaint / recovery fund notice |
| `states[oregon].requiredDisclosure` | placeholder | Any Oregon-mandated disclosure, or empty |
| `states[*].twoPartyConsent` | WA true, OR false, AZ false, CA true, TX false | Confirm with counsel (Oregon: phone/online chat vs. in-person rules, ORS 165.540) |
| `secondLookRetention` | `[RETENTION — confirm with counsel]` | Retention period for Second Look uploads (also used on /privacy and in the consent screen) |

## Environment variables (`.env.local.example` → Vercel project settings)

| Variable | Fill with |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://loanm8.com` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Public contact address (overrides `contactEmail`) |
| `NEXT_PUBLIC_CALENDLY_BORROWER` | Borrower booking link (every borrower CTA) |
| `NEXT_PUBLIC_CALENDLY_AGENT` | Agent intro-call link |
| `NEXT_PUBLIC_CALENDLY_MLO` | MLO intro-call link |
| `NEXT_PUBLIC_CALENDLY_SECOND_LOOK` | Second Look handoff link |
| `NEXT_PUBLIC_STEALTH_MODE` | `true` until launch; `false` to open the site |
| `DEMO_PASSWORD` | Tester password for `/demo` while in stealth |
| `ANTHROPIC_API_KEY` | Leave unset until prompts are counsel-reviewed |
| `SECOND_LOOK_LIVE` | `false` until counsel confirms retention + prompt |

Empty Calendly variables make every CTA render as "Booking link coming
soon" rather than a dead link (`components/BookingCTA.tsx`).

## Content placeholders

| File | Placeholder | Fill with |
|---|---|---|
| `lib/copy.ts` → `copy.chat.gate.recording` | `[RETENTION — confirm with counsel]` | Chat transcript retention period |
| `lib/content/legal.ts` (privacy, Retention section) | `[RETENTION — confirm with counsel]` × several | Retention per data class |
| `lib/content/legal.ts` (terms, Governing law) | `[GOVERNING LAW AND VENUE — confirm with counsel]` | Governing law and venue |
| `lib/content/legal.ts` / `components/legal/*` | every `[COUNSEL REVIEW]` block | Final legal text (see ATTORNEY_REVIEW_LIST.md) |
| `lib/content/states.ts` | `[STATE-SPECIFIC DISCLOSURE — confirm with counsel]` label | Rendered from config; fill `requiredDisclosure` in config |
| `app/join/page.tsx` | `ROUTING POLICY — to be defined` (source comment) | Define how borrowers are assigned across MLOs; public copy stays neutral until then |
| `lib/prompts/m8-system.ts` | `DRAFT — requires compliance counsel review` | Counsel-reviewed system prompt before `chatLiveAi` flips |
| `lib/prompts/second-look.ts` | `DRAFT — requires compliance counsel review` | Counsel-reviewed prompt before `SECOND_LOOK_LIVE` flips |

## Assets

| Item | Status |
|---|---|
| Favicon | `app/icon.svg` (orb mark) ships; add a raster `app/apple-icon.png` if desired |
| Open Graph image | Not shipped; add `app/opengraph-image.tsx` or a static image |
| Equal Housing Lender logo | Inline SVG house mark with text label; swap for the official logo if counsel requires it |

## How to check nothing was missed

```bash
grep -rnoE "\[[A-Z][A-Za-z0-9 #/—:.,'()+-]{3,}\]" lib app components --include=*.ts --include=*.tsx | grep -v "\[slug\]\|\[tool\]\|\[DONE\]"
```

## Pricing (v13, Patch A)

| Item | Where | Current | Needed |
| --- | --- | --- | --- |
| `MLO_ADMIN_USER`, `MLO_ADMIN_PASSWORD` | Vercel env (server only) | unset → `/mlo` returns 404 | Set to enable the admin. Basic auth; replace with real accounts later |
| `PRICING_MANUAL` | Vercel env | unset (off) | `true` once snapshots should replace examples on `/rates` |
| `PRICING_DEMO_EXAMPLES` | Vercel env | unset (on) | `false` to hide example pricing |
| `PRICING_MANUAL_STALE_HOURS` | Vercel env | unset (24) | Hours before a snapshot stops showing |
| Hosted snapshot store | `lib/pricing/store.ts` | file store; read-only on Vercel | Choose a private hosted store (e.g. Postgres) before using `/mlo` in production; `PRICING_STORE_DIR` works on a server with a persistent disk |
| `CONFIG.pricing.examplesAsOf` | `lib/config.ts` | `2026-10-01` | Update when fixtures change |
| Lender `displayConsent` | `lib/pricing/lenders.ts` | all `false` | Set `true` per lender when written consent is on file (PRMG, Plaza, HomeXpress block publishing until then) |
| Admin identity verification | `/mlo/setup` | "Not verified by an administrator" | Needs real accounts and the v21 attestation spec |

## Brand assets (v14)

| File | Current | Fill with |
| --- | --- | --- |
| `public/brand/m8-monogram.svg` | **Placeholder**: a circle with an M and an 8, drawn as outlines | The real M8 monogram: single-colour outline on transparent. Any stroke colour; the hero orb recolours it from its alpha channel |

## Routing (v15, Patch B)

| Item | Where | Current | Needed |
| --- | --- | --- | --- |
| `MLO_ROUTING` | Vercel env (server) | unset → **on for previews, off in production** (v17) | `true` turns it on in production; `false` turns it off on previews too. Pages render per request while on |
| `NEXT_PUBLIC_CALENDLY_RYDER` | Vercel env | unset | Ryder's booking link |
| `CONFIG.routing.stateAssignments` | `lib/config.ts` | WA/AZ/CA/TX → principal, OR → Ryder | Edit when coverage changes; the build fails on an invalid assignment |
| Closing-costs range for Oregon | `app/tools/closing-costs/page.tsx` | not offered | Owner-supplied low/high % if Oregon should appear in that tool (ranges are never invented) |
| `/standards` page | — | does not exist | Brief B4: "vetted" in credential copy only once a page describes the vetting process. v14's owner-approved hero/agents copy already says "vetted" |
| Choose-mode sort options | `lib/routing.ts` | random order only | Distance / language / availability need data per MLO before they can be offered |
| Notify-me for unlicensed states | — | not built (optional in the brief) | Decide whether to collect an email and where it goes |
| Rate Strategy Brief / attestation block swap | — | no live brief or attestation block exists yet | Swap them through MloContext when v13 receipt / v21 attestation are built |


## Rate vs. national average (v19, Round 3 Item 3b) — OFF

Nothing renders until **all** of these are real and counsel has signed off
(see the v19 patch log entry for the claim-location list).

| Item | Where | Current | Needed |
| --- | --- | --- | --- |
| `SHOW_NATIONAL_AVG_COMPARISON` | Vercel env (server) | unset → off | `true` only after counsel review; try a preview first |
| `benchmark.weekOf` | `lib/config.ts` `pricing.benchmarkComparison` | `[PMMS WEEK — …]` | The PMMS release date (YYYY-MM-DD) for the same week as `examplesAsOf` |
| `benchmark.rate` | same | `[PMMS 30-YEAR FIXED AVERAGE RATE — percent]` | That week's published 30-year fixed average, e.g. `6.30` |
| `benchmark.feesAndPoints` | same | `[PMMS 30-YEAR FIXED AVERAGE FEES AND POINTS — percent of loan]` | That week's published fees and points. If the source doesn't publish it, the component stays off until counsel decides |
| `benchmark.basis` | same | `[PMMS BASIS — …]` | The release's own description of what its average assumes, quoted |

## Demo, live chat and lender brands (v21–v24)

| Item | Where | Current | Needed |
| --- | --- | --- | --- |
| `CONFIG.demo.loBio["mlo-001"]` | `lib/config.ts` | "17 years originating · Avg close: 18 days · Available now · in office" (carried over from the v7 demo) | VERIFY both claims before the stealth gate lifts |
| `RESEND_API_KEY`, `MLO_NOTIFICATION_EMAIL`, `LOANM8_FROM_EMAIL` | Vercel env (server) | unset → the demo's question box says it couldn't send | Set all three for `/api/chat-question` to email questions to the loan officer. The old `…_NOTIFICATION_EMAIL` and `RATEM8_FROM_EMAIL` names are no longer read |
| `M8_LIVE_CHAT` | Vercel env (server) | unset → no live tab on `/demo`, `/api/m8-chat` returns 404 | `true` (plus `ANTHROPIC_API_KEY`) only after counsel signs off the draft prompt |
| Kind Lending logo | `public/lenders/` | the supplied file is cropped ("ind Lendir") → monogram | A complete logo file |
| Terms review: Rocket Pro TPO, Nations Direct, Aven, HELIX, NFTYDoor | `lib/pricing/lenders.ts` (`termsReviewed`) | `false` → not publishable on `/rates` snapshots | Review each lender's broker terms (as `docs/work/pricing-integration-findings.md` did for the original 12), or record written consent |
| `CONFIG.lenderCountMax` | `lib/config.ts` | 14 | Matches the 14-lender panel (v27). A test keeps them equal |
