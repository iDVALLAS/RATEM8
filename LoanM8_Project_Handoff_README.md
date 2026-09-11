# LoanM8 — Project Handoff README

Continuity log for the LoanM8 (formerly RateM8) build. Every patch appends
an entry here so any future session — mine, another agent's, or a human
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
