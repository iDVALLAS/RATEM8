# LoanM8 — Project Handoff README

Continuity log for the LoanM8 (formerly RateM8) build. Every patch adds
an entry here (newest first, after the Pre-Launch To-Do) so any future session — mine, another agent's, or a human
picking this up — can pick up without re-explaining context.

---

## Pre-Launch To-Do — MUST clear before lifting the stealth gate

Ordered roughly by dependency. Most items block the day you flip
`NEXT_PUBLIC_STEALTH_MODE=false` and open loanm8.com to real borrowers.

### Compliance / legal (blocking — attorney sign-off required)

1. **Attorney review of the v10.1 real M8 system prompt** — currently
   `lib/m8.ts` ships the v10.0 PLACEHOLDER prompt. Real M8 personality
   with brand voice, 8 principles, anti-steering rules, refusal
   patterns still needs writing + attorney redline.
2. **v10.2 compliance guardrails** — recording consent, transcript-
   on-demand, audit logging, rate limiting on `/api/m8-chat` and
   `/api/demo-auth`. None shipped yet. Blocking for public voice or
   chat with real borrowers.
3. **Attorney review of the generated footer disclaimer** — the
   `buildDisclaimer()` output in `lib/licensing.ts` is patch-author
   boilerplate. Needs redline before public.
4. **LoanM8 trade name registration** confirmed in each licensed
   state (WA/AZ/CA/TX). Footer claims *"LoanM8 Loan Intelligence is
   the trade name of Shapiro Home Loans LLC"* — that must be
   filed/registered under LoanM8, not just RateM8.
5. **Verify sponsor NMLS numbers** on nmlsconsumeraccess.org —
   Home Trust Loans #1761573, Home Financial AZ #1037722.
6. **"49 STATES" badge on `/demo` LO card** — flagged in v9 for
   attorney review. Decide: keep as platform-coverage messaging,
   swap to per-state dynamic, or remove.
7. **Two-party recording consent disclosure** in the UI before any
   voice conversation feature ships in WA or CA (both LAUNCH_STATES
   are two-party consent).

### Voice conversation (deferred, wanted before public launch)

8. **Vapi live push-to-talk voice chat** on the M8 orb. Tap orb →
   ElevenLabs Aussie TTS + Deepgram STT + Claude via Vapi WebRTC.
   ~1 focused PR of work once you have a Vapi account + assistant
   configured. Skipping wake-word ("M8" continuous listening) per
   user direction. See "Phase 2" write-up in session context.
   - Prereqs: Vapi account, ElevenLabs voice picked (Charlotte
     female / Callum male / voice-clone your own), $50 Vapi budget
     cap set, recording-consent UI banner in place (item 7 above).

### Feature completeness (nice-to-have, not strictly blocking)

9. **v11 Tier 1** — JSON-LD schema on every page, per-page metadata
   completeness, next-sitemap wiring, Lighthouse perf audit,
   analytics event schema. Highest SEO leverage before traffic
   arrives.
10. **v11 Tier 2 remaining** — glossary at `/learn/glossary`
    (40–60 terms), loan program comparison at `/learn/loan-types`,
    local market pages at `/markets/[city]` driven off
    LAUNCH_STATES, Freddie Mac PMMS rate-context module
    (compliance flag on the last one).
11. **v11 Tier 3** — mobile homepage rebuild to match approved
    mockup, Rate Strategy Brief PDF generator, verified-trust
    module.
12. **v11 Tier 4** — chat polish (typing indicator, graceful SSE
    reconnect, mobile full-screen modal), 3-card anti-steering
    display with sample-data label.
13. **v11 Tier 5** — MDX content pipeline, email capture via ESP,
    agent subdomain routing scaffold (`agentname.loanm8.com`).
14. **URL-param sharing on calculators** — every `useState` input
    already structured; just needs a `useEffect` per calc to sync
    inputs with `URLSearchParams`. Small follow-up.

### Ops / infra (blocking, quick clicks)

15. **Delete duplicate `ratem-8-m4oy` Vercel project** — every push
    still builds twice until you do. Zero risk if only you use it.
16. **Rotate leaked Anthropic API key** (if not already done) —
    the one pasted mid-session lives in this transcript.
17. **Set `$50/month spending cap`** on the Anthropic API in
    console.anthropic.com for the chat API, and another `$50/month`
    on Vapi when that's set up.

### Content / brand (Jason's queue)

18. **Fill placeholder phone number** in `lib/licensing.ts`
    (`phone: "[(XXX) XXX-XXXX]"`) — currently unused on any live
    page, but should be real before you build a `/contact` route.
19. **Personal story paragraphs** for `copy.aboutPage.sections[0].body`
    ("Why LoanM8 exists") — currently a `[Jason's personal story
    goes here — a few paragraphs about ...]` placeholder.
20. **Real `greeting.mp3` recording** — obviated once Vapi live
    voice is in (Vapi handles TTS live, no static file needed).
    Skip this if item 8 lands first.
21. **`ratem8.com` email addresses** — currently `jason@ratem8.com`,
    `privacy@ratem8.com`, `m8@ratem8.com` in code defaults and
    Vercel env vars. Update to `@loanm8.com` when Jason sets up
    loanm8.com email (or configure forwarding at Cloudflare).

---

## v15.1 — Ryder Fasse's Oregon license from his NMLS record (2026-10-01)

- Source: an NMLS Consumer Access screenshot from the owner.
  - Oregon MLO license, "Lic/Reg #: None", Approved, renewed through 2026.
  - Authorized to represent NMLS 1761573 since 08/06/2021.
- `lib/config.ts`: Ryder's OR license is now `NMLS ID 119822` (Oregon uses
  the NMLS ID) and `sponsorSince` is `2021-08-06`. Both were placeholders.
- His record also lists AZ and WA licenses. Per the owner he is
  **Oregon only on this site**, so they are not added.
- Open question: NMLS names 1761573 **Adcom Group Inc**, but config says
  "Home Trust Loans". Confirm the legal name or DBA to print before
  launch.
- Verified: `npm run verify` passes.

## v15 (Patch B) — State-based MLO routing, location beacon, Oregon (2026-10-01)

**One line:**
- Oregon is the fifth licensed state.
- Ryder Fasse (NMLS 119822, Home Trust Loans) is added for Oregon.
- Sponsorship is now data: per MLO, per state, with a date.
- Routing derives assign/choose per state, and the build fails on an
  invalid setup.
- Middleware resolves each visitor (choice → property state → IP region →
  ask). One context swaps the loan officer everywhere.
- A location beacon shows the state and match.
- All of it sits behind `MLO_ROUTING`, which is off by default.

### Decisions (owner, 2026-10-01)
- Ryder Fasse: NMLS 119822; sponsor Home Trust Loans (NMLS 1761573; his
  signature's "Home Trust Financial" was confirmed as Home Trust Loans).
  **Oregon only.** The principal MLO stays the loan officer for WA (and
  AZ/CA/TX).
- Add Oregon as a fifth licensed state.

### What shipped (brief B1–B5)
- **B1 config** (`lib/config.ts`):
  - `Mlo` gains `id` (neutral: `mlo-001`, `mlo-002`), `photo`, `calendly`
    and `licenses[]` (state, license, sponsor, `sponsorSince`).
  - `CONFIG.routing` holds `operatorMloId`, `stateAssignments` and
    `routingModeOverride`.
  - `STATES` derives `sponsor`, `sponsors` and `mloLicense` from the
    licenses. Oregon state entry added.
  - `lib/routing.ts`:
    - derives `assign`/`choose` with the same-sponsoring-entity rule
    - `validateRouting()` throws when the module loads, which fails
      `next build`
  - Pricing tenants now take seats from the MLOs each sponsor actually
    sponsors.
- **B2 resolution:**
  - `middleware.ts` runs `resolveRoute()` per request and forwards
    `x-lm8-route` (ids only; a client-sent copy is dropped).
  - The layout decodes it with `lib/route-context.ts` and fills
    `MloProvider`.
  - The property state wins over the IP state (`moved`).
  - Unlicensed state: no assignment, no `/rates` pricing, and an honest
    line.
- **B3 swap:**
  - Footer `MloFooterLine` shows name, title, NMLS, state license number
    and sponsor together.
  - About card shows the matched MLO, a choose list, or the generic card.
  - Booking CTA uses the matched MLO's own link.
  - State-page originator row only names an MLO licensed in that state.
  - M8 system prompt gets a "This visitor" section via `m8RoutingFacts()`,
    and the live opening line swaps the same way.
  - `/disclosures` lists each MLO's licensed states, and the per-state
    MLO licenses and sponsors.
- **B4 credential line:** "Licensed in [State] · NMLS #[ID] · Verify on
  NMLS Consumer Access →". No "vetted", since `/standards` doesn't exist.
- **B5 beacon** (`components/LocationBeacon.tsx`):
  - breathing dot on the orb's 4s rhythm, still under reduced motion
  - simplified state outline SVG (`StateOutline.tsx`; pin for other
    states)
  - "[State] · matched with [MLO]" plus "Not right? Change"
  - The picker sets `lm8_property_state` (and `lm8_mlo` in choose
    states) via `POST /api/route-choice`, which returns 404 while the flag
    is off. "Forget my state" clears both.
  - Placement: under the desktop nav, under the mobile hero trust strip,
    and on the MLO card.
  - Privacy gets a "Matching you with a loan officer" paragraph.
- **Oregon everywhere:**
  - `/states/oregon` (generic content; recording consent set one-party,
    flagged for counsel)
  - "Five states. One standard."
  - Join cards and text equivalents derive from `STATES`; `/join` grid is
    three columns.
  - The closing-costs tool leaves Oregon out until a range is supplied.
- **Checks:**
  - `check:identity` also flags 119822.
  - MLO ids are neutral, so no first name appears in code.
  - 14 new tests (92 total).

### Done-when checks (brief B6)
| Check | Result |
| --- | --- |
| Forced headers CA, OR, unlicensed render three internally consistent sites | **Pass.** CA: Jason Shapiro in the beacon (nav and mobile), About card, footer (NMLS 1844143, CA license, Home Trust Loans). OR: Ryder Fasse in all of them (NMLS 119822, OR license, Home Trust Loans). NV: no name anywhere, "We don't have a licensed loan officer in Nevada yet." in the beacon, `/rates` and booking. Each page carries one MLO's name only (7 occurrences, no other). |
| CA IP with an OR property routes to the OR MLO | **Pass.** Cookie `lm8_property_state=OR` + CA header → Ryder Fasse, plus "Matched for the property in Oregon, not California. Licensing follows the property." Unit-tested too. |
| Hardcoded-name CI check passes | **Pass** (207 files). |
| `assign` build fails when an MLO's entity doesn't match | **Pass.** With Ryder's OR sponsor temporarily changed, `next build` exits 1: "OR is assigned to mlo-002, whose OR sponsor is not one of the operator's sponsoring companies. Assign mode requires the same entity; this state must be "choose"." Restored afterwards. Also covered by tests. |

Also verified:
- `npm run verify` passes with the flag off (pages stay static,
  `/states/oregon` prerendered).
- Built and run with `MLO_ROUTING=true`, the browser flow works at 1280px:
  pick Oregon → Ryder plus the move note → footer swaps → "Forget my
  state" → back to California, with cookies cleared.
- The mobile beacon and About card were checked at 390px. No overflow, no
  hydration errors; the only console error is the local Analytics 404.

### Every `[PLACEHOLDER]` (see `PLACEHOLDERS.md`)
- **Principal MLO:**
  - `[BIO — …]` and `[PHOTO]`
  - `[WA MLO LICENSE #]`, `[AZ MLO LICENSE #]`, `[CA MLO LICENSE #]`,
    `[TX MLO LICENSE #]`
  - `[SPONSOR EFFECTIVE DATE]` ×4
- **Ryder Fasse:**
  - `[BIO — …]` and `[PHOTO]`
  - `[OR MLO LICENSE #]`
  - `[SPONSOR EFFECTIVE DATE]`
  - booking link (`NEXT_PUBLIC_CALENDLY_RYDER`, unset)
  - title to confirm (Originator vs Officer)
- **Oregon:**
  - `[OR ENTITY LICENSE #]`
  - `[OR regulator name — e.g. Oregon Division of Financial Regulation]`
    and `[OR regulator URL]`
  - `[STATE-SPECIFIC DISCLOSURE — confirm with counsel]`
- **Carried over and still open:** entity NMLS, other states' entity
  licenses, regulators and disclosures, and `[EMAIL]`.
- **Not built (owner decision or data needed):**
  - `/standards`
  - choose-mode sort data (distance, language, availability)
  - notify-me for unlicensed states
  - the Oregon closing-costs range
  - the Rate Strategy Brief and attestation swap (neither exists yet)

### Attorney review
See `ATTORNEY_REVIEW_LIST.md` → "v15 additions": routing and assignment
(assign/choose rule, choose disclosure, IP naming, unlicensed handling,
Oregon, cookies), lender-note display, pricing display, and credential
copy.

### Rough edges and next up
- With `MLO_ROUTING=true`, every page renders per request; caching
  trade-off accepted.
- The brief's `config/mlos.ts` and `config/states.ts` paths were kept in
  `lib/config.ts`, the repo's single source of truth.
- Local runs need the `x-vercel-ip-country(-region)` headers; Vercel sets
  them in production.
- Next: Patch C (rate sheet engine) only on approval.

## v14 — Site change list: hero popups, Partner nav, /investors, generic MLO wording, orb monogram (2026-10-01)

**One line:** the owner's seven-edit change list. Voice and Q & A open
solid popups that route to `/chat` after 5.5s. The hero subhead and trust
line are rewritten. "Western" is gone from Washington. The nav gets the
two-group layout with a "Partner" dropdown, and there is a new
`/investors` page. Loan officers are generic everywhere, with a minimal
`MloContext` for naming a matched MLO. The hero orb carries a raised
M8 monogram, which is still a placeholder.

### Edits
1. **Voice / Q & A popups** (`HeroOrb.tsx`, `home.css`):
   - Each popup is a solid `--color-m8-panel` (#0d1a15) panel with a 1px M8
     Green border, at z-index 30 inside the hero orb column, which is lifted
     to z-index 5 (`.hm-hero__orbcol`).
   - Placement: Voice opens to the left of the button row and Q & A to the
     right, both centred vertically, 230px wide, with a 10px gap. Below
     768px both drop under the button row at full width.
   - Each popup has a breathing dot and a progress line that fills over
     5.5s and then calls `router.push("/chat")`. Tapping the popup goes to
     `/chat` immediately; × or Esc cancels.
   - Only one popup is open at a time. The open button switches to a solid
     green border.
   - Reduced motion turns off the animations but keeps the timer.
   - The old toast and the "M8 is an AI, not a person…" line are removed.
     Tapping the orb opens the Voice popup.
2. **Hero subhead:** new copy. Desktop 18.4px → 16px; mobile 16.8px →
   14.6px (same ratio). Line-height stays 1.6.
3. **Trust line under the grid:** `copy.hero.trustLine`. Phrases are joined
   with non-breaking spaces, so the line wraps only at the dots.
4. **"Western" removed:**
   - `CONFIG.states[WA].serviceArea` is now "Washington" and `stateChip()`
     returns "WA".
   - The WA state page's "Why 'Western Washington'" section is now
     "Serving Washington" (statewide).
   - Also updated: the join copy and text equivalent, the sample-brief area
     row and alt text, and the docs (`README.md`, `docs/SITE_BRIEF.md`,
     `ATTORNEY_REVIEW_LIST.md`, `docs/ai-visibility-checklist.md`).
5. **Nav and `/investors`:**
   - New `components/PartnerMenu.tsx`, using the disclosure pattern:
     - opens on hover, click or tap
     - closes on outside click or Esc, with focus returning to the trigger
     - Enter or Space toggles; arrow keys, Home and End move between items
   - A click right after a hover-open keeps the menu open.
   - Groups: Calculators, M8 Chat and Partner in `--fg-soft`, a thin
     divider, then Principles, About and Privacy in `--muted`.
   - Mobile: Partner expands inline, with a horizontal rule between the two
     groups.
   - The footer Partners column now matches the dropdown labels.
   - `/investors`: orb, headline, three cards, a "Reach out" button pointing
     at `CONFIG.investorContactHref` (mailto today; swappable through env),
     and the securities fine print. There is no raise amount, valuation,
     terms, returns or structure.
6. **Generic loan officer wording and `MloContext`:**
   - `lib/mlo-match.ts` holds the rule (`source: none | ip | borrower_stated
     | chosen`; in borrower-choose states, or when the state's routing is
     unknown, IP alone never names anyone).
   - `components/mlo/MloContext.tsx` provides `MloProvider` (in
     `app/layout.tsx`, default `source: "none"`), `MloText`,
     `MloFooterLine`, `MloLicenseItem` and `MloNamedOnly`.
   - Each MLO string in copy has a generic version and a `…Named` template
     (`{first}` / `{name}`).
   - Whenever a name renders, the footer line renders that MLO's name, title
     and NMLS number on the same page.
7. **Orb monogram** (`OrbMonogram.tsx`, `home.css`):
   - The SVG filter colours the asset M8 Green, adds a specular bevel lit
     from the upper left (surfaceScale 4, exponent 18, light `--color-m8-mist`
     #E1F5EE), and drops a Forest shadow at 75% (offset 1.8/2.4, blur 1.6).
   - Placement: 14–55% from the left and 11–52% from the top of the orb.
     It sits under `.orb::before` and over the base gradient, clipped to the
     orb, with perspective 180px, `rotateY(-24deg) rotateX(20deg)
     scale(1.02)`, and a radial mask solid to 48% and faded by 76%.
   - Reveal: once per session (`sessionStorage`), 3.5s. The smudge drops to
     25% while the monogram rises to 62%. After that, hover or focus shows
     it at 30%.
   - Reduced motion: a static 40% display for 3s.
   - Hero orb only. `aria-label="M8, LoanM8's AI assistant"`.

### Edit 6a replacements (file, old → new)
| File | Old | New |
| --- | --- | --- |
| `lib/copy.ts` agents card "One person owns the file." | "Jason. Not a processor…" (via `MLO_REF_CAP`) | "A licensed, vetted loan officer of your choosing. Not a processor in another time zone. You call once, you get the answer." (named: "{first}. Not a processor…") |
| `lib/copy.ts` how-it-works step 03 | "Jason checks the file, answers the hard questions, and closes the loan. One person, start to close." | "A licensed loan officer checks the file…" (named: "{first} checks the file…") |
| `lib/copy.ts` About heading | "Jason Shapiro." | "Licensed loan officers. No call center." (named: "{name}.") |
| `lib/copy.ts` About sub | "NMLS-licensed Mortgage Loan Originator. M8 is the tool. I'm the human on the line." | "Every loan on LoanM8 is closed by one NMLS-licensed Mortgage Loan Originator, start to finish. M8 is the tool. A human is on the line." (named: original line) |
| `components/home/About.tsx` card | Jason Shapiro · title · NMLS # | Generic card "A licensed, vetted loan officer" + NMLS Consumer Access lookup (named: that MLO's card with their NMLS #) |
| `lib/copy.ts` /agents "The basics" | "You introduce a buyer. Jason answers during business hours…" | "…Your licensed loan officer answers during business hours…" (named: "{first} answers…") |
| `lib/copy.ts` calculators CTA | "…Jason can look at your actual situation." | "…A licensed loan officer can look at your actual situation." (named: "{first} can…") |
| `lib/config.ts` `MLO_REF*` (feeds `/ai`, `/ai.md`) | "Jason" / "Jason Shapiro, NMLS #…" | "your licensed loan officer" / "a licensed, vetted loan officer" |
| `components/Footer.tsx` | "Jason Shapiro, Mortgage Loan Originator, NMLS #…" on every page | `MloFooterLine` (nothing until matched; then name + NMLS #) |
| `components/states/LicenseBlock.tsx` "Loan originators" | Jason Shapiro NMLS #… | Generic line + NMLS Consumer Access lookup (named: MLO + NMLS #) |
| `lib/prompts/m8-system.ts` facts | roster "Jason Shapiro, Mortgage Loan Originator, NMLS #…" | `GENERIC_MLO_LINE` + "never name an individual loan officer unless one is listed above" |
| `app/layout.tsx` JSON-LD | Person (Jason Shapiro, NMLS) on every page | moved to `/disclosures` only |
| `app/tools/va-funding-fee/page.tsx` | "Talk to Jason" / "Jason confirms via COE at file start." | "Ask your loan officer" / "Your loan officer confirms it from your Certificate of Eligibility (COE) when the file starts." |
| `components/DemoPasswordGate.tsx`, `app/api/demo-auth/route.ts` | `jason@ratem8.com` typed inline | `CONFIG.demoContactEmail` (same address, now in config) |

### Files
- New:
  - `components/PartnerMenu.tsx`
  - `app/investors/page.tsx`
  - `components/mlo/MloContext.tsx` and `MloContext.test.tsx`
  - `lib/mlo-match.ts` and `mlo-match.test.ts`
  - `components/home/AboutCards.tsx`
  - `components/home/OrbMonogram.tsx`
  - `public/brand/m8-monogram.svg` (placeholder)
- Changed:
  - Config and copy: `lib/copy.ts`, `lib/config.ts`, `lib/site.ts`,
    `lib/content/{home,join,sample-brief,states}.ts`,
    `lib/prompts/m8-system.ts`
  - Styles: `app/globals.css`, `components/home/home.css`
  - App: `app/layout.tsx`, `app/agents/page.tsx`, `app/disclosures/page.tsx`,
    `app/demo/page.tsx`, `app/api/demo-auth/route.ts`,
    `app/tools/va-funding-fee/page.tsx`
  - Components: `components/{Nav,Footer,Orb,DemoPasswordGate}.tsx`,
    `components/home/{Hero,HeroOrb,ActionGrid,About,AgentsBand,HowItWorks}.tsx`,
    `components/motion/StepList.tsx` (`body: ReactNode`),
    `components/calc/CalcPage.tsx`, `components/states/LicenseBlock.tsx`
  - Checks and tests: `scripts/check-identity.mjs` (now also flags first
    names), `scripts/qa/overflow.mjs` (+`/investors`), `vitest.config.mts`
    (component tests, JSX transform)
  - Docs: `README.md`, `docs/SITE_BRIEF.md`,
    `docs/ai-visibility-checklist.md`, `ATTORNEY_REVIEW_LIST.md`,
    `PLACEHOLDERS.md`, `CLAUDE.md`

### Verified
- `npm run verify` passes: lint, `check:copy`, `check:identity`, 78 tests,
  build and `check:bundle`.
- Browser, 1280px and 390px:
  - **Popups:**
    - The popup is on top at its centre and corners on both widths.
    - Redirects landed after 5.57s on desktop and 5.57s on mobile.
    - × cancels (still on `/` after 6s). Tapping the popup goes in 60–110ms.
    - Reduced motion: animations off, redirect still at 5.5s.
    - Only one popup at a time; the open button shows a solid border.
  - **Partner dropdown:**
    - Hover, click, touch tap (desktop width and the mobile sheet), and
      outside click all work.
    - Keyboard: Enter, Space, the arrow keys, Home, End and Esc all work,
      including wrap-around and focus returning to the trigger.
    - The panel is solid with a green border and sits on top of page
      content.
  - **Monogram** (measured opacity):
    - 0 → 0.62 → hold → 0 over 3.5s, with the smudge going 0.7 → 0.25 →
      0.7.
    - Hover shows 0.3. A second load in the same session does not replay.
    - Reduced motion: a static 0.4 for 3s, then hidden.
    - Rendered only on the hero orb.
  - **Frame rate**, headless Chromium with a software GPU at 390px, DPR 3:
    about 58 fps during the reveal both unthrottled and at 4× CPU throttle,
    with no drop against the no-reveal baseline. No PNG fallback was
    needed. This is not a real-device measurement.
- `scripts/qa` audits: overflow is clean on every route at both widths,
  including `/investors`; the only console error is the local Vercel
  Analytics 404. Fonts: 0 findings. Footer chips are uncovered. About
  lands clear of the nav.
- Rendered-HTML sweep of 27 routes:
  - Zero "Western" anywhere.
  - "Jason" appears only on `/disclosures` (the licensing register,
    deliberately kept) and on the `/demo` gate's contact email.
  - The individual NMLS number appears only on `/disclosures`.

### Flags and decisions for the owner
- **Monogram asset is a placeholder.** `public/brand/m8-monogram.svg` is a
  circle with an M and an 8. Drop the real single-colour outline file in at
  the same path; nothing else changes.
- **The two-group nav did not exist before this patch.** The brief said to
  keep it "exactly"; it was a flat list. It is built here to the brief's
  description.
- **`/disclosures` still names every MLO with their NMLS number** (and now
  carries the Person JSON-LD). It is the licensing register; say if you want
  it context-driven too.
- **Q & A no longer opens the booking link**; per the brief it routes to
  `/chat`.
- **Popups and the dropdown are the dark panel in Paper theme as well**
  (fixed colour per the brief).
- **Demo gate email** `jason@ratem8.com` is unchanged, but it now lives in
  config (`NEXT_PUBLIC_DEMO_CONTACT_EMAIL` overrides it).
- **"Western" left alone:** none in shipped code. Two mentions remain in
  docs, both history: the "One-shot site build (2026-09-29)" entry of this log ("WA serving Western
  Washington", a dated record) and the `docs/SITE_BRIEF.md` note recording
  that "Western" was dropped.

### Next up
- Patch B (state routing, location beacon, sponsorship as data) fills
  `MloContext`. Its value needs `borrowerChooses` per state so that IP
  matches can name an MLO in assign states.

## v13 (Patch A) — Example pricing, manual pricing snapshots, MLO admin (2026-10-01)

**One line:** example pricing ships on `/rates` in the anti-steering
three-card layout; a licensed person can publish dated, anonymized manual
snapshots (pulled from ARIVE) through an auth-gated `/mlo` admin; numbers
come only from code; hardcoded-identity and browser-bundle checks join
`npm run verify`.

**Numbering:** next free number in this log. If your roadmap reserves v13
for the shop receipt spec, renumber this entry.

### Decisions (owner, 2026-10-01)
- **Provider path: manual pull.** APIs and the rate sheet engine (Patch C)
  paused. See `docs/work/pricing-integration-findings.md` §0b.
- **Sponsorship is data** that changes often (Patch B design; not built yet).
- **Example pricing ships on** (owner reports counsel approval).

### Files
- New: `lib/pricing/` (types, apr, canonical, anonymize, antiSteering, build,
  lenders, tenants, playbook, store, publish, display, summary,
  providers/mock, providers/manual, pricing.test.ts, copy.test.ts),
  `fixtures/pricing/examples.v1.json`, `components/pricing/PricingDisplay.tsx`
  and `pricing.css`, `app/rates/page.tsx`, `app/mlo/` (page, setup, pricing,
  actions, MloChrome, mlo.css), `lib/mlo/auth.ts`, `lib/mlo/flash.ts`,
  `lib/content/mlo.ts`, `scripts/check-identity.mjs`,
  `scripts/check-client-bundle.mjs`.
- Changed: `lib/config.ts` (`CONFIG.pricing` flags), `lib/copy.ts`
  (`copy.pricing`), `middleware.ts` (`/mlo` Basic auth before the stealth
  gate), `next.config.ts` (6 MB server-action body for source uploads),
  `lib/site.ts` + `app/sitemap.ts` (`/rates`, noindex, out of sitemap),
  `lib/prompts/m8-system.ts` (rule 1 allows dated examples only),
  `app/api/m8-chat/route.ts` (appends the computed example summary),
  site-wide "LoanM8 displays no rates" claims rescoped (calculators,
  llms.txt, /ai, OpenAPI description, state pages), `package.json`
  (`check:identity`, `check:bundle`, `verify`), `.gitignore` (`/.data/`),
  `scripts/qa/overflow.mjs` (+`/rates`), `COMPLIANCE.md` rule 1,
  `ATTORNEY_REVIEW_LIST.md`, `PLACEHOLDERS.md`, `AGENTS.md`, `CLAUDE.md` §4b.

### Done-when checks (brief A3)
| Check | Result |
| --- | --- |
| Mock provider produces a full PricingRun that regenerates byte-identically from stored data | **Pass** (`pricing.test.ts`, all three scenarios; manual snapshots too) |
| Changing a playbook note cannot change any ranking | **Pass** (test publishes a snapshot, rewrites every note, compares the run byte-for-byte and the selection) |
| Credentials never in client bundles, logs, or Ledger rows | **Pass for what exists:** the manual path stores no engine credentials; admin credentials are server-side env only; `check:bundle` scans every browser file for admin variable names, lender names and server-only fields; the audit log records actor, action and hashes only |
| Wizard works for a second tenant with no code changes | **Pass at the data and admin level:** tenants come from config sponsors; the AZ brokerage (Home Financial) publishes with no code change, and cross-brokerage publishing is refused (test + browser) |

### QA
| Item | Result |
| --- | --- |
| `tsc --noEmit` | pass |
| ESLint | pass |
| `check:copy` (208 files) | pass |
| `check:identity` (192 files; planted name caught) | pass |
| vitest: 5 files, 70 tests (25 new) | pass |
| `next build` | pass |
| `check:bundle` (86 browser files) | pass |
| Overflow audit, 390px and 1280px, all routes incl. `/rates` and `/mlo/*` | pass |
| Font audit | pass (0 findings) |
| `/mlo/*` without credentials / wrong password / unset env | 401 / 401 / 404 |
| Browser end to end: save lenders → screened note rejected → valid note saved → snapshot published with screenshot → `/rates` shows "Rate snapshot · pulled …" with the note under its letter and no real lender name in the HTML | pass |
| Pricing copy never says "live" | pass (test) |

### Not built (blocked, not skipped)
- **Wizard step 2 (engine credentials)** — not needed on the manual path.
- **Wizard step 6 (attest with v21 signing)** and admin-only `verified_at`
  — need the v21 spec and real accounts; neither exists in the repo.
- **v11a schema and Ledger** — specs not in the repo. A write-once file
  store with an audit log stands in behind `SnapshotStore`. It is
  **read-only on Vercel**, so production `/mlo` cannot save until a private
  hosted store is chosen.
- **Mobile "LIVE RATE PREVIEW" swipe card** — does not exist in the code;
  the `/rates` eyebrow already reads "// example rate preview".
- **Patches B and C** — not started (STOP).

### Known rough edges
- The admin uses one shared Basic-auth login; there are no per-person
  accounts, so the audit log's actor is that username.
- Screening is a word list. It errs toward rejecting (e.g. "senior
  underwriter" trips the age rule); the MLO rephrases.
- APR excludes prepaid interest, escrow, mortgage insurance and third-party
  charges (stated on every page). Fine for the 20%-down examples; a
  low-down-payment scenario would need mortgage insurance in the APR.
- `/rates` is not yet linked from the nav or homepage (deliberate until
  the owner reviews it).

### Next up
- Owner: review `/rates` on the preview; send the ARIVE email (findings
  §10 Q2–4) and the consent emails to PRMG, Plaza and HomeXpress (§12).
- Choose a private hosted store, then set `PRICING_MANUAL=true` and the
  admin env vars in Vercel.
- Patch B (state routing, sponsorship-as-data) after approval.

---

## v12 — Sans headline system, orb actions, "human authentication" line, stage backdrop fix (2026-09-29 → 30)

**One line:** the site-wide sans (Geist) headline treatment with gradient
accent words, the Voice / Q & A stitched actions under the hero orb, the
"human authentication" line with a fingerprint mark under the tagline,
hand-drawn underlines removed, and the fix for the green stage backdrop
that was covering the About section and the top of the footer.

Numbering: the v11 tiers were the last numbered series; the one-shot
site build (bottom of this file) sits between them and this entry. From
here on, every patch takes the next integer. The branch is
`claude/quirky-feynman-t01120`, PR iDVALLAS/RATEM8#19 (open, preview
only, not promoted).

### Commits in this patch
- `5eb1449` feat(type,hero): sans headline style site-wide; Voice / Q & A
  stitched actions under the orb
- `0298ac0` style: remove hand-drawn underlines site-wide; "human
  authentication" line with fingerprint mark under the hero headline
- `100ca62` fix: clip the stage backdrop to the stage so it stops covering
  About and the footer
- (this commit) docs: CLAUDE.md, this entry, typography guide, `scripts/qa/`

### Files created or changed
- `app/globals.css` — sans headline rules under `:root[data-type="sans"]`
  (Geist 300, sheen, gradient accents, 26 page-level headline selectors),
  `.hand-underline { display: none !important }`, `main [id] { scroll-margin-top: 88px }`.
- `app/layout.tsx` — Fraunces `next/font` import removed; `data-type="sans"`
  set statically on `<html>`; JetBrains Mono `preload: false`.
- `lib/theme.ts` — type-variant toggle code removed (theme boot only).
- `components/TypeToggle.tsx` — deleted. `components/Nav.tsx` — back to
  the theme toggle only.
- `components/home/HeroOrb.tsx` — rewritten: orb tap + Voice button →
  pulse / speaking / coming-soon toast; Q & A → borrower booking link or
  coming-soon toast; toast overlays instead of pushing layout.
- `components/home/Hero.tsx` — headline block with `FingerprintMark`
  (inline SVG) and the "human authentication" line; trust strip moved
  below the fold.
- `components/home/home.css` — `.stitch-btn`, `.hm-orb-actions`,
  `.hm-orb-toastwrap`/`.hm-orb-toast`, `.hm-hero__auth*`, `.hm-hero__fp`,
  hero spacing so only orb → headline → sub → four boxes are on the
  first screen.
- `components/motion/Stage.tsx`, `components/motion/stage.css` —
  `.stage-backdrop-layer` (absolute, `overflow: clip`) wraps the sticky
  backdrop; the `-100svh` bottom margin is gone.
- `lib/copy.ts` — `hero.authLine`, `hero.authWord`, `hero.voiceLabel`,
  `hero.qaLabel`, `hero.voiceComingSoon`, `hero.qaComingSoon`
  (`hero.orbCaption` kept but unused).
- `lib/content/home.ts` — orb aria label wording.
- `docs/TYPOGRAPHY_GUIDE.md` — owner's sans decision recorded; tagline
  and accent-word sections rewritten to match the code.
- `CLAUDE.md` — new. Project summary, brand rules, working rules, the
  animation architecture as built, file map, dependencies, commands.
- `scripts/qa/overflow.mjs`, `fonts.mjs`, `footer.mjs`, `about.mjs` —
  the Playwright audits used in this patch, moved into the repo.

### Completed and verified
- `npx tsc --noEmit`: 0 errors. `npm run lint`: clean.
- `npm run check:copy`: 179 files, no banned phrases.
- `vitest`: 3 files, 45 tests, all pass.
- `next build`: success, 45 static pages.
- Browser audits against `npm start` (stealth off), Chromium:
  overflow audit at 390px and 1280px on 21 routes, every route `ok`
  (scrollWidth = clientWidth, exactly one `h1`); font audit 0 findings
  (no fallback fonts, no synthesized bold/italic, no sub-10px text);
  footer audit: stage backdrop ends at the stage's bottom edge, footer
  fully visible, state chips render with text; About audit: nav "About"
  lands on `#about` with the heading 218px from the top, clear of the nav.
- Vercel: both preview projects deployed head `100ca62` Ready
  (`Vercel – ratem-8`, `Vercel – ratem-8-m4oy` statuses success).

### QA checklist
| Item | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`) | pass |
| ESLint (`next lint`) | pass |
| Banned-copy scan | pass |
| Unit tests (45) | pass |
| Production build | pass |
| No horizontal overflow, 390px, all routes | pass |
| No horizontal overflow, 1280px, all routes | pass |
| One `h1` per route | pass |
| Font audit (fallbacks, synthesis, <10px) | pass |
| Footer fully visible after fix, chips readable | pass |
| Nav "About" lands on the About section | pass |
| Hero first screen = orb, headline, sub, four boxes (1280×900) | pass |
| Toast never shifts the headline | pass |
| Console errors during audit | one 404 on every route: `/_vercel/insights/script.js` (Vercel Analytics script; only exists on Vercel, expected locally) — not a bug |
| Reduced motion | not re-tested in a browser this patch; covered by CSS/JS fallbacks listed in CLAUDE.md §4.11 |
| Lighthouse | not re-run this patch (last: perf 81–83 in the sandbox, A11y 100) |

### Known bugs, rough edges, things that feel off
- Sheets taller than the viewport pin by their bottom edge (by design so
  every line is readable), which means their headline slides up under
  the sticky nav while the reader is still on that sheet. Visible on the
  Second Look band at 1280×900. Worth eyeballing; a shorter sheet or a
  smaller headline may feel better.
- `components/motion/SlideHeadline.tsx` and a few comments still say
  "Fraunces"; the CSS is Geist. Cosmetic.
- `components/motion/Underline.tsx` and `copy.hero.orbCaption` are dead
  code, kept in case the owner wants the underline or caption back.
- The Voice button is a stub (coming-soon toast). `featureFlags.voice`
  is false and there is no microphone code.
- `Q & A` opens the borrower Calendly link only when the env var is set;
  until then it toasts "Booking link coming soon."
- Two Vercel projects build every push (duplicate `ratem-8-m4oy`; see
  Pre-Launch To-Do item 15).
- The paper theme was checked by eye on the home page only for the new
  auth line; the gradient accent uses a deeper variant there, but a
  contrast pass on every page in paper mode has not been done since the
  sans switch.

### Decisions made
- **Sans over Fraunces, site-wide.** Owner decision after a side-by-side
  ("apply to the whole site 100%"). Fraunces is no longer downloaded;
  `--font-fraunces` aliases to Geist. The brief's typography lock is
  superseded; `docs/TYPOGRAPHY_GUIDE.md` records it.
- **"AI built for mortgages, not borrowed from a chatbot."** replaced
  "Built on Claude" everywhere (owner rejected a "superintelligence LLMs"
  line on my advice: it reads as a claim we cannot substantiate).
- **CSS-only orb, no animation library.** Nothing in the brief asks the
  orb to change shape ("never changes shape"), so no GSAP or flubber was
  added. CSS keeps LCP, reduced motion, and hidden-tab behaviour simple.
  If a shape morph is wanted later, that is a new decision.
- **Backdrop fix as a clipped absolute layer** rather than `overflow:
  clip` on `.stage-root`, so sheet box-shadows still spill outside the
  stage the way they do now.
- **`scroll-margin-top: 88px` on every `main [id]`** so in-page links
  land clear of the sticky nav; no per-section tuning.
- **Toast is an absolute overlay** so the four action boxes stay above
  the fold when it appears.
- **Nationwide MLO vetting is written as policy** ("one originator per
  service area; when an area has its originator it is closed"), never as
  scarcity or urgency, to stay inside `check:copy`.

### Next up
- **Nothing in this patch is half-done.** The animation design described
  in the 2026-09-30 handoff note (orbState reducer with `engaged /
  instructional / overlay`, LivingOrb morph, M8BallSequence,
  M8InfoOverlay, HumanVerifyIcon draw-in) does not exist and would be a
  new patch (v13). Get the owner's spec first; decide the library then
  (a CSS/SVG `stroke-dashoffset` draw-in needs no library; a blob morph
  would need flubber or GSAP MorphSVG, with a `prefers-reduced-motion`
  and hidden-tab pause plan).
- **Tuning passes:** (1) sheet pinning feel for tall sheets (see rough
  edges); (2) StepList activation band (currently −45%/−45%) on short
  phones; (3) toast duration (4200ms) and orb speaking window (1500ms)
  once real voice exists; (4) mobile performance: run Lighthouse on the
  Vercel preview with PageSpeed Insights, not in the sandbox.
- **Risks when touching the animation code:** `SheetStack` measures
  `--sheet-top` with `ResizeObserver`; any change to sheet padding or
  the nav height must keep `--stage-nav` in sync. The backdrop must stay
  inside `.stage-backdrop-layer`. Never put `overflow: hidden` on a
  sheet (it kills nested sticky). Keep the hero h1 in Reveal's CSS mode
  (`immediate`) or LCP regresses. `Reveal` glues trailing punctuation to
  the accent word; changing the split regex can reintroduce "call ."
  gaps. `check:copy` runs on every push; new UI strings go in
  `lib/copy.ts` and must avoid the banned list.
- **Typography confirmed (2026-09-30):** owner said "keep Geist
  site-wide, ignore the Fraunces/Exo note." Settled; see CLAUDE.md §2.

---

## v11 Tier 2 follow-up — Cookie-aware homepage

**Scope:** Authenticated testers now see the full marketing homepage
at `/`; anonymous visitors still see the coming-soon page. Same URL,
different content by auth state. Restores the v8 marketing homepage
(breathing VoiceOrb, TermField, 8 principles, how-it-works, agents
teaser, about Jason) from git history — it was replaced by the
coming-soon page in v9's stealth patch and lived only in git until now.

### What shipped

- **New: `components/ComingSoonHomePage.tsx`** — extracted from the
  previous `app/page.tsx` verbatim. Same "M8 is being built." UX.
- **New: `components/MarketingHomePage.tsx`** — restored from commit
  `4839504` (v7 + V4 term-field restore, right before v9's coming-soon
  replaced it). Uses current copy.ts / licensing.ts values so all
  the LoanM8 renames flow through.
- **Rewrote `app/page.tsx`** — now an async server component that
  reads the `loanm8_demo_auth` cookie via `next/headers` and picks
  the right component:
  - Cookie present → `<MarketingHomePage />`
  - No cookie → `<ComingSoonHomePage />`
- The route becomes dynamic (`ƒ /` in Next's route table) instead of
  static. Same First Load JS as before (~109 kB); server-side selection
  keeps client bundles unchanged.

### Behavior

| Visitor | Homepage they see |
|---|---|
| Anonymous (no cookie) | Coming-soon: "M8 is being built." + Preview the demo link |
| Cookie present (any value) | Full marketing homepage: VoiceOrb, TermField, principles, how-it-works, agents, about |
| Cookie present but STALE (DEMO_PASSWORD rotated) | Still marketing homepage (shallow check). Their `/demo` access is gone, but no confidential content on the marketing site, so low-risk. |

### Cookie check is shallow on purpose

The homepage only checks that the cookie EXISTS. The deep SHA-256
hash validation still lives in `app/demo/page.tsx` before chat renders.
Same pattern the middleware (v9.1) uses. Marketing pages are not
sensitive; the chat is, so the chat does the strict check.

### Post-launch simplification

When `NEXT_PUBLIC_STEALTH_MODE=false` (public launch), `app/page.tsx`
can be reduced to `return <MarketingHomePage />`. The
ComingSoonHomePage component stays in the repo for future maintenance
mode / any-return-to-stealth scenario.

### Verified

- `npm run build` clean; `/` correctly reports as dynamic
- Anonymous request → coming-soon HTML with "M8 is being built"
- Cookie'd request → marketing HTML with "What we owe you" (principles
  heading) and "WHO CLOSES" (about eyebrow); zero coming-soon text

---

## v11 Tier 2 (calculators) — 12 mortgage calculators + /tools index

**Scope:** All 12 calculators from the v11 Tier 2 spec, plus the two
additions the user requested (bi-weekly, payoff acceleration) and the
four I proposed (VA funding fee, PMI drop-off, closing costs, escrow).
Zero compliance surface area — all educational, all client-side, no
personal data collected.

### What shipped

**Shared infrastructure**
- `lib/calc/mortgage.ts` — pure mortgage math (monthlyPI,
  amortizationSchedule, totalInterest, payoffWithExtraPayment,
  payoffWithLumpSum, extraNeededForTargetMonths, biWeeklyComparison).
  All pure functions, unit-testable, no React, no I/O.
- `lib/calc/format.ts` — display formatters (formatDollars,
  formatDollarsCents, formatRate, formatPercent1, formatMonths).
- `components/calc/CalcInput.tsx` — `CalcInput`, `DollarInput`,
  `PercentInput`. Same brand card treatment across all 12 calcs.
- `components/calc/ResultCard.tsx` — `ResultCard`, `ResultRow`.
- `components/calc/CalcLayout.tsx` — page shell: Nav + breadcrumb +
  hero + calculator body + soft CTA to /demo + Footer. Standardizes
  the "Want to talk this through with M8?" close-out across all 12.

**12 calculators at `/tools/[slug]`**

Buying group:
1. `/tools/monthly-payment` — full PITI + HOA, not just P&I
2. `/tools/dti` — back-end DTI vs 43% QM guideline + 36% comfort zone
3. `/tools/rent-vs-buy` — 7-year total cost comparison with equity math
4. `/tools/closing-costs` — state-aware range (WA/AZ/CA/TX), explicitly
   labeled "not a Loan Estimate" for TRID safety
5. `/tools/escrow` — monthly escrow + RESPA cushion + prepaid tax

Refinancing / payoff group:
6. `/tools/refi-breakeven` — months until closing costs earn back
7. `/tools/points` — discount points cost vs breakeven vs horizon
8. `/tools/bi-weekly` — 26 half-payments = 13 monthly-equivalent,
   with "DIY equivalent = add 1/12 to monthly" callout
9. `/tools/payoff-acceleration` — three modes (extra $/mo, lump sum,
   target date) sharing the same math engine
10. `/tools/amortization` — inline SVG chart of balance/principal/
    interest over loan life. No chart library.

Program-specific group:
11. `/tools/va-funding-fee` — first-time vs subsequent-use tier logic
    per Public Law 116-315 rates through 2028
12. `/tools/pmi-drop` — 78% LTV auto vs 80% request per Homeowners
    Protection Act, projected off original amortization schedule

**`/tools` index page** — three-group card grid (Buying, Refi+payoff,
Program-specific). Same PrincipleCard visual language.

**Nav updated** — `/tools` added to `PRIMARY_LINKS` in `components/Nav.tsx`
now that the pages exist.

### Design consistency

Every calculator follows the same pattern per the v11 prompt:
- Client-side React, `useMemo` for calculation, no backend calls,
  no data persistence
- Same `CalcLayout` shell: Nav → breadcrumb (`Tools · <calc>`) →
  page hero → 2-column input/output grid → soft CTA → Footer
- Single soft CTA at the bottom: *"Want to talk this through with M8?"*
  linking to `/demo`
- No urgency, no scarcity, no "get a quote in 60 seconds"
- Every calculator flags its estimate nature ("rough range",
  "confirmed on Loan Estimate", etc.) so it can't be mistaken for
  a personalized quote
- Uses theme tokens; works across Night/Dim/Paper

### Not in this PR (deferred)

Per the v11 prompt scoping ("if you run out of runway, stopping after
Tier 2 is still a genuinely strong night's work"), the other Tier 2
pieces will each be their own PR:

- **Glossary hub at `/learn/glossary`** — 40–60 terms, SEO play
- **Loan program comparison at `/learn/loan-types`** — conventional
  vs FHA vs VA vs Non-QM educational tables
- **Local market pages at `/markets/[city]`** — driven off LAUNCH_STATES
  (Bellevue, Kirkland, Edmonds, Seattle corridor; Phoenix/Chandler)
- **Freddie Mac PMMS rate-context module** — behind stealth, compliance
  review flag ("does this trigger TRID advertised-rate disclosure?")

Tier 1 (perf pass, JSON-LD schema, sitemap), Tier 3 (mobile rebuild,
PDF), Tier 4 (chat polish), Tier 5 (content pipeline) — each their
own PR.

### URL-param sharing (deferred to a small follow-up)

The v11 prompt calls for shareable calc URLs via URL params. Each
calculator's `useState` inputs are ready for that pattern; I didn't
wire the `URLSearchParams` sync in this PR to keep the diff focused
on the calculators themselves. Straightforward add in a follow-up:
one `useEffect` per calc that reads params on mount and writes them
on change. Tracked in the roadmap.

### Compliance surface

Nothing here needs new attorney sign-off beyond the existing v10.0/
v11 Tier 0 items:
- No personalized quote flow
- No credit-related content beyond neutral education
- No collection of PII (input state is client-side only)
- All "rate" numbers are calculator inputs (user-typed), never
  fetched or advertised

The closing-costs and VA-funding-fee pages explicitly say "estimate
only, confirmed on Loan Estimate" in their footers. The escrow page
notes RESPA cushion is federal max. The PMI-drop page cites the
Homeowners Protection Act.

### Verified

- `npm run build` clean: 21 static pages + 3 API + middleware
- Every `/tools/*` route returns 200 in dev-server smoke test
- Index page renders all 12 calc titles

---

## v11 Tier 0 — Rename & State-Scope Configurability

**Scope:** Rename-only, plus the state-scope config foundation the v11
master build prompt says must land before anything else. No new pages,
no perf work, no calculators — those are Tier 1+.

### What shipped

**Brand rename: RateM8 → LoanM8**
- Wordmark component text: `Rate<span>M8</span>` → `Loan<span>M8</span>` in
  `Wordmark.tsx`, `Footer.tsx`, `DemoPasswordGate.tsx`, `Nav.tsx`,
  `app/agents/page.tsx`, `app/page.tsx`.
- All user-visible "RateM8" strings replaced across `lib/copy.ts`,
  `lib/m8.ts`, `lib/theme.ts`, `lib/licensing.ts`, page metadata (`title`,
  `description`), api-route error messages, docs (`README`, primer,
  typography guide, paper-mode decisions, public/audio README).
- All-caps `RATEM8` disclosure text ("RATEM8 never shares your data")
  → `LOANM8`.
- `package.json` name field: `ratem8` → `loanm8`.
- The old brand phrase "RateM8 Loan Intelligence" (the trade name in
  the legal disclaimer) → "LoanM8 Loan Intelligence" via
  `licensing.ts` operating entity.

**Domain rename: ratem8.com → loanm8.com**
- `app/layout.tsx` `metadataBase` and OG URL point at loanm8.com.
- Coming-soon page metadata, `/demo`, `/chat`, `/privacy`, `/agents`
  page titles say LoanM8.
- README + primer references to `ratem8.com` domain updated.
- **Email addresses stay `@ratem8.com`** — `jason@ratem8.com`,
  `privacy@ratem8.com`, `m8@ratem8.com`. Jason's existing inbox
  lives there; forward or migrate when he sets up loanm8.com email.
  These are code-default fallbacks — production values come from
  Vercel env vars (`JASON_NOTIFICATION_EMAIL`, etc.).
- **Calendly slugs stay `jason-ratem8/...`** — those are Jason's
  Calendly account handles, unrelated to the site brand. Update via
  env vars when LoanM8-branded Calendly links exist.

**Storage-key rename (breaks existing tester sessions)**
- Cookie: `ratem8_demo_auth` → `loanm8_demo_auth` (set by
  `/api/demo-auth/route.ts`, checked by `middleware.ts` and
  `/demo/page.tsx`, hashed with salt "loanm8:" instead of "ratem8:").
- localStorage: `ratem8_m8_conversation_v10` → `loanm8_m8_conversation_v10`.
- localStorage: `ratem8.theme` → `loanm8.theme`.
- **Impact:** existing testers with a `ratem8_demo_auth` cookie will
  be re-prompted for the demo password on next visit. Their previous
  saved theme preference resets to Night default. Acceptable in stealth.

**Env var backwards-compat**
- `RATEM8_FROM_EMAIL` env var still works but is now deprecated. The
  code prefers `LOANM8_FROM_EMAIL` and falls back to the old name:
  ```ts
  process.env.LOANM8_FROM_EMAIL ||
  process.env.RATEM8_FROM_EMAIL ||
  "m8@ratem8.com";
  ```
  Existing Vercel env config keeps working — Jason can add
  `LOANM8_FROM_EMAIL` at his convenience and delete the old one later.

**New: `lib/states.ts` — state-scope config**

Two distinct concepts, per the v11 prompt:
- `LAUNCH_STATES` = states where LoanM8 actively markets. **Currently
  `["WA", "AZ"]`** per the launch scope decision.
- `LICENSED_STATES` = states where the anchor MLO holds a current
  license. Derived from `ANCHOR_LO.states` in `licensing.ts`.
  **Currently `["WA", "AZ", "CA", "TX"]`** — the four states with known
  sponsors.

Wired into:
- `Footer.tsx` legal disclosure — reads `LICENSED_STATES_LONG`
  ("Washington, Arizona, California, and Texas").
- `app/page.tsx` coming-soon marketing copy — reads
  `LAUNCH_STATES_LONG` ("Washington and Arizona").
- Adding a state to `LAUNCH_STATES` regenerates the marketing text
  site-wide. Adding a state to `licensing.ts` (with its sponsor)
  regenerates the legal disclosure.

Helpers exported: `LAUNCH_STATES_SHORT` ("WA · AZ"),
`LAUNCH_STATES_LONG` ("Washington and Arizona"), `LICENSED_STATES_SHORT`
("WA · AZ · CA · TX"), `LICENSED_STATES_LONG`, `isLaunchState()`,
`isLicensedState()`.

### What was intentionally NOT changed

- **Brand tokens** (`--color-m8-*` in `globals.css` and `licensing.ts`)
  stay. The v11 prompt is explicit: name-only change, brand identity
  is locked.
- **The orb** and all its animation stays exactly as-is.
- **Voice, principles, tiers, RESPA Variant C wording** unchanged.
- **Anthropic API integration** (v10.0) untouched — see "known issues"
  below for the outstanding 503.
- **Middleware stealth gate** unchanged in behavior.

### Compliance flags

1. **"LoanM8 Loan Intelligence" trade name — needs registration.**
   Changing the trade name in the footer disclaimer from
   "RateM8 Loan Intelligence" to "LoanM8 Loan Intelligence" implies
   that trade name is registered in each licensed state. Jason needs
   to file the DBA/fictitious-name paperwork under LoanM8 (or confirm
   RateM8 registrations transfer, likely they don't) before the
   stealth gate lifts. **Compliance attorney sign-off item.**

2. **State scope is intentionally narrower than license footprint.**
   Marketing says "Washington and Arizona." Legal disclosure says
   "Washington, Arizona, California, and Texas." Both are correct
   under the config-not-hardcoding pattern. Only public launch-scope
   claims should be conservative; legal disclosures should be
   comprehensive.

3. **Placeholder phone number** in `licensing.ts`:
   `phone: "[(XXX) XXX-XXXX]"`. Still needs Jason's real number
   before any page renders it (currently unused on any public page).

### Known issues (unchanged from v10.0 handoff)

- **v10.0 chat 503:** POST `/api/m8-chat` returns
  `{"ok":false,"error":"M8 is temporarily unavailable. Email jason@ratem8.com."}`
  from production. Root cause: Lambda can't read `ANTHROPIC_API_KEY`
  env var. Debug path: verify exact spelling in Vercel Settings →
  Environment Variables → Production; verify Save was clicked;
  verify redeploy fired after the save. Fail-closed 503 branch is
  in `app/api/m8-chat/route.ts` line 89 (`if (!apiKey)`).

- **`components/Nav.tsx` links to 8 non-existent routes** was fixed
  in v8 by trimming to existing routes only. Those subpages
  (`/purchase`, `/refinance`, `/home-equity`, `/loan-types`, `/tools`,
  `/rates`, `/about`, `/contact`) don't exist yet — `lib/copy.ts` has
  the content data ready. Tier 2 of v11 will build them.

### What's next (v11 Tier 1+)

Everything from the master build prompt from Tier 1 onward — not shipped
in this PR:

- **Tier 1** — Foundation & Performance: Lighthouse pass, JSON-LD
  schema, per-page metadata completeness, analytics event schema,
  next-sitemap wiring.
- **Tier 2** — Content & Tools Engine: 6 calculators at `/tools`,
  40–60-term glossary at `/learn/glossary`, loan program comparison
  at `/learn/loan-types`, local market pages at `/markets/[city]`,
  Freddie Mac PMMS rate-context module (behind stealth, compliance
  review required).
- **Tier 3** — Conversion & Trust: mobile homepage rebuild, Rate
  Strategy Brief PDF, verified-trust module.
- **Tier 4** — M8 Experience: streaming chat polish, 3-card
  anti-steering display, opening monologue firing everywhere.
- **Tier 5** — Ops & Growth: MDX content pipeline, email capture
  via ESP, agent subdomain routing scaffold.

Each tier is a real chunk of work — plan on separate PRs, not one
mega-commit.

---

## v10.0 — Claude API infrastructure (previous)

- `/api/m8-chat` SSE streaming route with `@anthropic-ai/sdk`.
- `lib/m8.ts`: model, max tokens, placeholder system prompt.
- `ChatExperienceWithToggle` two-tab UI: Scripted demo vs. Live M8 (preview).
- Env: `ANTHROPIC_API_KEY` required, fails closed with 503 if missing.

## v9.1 — Cookie-aware stealth (previous)

Middleware allows any path if the `ratem8_demo_auth` cookie is present
(now `loanm8_demo_auth` post-v11).

## v9 — Stealth launch (previous)

Middleware, coming-soon homepage, password-gated `/demo`, `/agents`
rewrite, `ChatExperience` component extraction, `robots.txt`.

## v8 — Three-theme system (previous)

Night / Dim / Paper, no-flash boot script, `ThemeToggle`, M8 input orb.

## v7 — /chat demo + email capture (previous)

Sarah refi scripted demo, ChatInput, Resend email forwarding, V4 orb CSS.

## v5 — Exo typography + voice orb (previous)

Local Exo fonts, `VoiceOrb`, `useGreeting` state machine, `TermField`.

## v4 — Licensing config (previous)

`lib/licensing.ts` single source of truth for compliance data,
`buildDisclaimer()` generator, multi-LO V2-ready schema.

---

## One-shot site build (2026-09-29) — the full LoanM8 site

**Scope:** `docs/SITE_BRIEF.md` end to end. Every route in the brief's
Section 2 ships; compliance rules from Section 5 are enforced in code
and documented in `COMPLIANCE.md`; counsel items are in
`ATTORNEY_REVIEW_LIST.md`; unfilled values are in `PLACEHOLDERS.md`.

### What shipped
- `lib/config.ts` is now the single source of truth for every fact.
  `lib/licensing.ts` and `lib/states.ts` derive from it. Launch scope =
  four states (WA serving Western Washington, AZ, CA, TX).
- Fonts locked to Fraunces / Geist / JetBrains Mono (Exo removed).
- Motion system: `lib/useSceneTimeline.ts` + `components/motion/*`
  (Scene, Reveal, Underline, Bento, SceneLabel, ReplayButton). Orb gains
  a `state` prop (speed / amplitude / halo only).
- Pages: `/`, `/second-look`, `/join`, `/agents`, `/calculators` (+4),
  `/states/[slug]`, `/principles` (+ `.md`), `/loan-estimate`,
  `/sample-brief`, `/chat`, `/ai` (+ `.md`), `/privacy`, `/terms`,
  `/disclosures`, `/llms.txt`, `robots`, `sitemap`, `/api/agent/*`,
  `/api/second-look` (503 unless enabled). The 12 legacy `/tools/*`
  calculators remain and now link to `/chat`.
- Removed: the scripted "Sarah" chat demo (real lender names, rates,
  invented stats), `ChatInput` email forwarding, `VoiceOrb` mic prompt.
  `/demo` (password) still offers the live Claude tab for testers; it is
  now also gated server-side in `/api/m8-chat`.
- Verification: `npm run verify` = lint + `check:copy` (banned phrases)
  + 45 unit tests + build. Playwright pass at 390px and 1280px: no
  horizontal overflow on any route, one `h1` per page, no JS errors.
  Lighthouse (mobile, this sandbox): Accessibility 100, Best Practices
  96, SEO 91, Performance 81–83 (CPU-throttled container; re-measure on
  the Vercel deployment with PageSpeed Insights).

### Stealth
`NEXT_PUBLIC_STEALTH_MODE` semantics unchanged: anything but `"false"`
keeps stealth on. Legally/machine-required routes (`/ai`, `/llms.txt`,
`/disclosures`, `/privacy`, `/terms`, `/states/*`, `/api/agent/*`,
robots, sitemap) are public even in stealth. Set the var to `false` in
Vercel to launch.

### Before launch (in addition to the Pre-Launch To-Do above)
1. Fill `PLACEHOLDERS.md`.
2. Work `ATTORNEY_REVIEW_LIST.md` with counsel.
3. Set the four Calendly env vars (CTAs show "coming soon" until then).
4. Keep `ANTHROPIC_API_KEY` / `SECOND_LOOK_LIVE` unset until the two
   DRAFT prompts in `lib/prompts/` are reviewed.
