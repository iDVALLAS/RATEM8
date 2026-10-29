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

## v31 / L1 — Licensing single source of truth (2026-10-29)

First patch of the production-launch series (L1–L8, index in
`PATCHLOG.md`). Owner answers 2026-10-29: the sponsor is Adcom Group Inc
dba Home Trust Financial; AZ stays under Home Financial (AZ License
1037722) as configured; the operator's individual license is NMLS
1844143 in every state; LoanM8, LLC has no NMLS number; "Equal Housing
Opportunity" replaces "Equal Housing Lender". Licensing stays in
`lib/config.ts` (not a new `config/licensing.ts`) so there is one source
and `check:identity` keeps its single allow-listed file.

### Files
- `lib/config.ts`
  - `PLATFORM` (LoanM8, LLC, trade name, site). `CONFIG.entityLegalName`
    / `entityTradeName` read it. `entityNmls` removed.
  - `Sponsor` gains optional `legalName`, `dba`, `nmls`, `address`,
    `phone`, `nmlsUrl`, `stateLicenses`. `SPONSOR` (Adcom, five state
    licenses) and `SPONSORS` exported. Home Financial keeps its display
    triple; its legal name, NMLS and AZ license type are `[TBD — …]`.
  - Operator licenses: `NMLS ID 1844143` (WA, AZ, TX), `CA-DFPI 1844143`.
  - `StateBase`: `entityLicense` removed (now derived in `deriveState`
    from the assigned sponsor's `stateLicenses`); `marketed` added (OR
    false); regulator names and URLs filled.
- `scripts/check-licensing.mjs` (new), `package.json` (`check:licensing`,
  and `build` runs it first). Markers: `TBD`, `VERIFY`, `XXXX` anywhere
  in `lib/config.ts`. Strict on `VERCEL_ENV=production`,
  `LICENSING_STRICT=true`, or `NODE_ENV=production` outside Vercel
  previews; otherwise a warning. Decision: the owner asked for
  "NODE_ENV=production", but `next build` sets that on every Vercel
  preview too, which would block every preview until the TBDs are filled.
- `lib/states.ts`: `LAUNCH_STATES` = marketed states; `LICENSED_STATES`
  = all.
- `lib/licensing.ts`: unused `phone` placeholder removed; Equal Housing
  Opportunity.
- `components/Footer.tsx`, `app/disclosures/page.tsx`, `lib/jsonld.ts`,
  `lib/content/ai.ts`: no entity NMLS. JSON-LD says "platform", not
  "brokerage".
- `components/states/LicenseBlock.tsx`, `lib/content/states.ts`: the
  license row names the originating sponsor(s), then "Site operated by
  LoanM8, LLC" (it used to show the operator as the licensee).
- "Equal Housing Lender" → "Equal Housing Opportunity" in `lib/copy.ts`,
  `lib/content/legal.ts`, `lib/site.ts`, Footer and Disclosures comments.
- Tests: `lib/licensing-config.test.ts` (new, 10), `lib/routing.test.ts`
  (sponsor name).
- Docs: `PLACEHOLDERS.md`, `ATTORNEY_REVIEW_LIST.md`,
  `.env.local.example` (`MLO_NOTIFICATION_EMAIL` fixed; ~20 missing vars
  listed), `CLAUDE.md`, `PATCHLOG.md`.

### Verified
- `npm run verify` passes (lint, check:copy, check:identity, 145 tests,
  build, check:bundle). check:licensing warns on 4 values.
- `VERCEL_ENV=production node scripts/check-licensing.mjs` exits 1 and
  lists them.
- Rendered (`next start`, stealth off): footer "LoanM8 Loan Intelligence
  is a trade name of LoanM8, LLC."; Adcom for WA, OR, CA, TX and Home
  Financial for AZ; `/states/oregon` shows "Loans originated by Adcom
  Group Inc dba Home Trust Financial (NMLS #1761573)" and "Site operated
  by LoanM8, LLC"; no "Shapiro Home Loans" anywhere.

### Known issues
- **Production builds fail** until the 4 markers clear: Home Financial
  legal name, NMLS, and AZ license type; the unverified demo bio (L3
  removes it). Merging to `main` now would fail the production deploy
  while leaving the current production build serving.
- Regulator URLs and the NMLS Consumer Access links could not be opened
  from the sandbox (network policy). Open each once.
- Pricing tenant ids derive from the sponsor name, so the Adcom tenant id
  changed. Only local `.data/pricing/` snapshots are affected.
- The footer's sentence structure is unchanged; L2 rewrites it.

### Next up
L2 — footer/disclaimer rewrite, EHO logo, Texas complaint notice,
`/licensing`, MLO + sponsor on card, chat header and rate results.

## v30 — Desktop hero orb: slightly larger and higher (2026-10-14)

**Owner:** "the m8 orb looks a little small and crowded on desktop. can
you move it up slightly and enlarge it a slight bit as well -- show me a
mock up too". The before/after mockup (1280, 1440, 1920, 390) was
approved ("lets go with the after").

### Files
- `components/home/home.css`
  - `.hm-orb-btn` takes its size from `--hero-orb` (default 220px).
  - New block at ≥1024px:
    - `--hero-orb: clamp(220px, 29vh, 272px)`
    - `.hm-hero__inner` padding 2vh top, 8vh bottom. The column stays
      vertically centred, so the extra bottom padding lifts it.
    - `.hm-orb-wrap` gap 16px
- `components/home/HeroOrb.tsx`: the `Orb` width and height are
  `var(--hero-orb, 220px)`.
  - The monogram, halo, term field and popups are sized from the orb box
    and scale with it.

### Measured (orb size, orb top)
| Viewport | Before | After |
| --- | --- | --- |
| 1280×800 | 220px, 115 | 232px, 111 |
| 1440×900 | 220px, 156 | 261px, 113 |
| 1920×1080 | 220px, 246 | 272px, 190 |
| 390 (phone) | unchanged | unchanged |

- At 1440 the Voice / Q & A row moves 2px and the action grid doesn't
  move. The trust line still ends above the fold (862 of 900).
- At 1280×800 it ends at 831 (was 819), still above the fold.
- Nothing overlaps.

### Verified
- `npm run verify` passes.
- `qa/overflow` is clean. Its only console error is the Vercel Analytics
  script 404, which only exists on Vercel.
- `qa/fonts` reports 0 findings. `qa/footer` and `qa/about` match the v29
  results.

## v29 — What renders the MLO-match bar, and a Washington default when location can't be resolved (2026-10-14)

**Owner request:** find what conditionally renders the homepage match bar
("Washington · matched with … Not right? Change"). List every env var,
flag, cookie, middleware rule and header it depends on, say which must be
set in Production, and add a visible fallback that defaults to
Washington when the location lookup fails.

### The chain
`middleware.ts` → `x-lm8-route` header → `app/layout.tsx`
(`routeContext()`) → `MloProvider` → `components/LocationBeacon.tsx`
(rendered by `Nav`, plus the card in `AboutCards`).

| Kind | Name | Effect on the bar |
| --- | --- | --- |
| Env (server) | `MLO_ROUTING` | `"true"` on, `"false"` off. **Unset = on only when `VERCEL_ENV` is `preview`, so OFF in Production** (`mloRoutingOn`). Off → `routeContext()` returns `NO_MLO` (status `off`) and `LocationBeacon` renders nothing. |
| Env (Vercel, automatic) | `VERCEL_ENV` | Read only to apply the default above. |
| Env (public) | `NEXT_PUBLIC_STEALTH_MODE` | Anything but `"false"` → anonymous visitors to `/` get `ComingSoonHomePage`, which has no Nav and so no bar. |
| Env (server) | `DEMO_PASSWORD` | Entering it at `/demo` sets the `loanm8_demo_auth` cookie that gets past stealth. |
| Config | `CONFIG.routing.stateAssignments`, `routingModeOverride`, `operatorMloId`, `fallbackState` (new) | Decide assign or choose, and the matched MLO. `validateRouting()` fails the build on a bad combination. |
| Cookie | `lm8_property_state` | The borrower's stated property state (`POST /api/route-choice`, 30 days, httpOnly). Wins over IP. |
| Cookie | `lm8_mlo` | The borrower's chosen MLO id (same route). |
| Cookie | `loanm8_demo_auth` | Stealth bypass; its presence only. |
| Request header (Vercel geo) | `x-vercel-ip-country`, `x-vercel-ip-country-region` | Used only when the country is `US` and the region is a real state code. Set by Vercel's edge; absent locally, and sometimes on VPNs or for unknown IPs. |
| Request header (internal) | `x-lm8-route` | Set by the middleware with ids only. Any client-sent copy is deleted first. |
| Middleware | `matcher` (everything but `_next/static`, `_next/image`, `_next/data`); `adminGate` (`/mlo`); stealth: public paths and cookie holders get `passThrough()` (which adds `x-lm8-route` when routing is on), anyone else is redirected to `/` | |
| Client | `LocationBeacon` | `null` when status is `off`. Desktop line under the nav (`lg+`), phone pill under the header (`<lg`), the full line atop the mobile menu, and the About card. |

**Must be set in Production for the bar to show:**
1. `MLO_ROUTING=true`. Unset means off in Production; this is why it
   doesn't show on loanm8.com.
2. Either `NEXT_PUBLIC_STEALTH_MODE=false` (public), or visitors hold the
   `/demo` cookie, which needs `DEMO_PASSWORD` set.

`VERCEL_ENV` and the geo headers come from Vercel automatically.

### The fallback (code)
- `CONFIG.routing.fallbackState = "WA"`.
  - When no state can be resolved, `resolveRoute` routes to Washington
    with `source: "default"`. That covers no property cookie, no
    single-state choice, and no usable geo header (missing, or non-US).
  - `decodeRoute` does the same for a missing, garbled or inconsistent
    `x-lm8-route`. It never mixes the wire's state with the default MLO.
- **Real inputs always win.** A property cookie, a chosen MLO, or a US
  IP region (licensed or not) is never overridden. Nevada still says "We
  don't have a licensed loan officer in Nevada yet."
- **Visible marker:**
  - desktop: "Washington (default) · matched with [MLO]  Not right? Change"
  - phone pill: "WA (default) · [MLO] · Change"
  - The tooltip explains the default, and "Change" opens the state
    picker as before.
- **Naming:** `"default"` follows the same rule as `"ip"`; it names the
  MLO only in an assign state. `validateRouting` requires the fallback to
  be an assign state with an assigned MLO. Booking, the footer and M8 all
  agree with the bar.
- **M8:** told "Their location could not be detected, so the site
  defaulted to Washington… ask where it is."
- **Not covered:** the fallback can't render anything while
  `MLO_ROUTING` is off. That switch is the Production fix above.

### Verified
- `npm run verify` passes (135 tests; new: the default, real inputs win,
  decode fallbacks, naming, validation, the M8 line).
- **Browser, routing on:**

  | Visitor | Desktop | Phone |
  | --- | --- | --- |
  | No headers | "Washington (default) · matched with …" | "WA (default) · … · Change" |
  | AZ | "Arizona · matched with …" | normal |
  | NV | the unlicensed line | unlicensed |
  | Canada | the Washington default | the Washington default |

- At 320px the pill stays one line and "Change" stays on screen.
  `qa/overflow` is clean.

## v28 — HELOC credit pull is soft until application; "Soft pull only" wording stays (2026-10-11)

- **Owner:** "the HELOC pull is soft until they apply, leave the wording".
  This resolves the v27 flag.
- **Recorded in:**
  - the `heloc.creditPull` record for Aven, HELIX and NFTYDoor (now "One
    credit bureau, soft pull until the borrower applies; which bureau
    varies by program")
  - `CLAUDE.md` §4b and `COMPLIANCE.md`
  - a test asserting the record says soft-until-application
- **No copy changed:** the M8 Code, the trust line and the footer still
  say "Soft pull only".
- **Verified:** `npm run verify` passes.

## v27 — The panel is the owner's 14 lenders; Aven, HELIX and NFTYDoor are HELOC-only (2026-10-11)

**Owner, 2026-10-11:** "make the panel those 14 lenders but also take to
memory that Aven, NFTYdoor, and Helix are automated HELOC programs only
that use a single credit bureau, not necessarily the same Bureau, and
plaid connections for income."

### Panel (`lib/pricing/lenders.ts`)
- **14 lenders**, the same set as the logo registry (`lib/lenders.ts`).
  - **Added:** Rocket Pro TPO, Nations Direct Mortgage, Aven, HELIX,
    NFTYDoor.
  - **Removed:** Provident Funding, HomeXpress, Plaza Home Mortgage. They
    are gone from the brand registry too.
- **New field `products`:**
  - `["first_mortgage"]` for 11 lenders
  - `["heloc"]` for Aven, HELIX and NFTYDoor, with a `heloc` record:
    automated; one credit bureau, which bureau varies by program; income
    through a Plaid bank connection
- **New field `termsReviewed`:**
  - `publishable()` now needs written consent, or reviewed terms with no
    consumer-display restriction.
  - The five lenders that weren't in the 2026-10-01 terms review (Rocket
    Pro TPO, Nations Direct and the three HELOC programs) can't appear in
    a published snapshot until reviewed or consented. PRMG still needs
    consent.
- **First mortgages only, everywhere that prices them:**
  - `publishSnapshot` refuses a HELOC-only lender in a first-mortgage
    scenario ("offers HELOCs only…"). Every current scenario is a first
    mortgage.
  - The `/mlo/pricing` entry form leaves HELOC-only lenders out.
  - `/mlo/setup` labels them "HELOC only (automated: one credit bureau,
    Plaid for income)" and marks unreviewed lenders.
- **Demo:** "N more lenders shopped" now counts first-mortgage lenders
  only. 11 shopped − 3 shown = **"8 more lenders shopped"** (was 11,
  which counted HELOC programs that can't price a refinance).
  "Up to 14 lenders" stays: it's the panel size.

### Where it's remembered
- `CLAUDE.md` §4b, `COMPLIANCE.md`, the data itself (`products`,
  `heloc`), and tests (`lib/lender-count.test.ts` checks the 14 keys, the
  three HELOC programs, the 11 first-mortgage lenders and
  publishability).
- `lenderCountMax` (14) now equals the panel size, and a test keeps them
  equal.

### Flag for the owner (resolved in v28)
- **Soft pull wording:** the HELOC programs pull a credit bureau. The
  owner confirmed the pull is soft until the borrower applies, so the
  wording stays.

### Verified
- `npm run verify` passes (131 tests).

## v26 — Owner-supplied lender logos and brand colours; revert-to-numbering switch (2026-10-11)

**Owner, 2026-10-11:** "Here are the lender LOGO's. And if we have an issue
with showing them we will revert to numbering them." (`Lender_Logos.zip`,
14 PNGs.) The sandbox could not fetch logos from the web: its network
policy blocks the lender domains, so nothing was downloaded.

### Handling
- **Unpacked** into an isolated folder outside the repo (uploaded files are
  untrusted data). Every file was checked to be a real PNG; no SVGs, so no
  script risk.
- **Cropped** to the artwork with a small even margin, scaled to 96px tall
  (2x a 48px chip), and re-encoded as plain PNG (no metadata), into
  `public/lenders/{slug}.png`. Nothing was redrawn or recoloured.
- **`brandColor`** for each lender is its logo's own dominant colour,
  measured from the supplied file (`lib/lenders.ts`).

### Logo status

| Lender (registry) | File | Shown | Note |
| --- | --- | --- | --- |
| UWM | uwm.png | ✓ (demo) | #005F9F |
| Rocket Pro TPO | rocket-pro.png | ✓ (demo) | Supplied file is the **Rocket Mortgage** logo. #C8202F |
| Kind Lending | — | monogram | **Supplied file is cut off ("ind Lendir")**, so not used. Send a complete file |
| The Loan Store | the-loan-store.png | approved | #103C60 |
| PRMG | prmg.png | approved | #003DA6. Its *pricing* still needs display consent (`lib/pricing/lenders.ts`) |
| Pennymac TPO | pennymac.png | approved | #F2C400 |
| Freedom Mortgage | freedom.png | approved | #9F8731 |
| REMN Wholesale | remn.png | approved | #00467F |
| RISE TPO | rise.png | approved | File reads **"RiseUp Lending"**. #023B45 |
| Newrez Wholesale | newrez.png | approved | #022F3D |
| Aven | aven.png | approved | **New lender**; black-only logo, so it keeps a data-palette tint |
| HELIX | helix.png | approved | **New lender**. #00A3F4 |
| Nations Direct Mortgage | nations-direct.png | approved | **New lender**. #BF2232 |
| NFTYDoor | nftydoor.png | approved | **New lender**. #0069C4 |
| Provident Funding, HomeXpress, Plaza Home Mortgage | — | monogram | No logo in the set |

- **Where logos show:** "Approved" means a logo will render wherever that
  lender is named. Today only the scripted demo names lenders (UWM, Rocket
  Pro TPO, Kind), so on the site you'll see the UWM and Rocket logos and
  Kind's tile. `/rates` stays anonymized; no new named-lender display was
  added.
- **The four new lenders** are in the brand registry only, not in the
  pricing panel (`lib/pricing/lenders.ts`, 12). The set has 14 logos,
  which matches `lenderCountMax: 14`. Confirm whether Provident, HomeXpress
  and Plaza are still on the panel and whether the four new ones should be
  added to it.
- **Revert switch:** set `CONFIG.demo.namedLenders` to `false`
  (`lib/config.ts`). Every named spot in the demo then becomes "Lender 1 /
  2 / 3", with numbered tiles and no logos: the option rows, the Detail
  sheets, the hold-period labels and the "best quote" line. Tested in
  `lib/demo-chat.test.ts`.

### Layout fixes found on the way
- **Logo chips** now have a fixed height and a width that follows the
  logo (capped), so wide logos stay legible.
- **The demo's option rows follow the card's width (container query), not
  the viewport's:**
  - ≥600px card → the original 6-column row, with fixed rate and payment
    columns so rows align.
  - Narrower (1024–1280 with both sidebars) → a stacked row.
  - Phones keep the swipe cards.
- **Rates and payments never break mid-number.** Before this, at 1280 the
  v23 overflow rule could split "6.375%" into "6.37 5%".

### Verified
- `npm run verify` passes: 128 tests (new: an approved logo must have its
  file, monograms are unique, Kind stays a monogram, the revert to
  numbering), `check:bundle` (logos are static images, not JS).
- `/chat` checked at 390, 800, 1024, 1280, 1440 and 1920 in Night and
  Paper: the logos load, the rate columns align, nothing breaks
  mid-number, and there is no horizontal overflow.

## v25 — Demo pricing: no "live", today's date; owner decisions on Geist and /rates (2026-10-11)

**Owner, 2026-10-11:** "keep Geist, leave /rates as is and you can pull
'live' from pricing and use the current calendar date".

- **Demo wording** (`components/ChatExperience.tsx`, `lib/demoChat.ts`):

  | Before (restored v7 copy) | Now |
  | --- | --- |
  | Header "Live · Pricing Sync 14s ago" (pulsing dot) | "Example pricing · October 11, 2026" (still dot, `.example-badge`) |
  | Message label "PRICING PULLED LIVE" | "EXAMPLE PRICING · OCTOBER 11, 2026" |
  | Sidebar "Live Market" | "Market · October 11, 2026" |
  | "◇ Live Wholesale Options · …" | "◇ Wholesale Options · …" |
  | "Synced 14s ago" | "Example · October 11, 2026" |

  - **The date** is today's calendar date in America/Los_Angeles,
    computed per request (`demoAsOf()`; `/chat` and `/demo` already
    render per request). It is never frozen at build time.
  - **Kept:** the disclaimer "Sample conversation. Live pricing not yet
    active.", which says live pricing is off. Also kept: every
    `ExamplePricingLabel` and the footer line "Indicative pricing ·
    Subject to verification · Soft pull only".
  - **Test:** `lib/demo-chat.test.ts` fails if "live" or "sync" returns
    anywhere in the demo outside that disclaimer, and checks the
    time-zone date.
- **Geist stays site-wide.** Item 9's "optical sizing on Fraunces" is
  declined for good. This is the third confirmation (09-29, 09-30, 10-11).
- **`/rates` is left as is:** v13 example pricing behind
  `PRICING_DEMO_EXAMPLES`, plus the off-by-default `RateVsAverage`.
- `COMPLIANCE.md`'s open "live" item is resolved;
  `ATTORNEY_REVIEW_LIST.md` is updated.
- **Verified:** `npm run verify` passes (125 tests). `/chat` was rendered
  at 1440 and 390, shows today's date, and has no "live" outside the
  disclaimer.

## v24 — Design upgrades, mobile patterns, skeletons, /design style guide, AA sweep (2026-10-10)

### Depth and type
- **Surfaces:** cards, option cards, the demo's rate, market and loan
  officer cards, skeletons and empty states share a soft inner highlight
  and layered shadow (`--surface-highlight`, `--surface-shadow`, per
  theme) over hairline borders.
- **Restrained glass blur** on overlay backdrops only (the location sheet
  and the new Detail sheet). Never on sheets (motion rule); the nav
  already had it.
- **Tighter display leading:** `.tagline` 0.98, `.hm-h2`, section titles
  and stage headlines 1.0.
- **Tabular numerals** on every rate and dollar class (`.num`,
  `rate-*`, `px-*`, `br-opt dd`, `detail-dl`, calculator results, chart
  axes).
- **Fraunces optical sizing was NOT applied.** The owner settled Geist
  site-wide on 2026-09-30, and `CLAUDE.md` says not to reintroduce
  Fraunces. Geist has no optical-size axis. Confirm if that decision has
  changed.

### Micro-interactions and motion (`components/ui/Interactions.tsx`, mounted once in `app/layout.tsx`)
- **Magnetic hover** on primary buttons (mouse only, ≤4px) and press
  states on every button.
- **"→" CTAs:** each one animates its arrow on hover and focus
  (`ArrowText`, `.cta-arrow`). Covers CTAButton, prep links, NMLS verify
  links, calculators, state pages, the Loan Estimate guide, demo
  follow-ups, Send, and 404.
- **Spring entrances with stagger** (`linear()` spring, cubic fallback) on
  the `/agents`, `/investors` and `/calculators` grids, the About cards
  and the `/rates` option cards (`data-reveal="grid"`).
- **Draw-in:** calculator chart lines (`pathLength=1`) and the
  How-it-works bars (`data-draw`).
- **Count-up** (`components/ui/CountUp.tsx`, a client component) on
  dollar figures: demo payments and hold-period totals.
  - **Rates and APRs never count up:** a rate is shown exactly or not at
    all.
- **Only content that starts below the fold is held back.** The server
  HTML is always the final state, and a huge top `rootMargin` means
  jumping past content still reveals it.
- Reduced motion turns all of it off.

### Mobile
- **Swipeable lender cards** with snap and dots
  (`components/ui/SwipeRow.tsx`), used by the demo's option rows (stacked
  rows from md up).
  - This also fixed a real bug: at 390px the restored 6-column rows
    crushed text to one letter per line. The cards now use the full
    message width.
- **Bottom-sheet Detail panels** (`components/ui/DetailSheet.tsx`):
  - the demo's DETAIL buttons now open the option's rate, APR, payment,
    points and note, with the example label and the footer line
  - a dialog on desktop
  - Esc, the backdrop or × closes it, and focus returns to the button
- **Sticky bottom CTA bar** (`StickyCtaBar`, phones only, via
  `PageShell stickyCta`) on `/rates`, `/sample-brief`, `/states/*`,
  `/second-look`, `/loan-estimate`, `/calculators` and each calculator.
  - It hides (and goes inert) while the footer is on screen, so the state
    chips are never covered (`qa/footer` passes).
  - It pads the page while shown.

### Loading and empty states (no spinners)
- **Skeletons:** `components/ui/Skeleton.tsx` with a shimmer that stops
  under reduced motion. Route skeletons are in `app/rates/loading.tsx`,
  `app/chat/loading.tsx`, `app/demo/loading.tsx` and
  `app/states/[slug]/loading.tsx`. Live M8 shows skeleton lines until its
  first words arrive.
- **Empty states:** `components/ui/EmptyState.tsx` replaces `/rates`'
  plain "unavailable" line. The calculator chart's empty state is a
  skeleton frame plus one line.

### `/design` (noindex, not in the sitemap, behind the stealth gate)
- **Shows:** brand tokens (locked), the data palette with live contrast
  ratios, type, buttons (including disabled), labels, lender marks
  (monogram sizes plus an approved-logo chip), tinted lender cards with
  the winner glow, state chips, swipe cards with dots, the Detail sheet,
  the sticky bar, count-up, draw-in bars, skeleton, empty state, and a
  mesh scene.
- **Uses a fictional "Sample Lender" only** (its sample logo is our own
  drawing at `public/design/sample-logo.svg`), and rate slots read
  "x.xxx%". No real lender or rate appears.

### AA contrast (item 10)
- **Unit test:** `lib/contrast.test.ts` (4 tests).
  - every data hue ≥4.5:1 on Night, Dim, Forest and the panel
  - every ink ≥4.5:1 on Paper, Stone and white
  - the palette in code matches `globals.css`
  - Pine, Green and the brief's example label stay AA
- **Browser sweep:** every visible text element on 19 routes (including
  `/chat`, `/demo` and `/design`) at 1280 and 390, in Paper, Night and
  Dim. It found and fixed:
  - **Paper, restored demo:** green labels, the EDIT link and "−0.125
    today" were 1.9–2.0:1. They now use Pine (6:1). The header wordmark
    keeps M8 Green.
  - **Paper, `/demo` gate:** "M8 Preview" and the email link were 1.9:1.
    They now use `--accent`.
  - **Dark themes, `/loan-estimate`:** the SAMPLE badge on the white
    document was 3.0–3.2:1. It's charcoal on white now.
  - **Dark themes, disabled booking buttons:** these are only disabled
    while a booking link is missing, and were 2.1–2.7:1 (opacity). They
    now have full-strength text, a muted fill and a dashed border.
- **Remaining findings are exempt:**
  - the "M8" logotype
  - the decorative `aria-hidden` drifting loan terms behind the orb
  - the Second Look toggle (a known false positive: the sweep can't see
    its sliding thumb, ~6.9:1)

### Verified
- `npm run verify` passes: lint, `check:copy`, `check:identity`, 123
  tests, build, `check:bundle` (97 browser files, no lender names).
- `qa/overflow` is clean (only the local Analytics 404), `qa/fonts` has 0
  findings, and `qa/footer` and `qa/about` pass.
- **Browser checks:**
  - **Demo on a phone:** 3 dots, the active dot follows the swipe. The
    Detail sheet opens bottom-aligned with focus inside, and Esc closes
    it. No page errors (a hydration error from an earlier count-up
    approach was found and fixed by making CountUp a client component).
  - **Sticky bar:** shown at the top of `/rates` on phones, hidden at the
    footer, absent on desktop.
  - **Reveal and count-up:** both complete after jumping straight to the
    bottom (`/agents`, `/design`).

## v23 — Lender marks (approval-gated logos) and the data color system (2026-10-10)

### LenderMark (item 7)
- **`lib/lenders.ts`** is the brand registry: 13 lenders, the owner's 12
  plus Rocket Pro TPO from the original demo.
  - Fields: `slug`, `name`, `monogram`, `logoApproved` (**false for
    all**), `brandColor` (**null for all**, until copied from each
    lender's brand guide), and a fallback `tint` (data hue).
- **`components/LenderMark.tsx`** is a server component, so names never
  ship in browser JS.
  - Approved → `public/lenders/{slug}.svg` in a white chip (paper-coloured
    in the Paper theme).
  - Otherwise → a monogram tile tinted with the lender's colour, or our
    data hue until that's confirmed.
- A test fails the build if an approved lender has no logo file.
- No logo was downloaded, scraped or recreated.
- **Used in** the demo's option rows and hold-period labels, where lenders
  were already named. `/rates` stays anonymized.
- `ATTORNEY_REVIEW_LIST.md` has a new "Brand/logo use" item.

### Data colors (item 8)
- **Six hues** in `@theme`: sky, iris, orchid, coral, amber, rose.
  - Each has an "ink" variant for Paper.
  - The semantic tokens are `--data-1…6` (fills) and `--data-N-text`
    (AA text per surface).
- **Contrast:** light hues ≥5.78:1 on Night, Dim, Forest and the panel;
  inks ≥5.15:1 on Paper, Stone and white.
- **Never used** on the orb, the wordmark or brand surfaces.
- **Lender cards:** a 3px tinted left edge plus a soft wash
  (`.lender-tinted`).
  - The demo tints by lender; `/rates` and `/sample-brief` by position
    (1–3), because those lenders are anonymized.
  - The demo's lowest-total-cost row gets a brand-green "winner" glow
    (`.is-winner`). `/rates` gets none (anti-steering: equal options).
- **State chips** (`components/StateChip.tsx`): one hue per state
  (`lib/state-colors.ts`, all five including OR) plus the original
  `StateOutline` silhouette. No seals or flags. Used in the homepage
  strip, the footer and `/join`.
- **Mesh backdrops** behind the hero and every `.scene`: two still
  radial-gradient layers cross-fade over 48s. Opacity only, inside each
  section's box, ≤10% alpha. Reduced motion: still.

### Fixes found on the way
- At 1024–1280px the demo's third DETAIL button overflowed the card. The
  grid cells may shrink now.
- The restored demo's mono 600/700 weights were synthesized (Mono ships
  400/500) and now use 500. The small monogram tile went from 9px to 10px
  text. `qa/fonts` is back to 0 findings.

### Verified
- `npm run verify` passes: 119 tests (5 new: lender brands, LenderMark,
  state hues).
- `qa/overflow`, `qa/footer` and `qa/about` pass. The footer chips are
  not covered.
- Checked visually at 1280 in Night and Paper: demo card, `/rates`
  cards, state strip, footer, hero.

## v22 — Lender counts from config: "up to 14", never fewer than 3 (2026-10-10)

- **Config:** `CONFIG.lenderCountMax: 14` and `CONFIG.lenderCountMin: 3`
  replace `lenderCountDisplay` (which was null and unused).
- **"14-lender" claims:**
  - The only one in the repo was the restored demo's M8 Code line. It
    now says "up to 14 lenders" (v21).
  - A test fails the build if any `N-lender` phrase returns to the demo
    data.
- **Never fewer than 3:**
  - `antiSteering.ts` uses `lenderCountMin` for `meetsCreditorCount`.
  - `PricingDisplay` (`/rates`) no longer renders the three option cards
    below the minimum. It shows "Fewer than three lenders were eligible…
    so no option set is shown. Every result is listed below." The full
    results table stays.
  - The demo's option set needs ≥3 distinct lenders.
- **"N more lenders shopped":** renders only from a scenario's own
  `lendersShopped` count (demo: 14 → "11 more").
- **Note for the owner:**
  - `lib/pricing/lenders.ts` lists **12** lenders. "Up to 14" is wider
    than the panel on file. Add the two lenders or lower
    `lenderCountMax` to 12.
  - Principle 3, "Every lender shopped on every file.", is locked
    verbatim and was not changed.
- **Verified:** `npm run verify` passes (114 tests, 4 new in
  `lib/lender-count.test.ts`).

## v21 — Restore the original /chat scripted demo; homepage → /chat; example-pricing label; live chat flag (2026-10-10)

**Owner request:** fix a regression against the original build. Restore the
last working `/chat` scripted demo (Sarah, Bellevue refi, $640K, 98004)
exactly. Point "I'm shopping a mortgage" at it. The demo and
`/sample-brief` may show illustrative pricing (attorney-cleared), with a
persistent label on every rate card. Overrides `docs/SITE_BRIEF.md` §5
rule 1 for those two surfaces only.

### What the one-shot dropped (diff of `origin/main` → HEAD, deleted files)
| File | Status now |
| --- | --- |
| `components/ChatExperience.tsx` (the Sarah demo) | **Restored** |
| `lib/demoChat.ts` (its script and data) | **Restored** |
| `components/ChatInput.tsx` (input bar, M8 orb, question capture) | **Restored** |
| `app/api/chat-question/route.ts` | **Restored, with privacy fixes** (below) |
| `components/VoiceOrb.tsx`, `lib/useGreeting.ts` (v5 mic greeting) | Not restored: replaced by `HeroOrb` (v12–v16), and voice stays off (`featureFlags.voice`) |
| `public/fonts/Exo-*.otf` | Not restored: the owner removed Exo (2026-09-30) |
| `public/robots.txt` | Not restored: replaced by `app/robots.ts` |

**Checked and intact (no restore needed):**
- **Stealth gate:** `middleware.ts` is v9.1 plus the later public routes
  and routing.
- **Password-gated `/demo`:** the `app/demo/page.tsx` hash check,
  `DemoPasswordGate`, and `/api/demo-auth`.
- **Three themes:** Night/Dim/Paper in `lib/theme.ts` and `ThemeToggle`,
  with the no-flash boot script in `app/layout.tsx`.
- **v10 streaming:** `M8LiveChat` and `/api/m8-chat`.
- The demo's CSS (`chat-*`, `rate-card*`, `msg-*`, `market-card`,
  `followup-btn`, `scenario-row`, `lo-*`, `m8-input-orb`) survived; a
  rule-by-rule diff against main shows only the font change.

### Restored demo, verbatim, with these deliberate changes
- **Names and NMLS from config.** The demo uses the MLO that
  `CONFIG.routing.stateAssignments.WA` points to. "Jason" in the script
  ("lenders {first} closes with", "loop in {first}", the chip, "Sent to
  {first}") is filled from config, so `check:identity` passes.
- **Pronoun from config.** The original copy's "He has… / He'll…" is in
  `CONFIG.demo.loPronoun` for that MLO. Any other MLO gets "they".
- **"49 STATES" is now the real count** (`STATES.length`, 5). The
  original was flagged in its own code as pending review; a named MLO's
  card must not overstate licensing.
- **Bio.** "17 years originating · Avg close: 18 days · Available now · in
  office" is carried over into `CONFIG.demo.loBio["mlo-001"]`, marked
  VERIFY. These are claims.
- **Lender counts.** "14-lender wholesale panel · Every file" now reads
  "Wholesale panel, up to 14 lenders · Every file"
  (`CONFIG.lenderCountMax`).
  - "11 more lenders shopped" is computed: `lendersShopped` (14) minus
    the 3 options shown. It renders only when that count is an integer
    ≤ `lenderCountMax`.
  - The option set renders only with ≥ `lenderCountMin` (3) distinct
    lenders.
- **`ExamplePricingLabel`** ("Example — illustrative pricing, not an
  offer", `EXAMPLE_PRICING_LABEL` in config) on:
  - the options card and each option row (rows repeat it on phones)
  - the hold-period card
  - the "Live Market" and "Your best quote" sidebar cards
  - each `/sample-brief` option card, where it replaces the generic
    SampleBadge
- **Kept exactly:**
  - the footer line "Indicative pricing · Subject to verification · Soft
    pull only"
  - the disclosure "Sample conversation. Live pricing not yet active."
- **Book a call.** "Book a call with a licensed loan officer"
  (`BookingCTA`, secondary) sits under the follow-up chips.
- **`/api/chat-question` fixes:**
  - The v7 route logged the question, email and IP when Resend wasn't
    configured, and still told the borrower "Sent". It now logs nothing
    the borrower typed and returns 503, so the UI shows the error, not
    "Sent".
  - The name-bearing env var is replaced by `MLO_NOTIFICATION_EMAIL`, and
    the `@ratem8.com` fallback sender is gone (`LOANM8_FROM_EMAIL`
    required).
  - Questions are screened with the prep flow's `containsSensitive`.

### Routing
- `/chat` renders the restored demo; `/chat?prep=1` is still the v18 prep
  flow, behind its AI disclosure gate.
- `/demo` (password) shows the restored demo in its "Scripted demo" tab.
- Homepage "I'm shopping a mortgage" now goes to `/chat` (`CTAButton`),
  not Calendly.

### Live chat behind a flag
- `CONFIG.featureFlags.demoLiveChat` is on only when `M8_LIVE_CHAT` is
  exactly `"true"`.
- Off → `/api/m8-chat` returns 404 before anything else, and `/demo`
  shows no live tab.
- `ANTHROPIC_API_KEY` still stays unset until counsel signs off.

### Not changed, needs an owner decision
- "No rates displayed anywhere else": `/rates` still shows the v13
  example pricing (its own switch, `PRICING_DEMO_EXAMPLES`, default on)
  and the off-by-default `RateVsAverage`. Set `PRICING_DEMO_EXAMPLES=false`
  if `/rates` should go dark too. `CONFIG.liveRatesEnabled` stays
  `false`. Calculators take only user-entered rates (unchanged).
- The demo's original "PRICING PULLED LIVE", "Live · Pricing Sync 14s
  ago", "Synced 14s ago" and "Live Market" wording was restored
  verbatim, as asked. It sits next to the new "illustrative" label;
  counsel should confirm the pairing.

### Verified
- `npm run verify` passes: 110 tests, `check:copy`, `check:identity`,
  `check:bundle` (no lender names in browser JS; the demo is server-
  rendered), build.
- `/chat` at 1440 and 390: 3 option rows, the footer line, "11 more
  lenders shopped", the M8 Code line "up to 14 lenders", the Book a call
  CTA, no page errors, no horizontal overflow. Labels visible: 4 on
  desktop (rows repeat only on phones), 5 on phones (the sidebars are
  hidden there).
- The homepage shopping button links to `/chat`. `/sample-brief` has 3
  labelled cards.

## v20 — Mobile menu opened to 0px tall on iPhone (2026-10-02)

**Owner report:** the ☰ menu on mobile "doesn't do anything".

**Root cause:**
- The mobile sheet (`position: fixed`) was rendered inside `<header
  class="site-nav">`, which has `backdrop-filter: blur(12px)`.
- In Safari (and Firefox), backdrop-filter makes the header the
  containing block for fixed descendants.
- So the sheet's `inset: 0` resolved against the 69px header, and with
  `top: 69px` it opened at **0px tall**. The ☰ turned into ✕ and scrolling
  locked, but nothing appeared.
- Headless Chromium doesn't apply the blur, so the v18 audit passed.

**Fix:** `components/Nav.tsx` now renders the sheet as a sibling after the
header, not inside it. Nothing else changes: same z-index (39, under the
header's 40), same measured `top`, same close rules.

**Verified:**
- The header was forced into a containing block, to reproduce Safari:
  - before the fix: sheet height 0
  - after the fix: 775px at a 390×844 viewport
- With touch taps:
  - opens
  - closes on the toggle, Esc, an outside tap, a same-page link
    (`/#about`) and a page link (`/calculators`)
- With `MLO_ROUTING` on, the location line heads the menu.
- `npm run verify` and the QA audits pass.

**Also reported (no change):**
- The owner sees no loan officer match at the top on mobile. Production
  has `MLO_ROUTING` unset, which means off in production (v17 design).
  The pill only shows on previews, or in production once
  `MLO_ROUTING=true`.
- A mockup of the as-built pill (Option A) and a sticky-header variant
  (Option B) went to the owner for a decision. Nothing is implemented
  until then.

## v19 — Round 3 Item 3: savings copy live; "national average" comparison built, OFF (2026-10-02)

Owner approval to continue past the Item 2 STOP: "counsel has already
confirmed you are good to go on that with no stop on the data you
mentioned" (the prep-flow data question from v18).

### 3a, savings copy (live)
All strings in `copy.savings` (`lib/copy.ts`).
- **Homepage:** a short band at the bottom of the How it works sheet,
  under step //03 (`components/home/HowItWorks.tsx`, `.hm-savings` in
  `home.css`).
  - Eyebrow "// why it costs less".
  - h3 "Less overhead. Lower costs." ("Lower costs." in the accent).
  - Body verbatim from the brief: "M8 does the research a back office
    used to do: shopping lenders, running the math, drafting the
    paperwork. That cuts our overhead, and we pass the savings on to you."
  - Two columns at ≥768px, stacked on phones. It sits inside the sheet,
    so it is fully readable before Second Look slides over (checked at
    1280 and 390).
- **"/about":** there is no `/about` route. "About" in the nav is the
  homepage `#about` section, so the paragraph goes there, under the
  loan officer card (`components/home/About.tsx`, `copy.savings.about`).
  It is generic for every visitor:
  "Why it costs less: M8 does the work a back office used to do. It shops
  lenders, runs the math, and drafts the paperwork, so your loan officer
  spends their time on your file instead of on busywork. That keeps our
  overhead low, and we pass the savings on to you."
- **`/agents`:** "Your buyers get lower costs because our overhead is
  lower." This sits under "What your buyer gets".
- **`/join`:** "Your borrowers get lower costs because our overhead is
  lower." This is in "The channel" section, before the "No lead is sold"
  note. It contains no earnings or compensation language.
- **Step //03 is unchanged, as asked.** Note: it does **not** currently
  say "we pass those savings on to you". It reads "A licensed loan
  officer checks the file, answers the hard questions, and closes the
  loan. One person, start to close." The new band right under it now
  carries that sentence.

### 3b, `RateVsAverage` (built, OFF)
- **Flag:** `CONFIG.pricing.benchmarkComparison.enabled` is true only
  when `SHOW_NATIONAL_AVG_COMPARISON` is exactly `"true"`. It is unset
  everywhere.
- **Benchmark:** entered by hand in
  `CONFIG.pricing.benchmarkComparison.benchmark`.
  - Source: Freddie Mac Primary Mortgage Market Survey (PMMS), 30-year
    fixed, https://www.freddiemac.com/pmms.
  - The week, rate, fees and points, and the source's stated basis are
    **bracketed placeholders**. Nothing was looked up or filled in.
- **Example side:** the "Lowest rate without risky features" option of
  the WA first-time purchase example (80% LTV, 30-year fixed), as of
  `examplesAsOf`. The numbers come from `buildPricingRun()`, never from
  the model.
- **Logic** (`lib/pricing/benchmark.ts`, pure, tested). It returns
  nothing unless all of these hold:
  - every benchmark field is filled (no brackets), with an https source,
    an ISO date, and plain decimals
  - same product as the scenario
  - the benchmark week is within 6 days of the example date
  - the run is a dated **example**, never a manual snapshot
  - the option has no risky feature
- **"Below" is computed, never asserted.** The heading says "priced below"
  only when the example rate is lower **and** its points plus origination
  (% of loan) are no higher than the benchmark's fees and points. A lower
  rate bought with more points gets the neutral heading "This example
  next to the national average…".
- **Rendered** (`components/pricing/RateVsAverage.tsx`, server, no JS):
  - two cards: example (rate, points + origination, APR, other lender
    fees) and benchmark (rate, fees and points; APR and lender fees "Not
    compared")
  - the rate difference, both dates, a 6-point assumptions footnote, and
    a source link
  - strings in `lib/content/rate-vs-average.ts`
- **Placement:** `/rates`, under the three cards, only on its own
  scenario tab (`?s=wa-first-purchase`), only in example mode, and not
  for unlicensed-state visitors. `/rates` is noindex.
- **Guard:** `check:copy` now fails the build on "national average",
  "below/under/lower than/less than/better than/beats (the) (national/
  market/industry) average" in any shipped file except the component,
  its strings, its logic, and their tests.
- **M8 prompt** (DRAFT) hard rule 1 gains: "Never compare any rate,
  example or otherwise, with a published survey, index, or benchmark
  rate, and never describe LoanM8 pricing as lower or better than what
  other lenders or the market charge."

### Report back: every place a rate-comparison claim would appear
For counsel, before `SHOW_NATIONAL_AVG_COMPARISON` is turned on.
1. **The only render site:** `/rates?s=wa-first-purchase` →
   `RateVsAverage`. Exact strings (`lib/content/rate-vs-average.ts`):
   - Eyebrow: "// dated comparison · example pricing"
   - Heading when computed below: "On {date}, this example priced below
     the national average for a {product} loan that week."
   - Heading otherwise: "This example next to the national average for a
     {product} loan that week."
   - Card labels: "LoanM8 example, {date}" and "{source}, week of {date}".
   - Rows: Rate; "Points and origination, % of loan" (example) / "Fees
     and points, % of loan" (benchmark); APR and "Other lender fees"
     (example only, "Not compared").
   - "Rate difference: {diff} percentage points."
   - Footnotes:
     1. not a quote, offer or commitment
     2. which example option and scenario, and its date
     3. benchmark source, product and week, plus the source's own basis
        (quoted)
     4. how points are compared, and when "below" is used
     5. APR and fees not compared
     6. an average is not what any one borrower is offered
2. **Nowhere else, by construction:**
   - not the homepage, state pages, `/sample-brief`, calculators, M8 chat
     (new prompt rule), Second Look (never compares pricing)
   - not `/ai`, `/llms.txt`, `/api/agent/*`, or the pricing summary
     appended to M8 (`lib/pricing/summary.ts` has no benchmark)
   - not metadata, JSON-LD, or the sitemap
   - `check:copy` enforces this.
3. **Related cost claims, live now, for counsel to read alongside** (cost
   structure, not rate comparisons; no baseline is named):
   - homepage band "Less overhead. Lower costs." plus its body
   - the About paragraph
   - the `/agents` line
   - the `/join` line
   - Question: is "lower costs" without a stated comparison acceptable,
     or should it name what it is lower than?
4. **Questions to settle before the flag goes on:**
   - Does a stated example rate next to a benchmark trigger Reg Z
     §1026.24 advertising terms? APR is shown. Is the scenario's
     assumption list on the same page enough?
   - Reg N (MAP rule) comparisons: is "below" on a single dated example
     with this footnote acceptable?
   - Attribution or permission terms for quoting Freddie Mac PMMS.
   - Whether PMMS still publishes fees and points for the week. If it
     does not, the component cannot render (by design) until counsel
     decides how to show the cost side.
   - Who enters the weekly figures, and that they always match
     `examplesAsOf`.

### Verified
- `npm run verify` passes: lint, `check:copy` (a temporary stray "below the national
  average" line in `lib/` failed it, then was removed), `check:identity`, 110 tests (10 new),
  build, `check:bundle`.
- **Production build, `/rates?s=wa-first-purchase`:** no comparison
  markup with the flag off, and none with the flag on while the
  benchmark holds placeholders.
- **Local-only render** with fictional benchmark values (reverted, never
  committed), at 1280 and 390:
  - two cards side by side, stacked on phones
  - no horizontal overflow
  - absent on the other scenario tabs
- **Savings copy:** checked on the homepage band (night and paper, 1280
  and 390), About, `/agents` and `/join`.
- `qa/overflow` clean (the only console error is the local Analytics 404);
  `qa/fonts` 0 findings; `qa/footer` and `qa/about` pass.

### Files
- `lib/copy.ts` (`savings`), `lib/config.ts` (`pricing.benchmarkComparison`)
- `lib/pricing/benchmark.ts` (+ test)
- `lib/content/rate-vs-average.ts`
- `components/pricing/RateVsAverage.tsx` (+ test), `pricing.css`
- `components/home/HowItWorks.tsx`, `About.tsx`, `home.css`
- `app/agents/page.tsx`, `app/join/page.tsx`, `app/rates/page.tsx`
- `lib/prompts/m8-system.ts`, `scripts/check-copy.mjs`
- Docs: this log, `CLAUDE.md`, `PLACEHOLDERS.md`, `ATTORNEY_REVIEW_LIST.md`

### Next up
- Owner: the benchmark figures (only once counsel clears it), then set
  `SHOW_NATIONAL_AVG_COMPARISON=true` on a preview first.
- Owner items still open from v18: `APPLICATION_URL_MLO_001`/`_002`,
  the Vercel contact-email check, the real monogram asset, and Patch C
  approval.

## v18 — Round 3: mobile beacon pill, mobile menu fixes, paper contrast, "AI" shimmer, trust line, Start your application + M8 prep (2026-10-02)

Order followed: audits (Items 1, 4) → fixes (5, 6, 7) → builds (1, 4) →
feature Item 2 → **STOP** (Item 3 not started, waiting for approval).

### Audit findings (before any change)
**Item 1, location beacon at 390px:**
- The desktop bar under the nav is `display: none` below 1024px, so
  nothing showed under the mobile header on any page.
- The only mobile beacon was the v15 one under the homepage trust strip,
  about 1,150px down, wrapping to ~3 lines. Other pages had none.
- No overflow or overlap.

**Item 4, mobile menu at 390px:**

| Check | Before |
| --- | --- |
| Opens/closes on the menu button | ✓ |
| Esc closes | ✓ |
| Outside tap closes | ✗ (header taps did nothing) |
| Lists every item; Partner expands inline (MLOs, agents, investors) | ✓ |
| Two-group styling with divider | ✓ |
| Theme toggle reachable | ✓ |
| Background scroll locks | ✓ |
| Links close the menu: other page | ✓ |
| Links close the menu: same page | ✗ (`/#about` on home, or "Real estate agents" on `/agents`, left it open with scroll locked) |

Also: the sheet used a hardcoded `top: 61px` under a 69px header.

### Item 5, paper-mode contrast (WCAG ratios, measured in the browser)
A sweep (QA script, not shipped) checked every visible text element on 17
routes at 1280 and 390, composited over its real background, in paper
mode.
- Result: 74 findings before, 3 after.
- The 3 remaining are the wordmark "M8" twice (a logotype, exempt; the
  brand rule keeps it M8 Green) and a sweep false positive on the
  Second Look toggle. The real toggle is Forest on the M8 Green thumb,
  ~6.9:1; the sweep can't see the sliding thumb.

| Item | Before | After | Fix |
| --- | --- | --- | --- |
| Drift words ("30-year fixed", "FHA"…) at fade peak | 1.2:1 | 3.4:1 | paper `--term-opacity` 0.22 → 0.55; reduced motion rests at full term opacity |
| "I'm shopping a mortgage" label / sub (disabled until a booking link exists) | 2.65 / 1.71 | 9.5 / 9.5 | paper `.cta--disabled` keeps text at full strength (muted look moved to the fill); `.cta__sub` opacity 1 |
| Every paper accent text (links, active nav, footer labels, "currently on", beacon link, NMLS line, `/ai` code, chat/consent buttons, step labels) | 2.95–3.24 | 5.3–5.9 | paper `--accent` Deep Green (3.2:1) → new token `--color-m8-pine` #0F6E56 (also `.scene--paper`) |
| Outline button sub-labels | 3.93 | 6.2 | `.cta__sub` opacity 1 in paper |
| Disabled "Book a call" pills | 1.96 | 5.9 | same disabled rule |
| Sample brief "Watch for" | 2.9 | ~5.5 | `--color-m8-pine` |
| Calculator result "5 yrs 2 mo" | 2.9 | 5.3 | accent → Pine |

Dark themes are unchanged.

### Item 6, "AI" shimmer
- `copy.hero.taglineShimmer` marks the a in "Loan" and the i in
  "intelligence". `Reveal` gains a `shimmer` prop that wraps them in
  `.ai-shimmer`.
- The gradient ends are transparent, so at rest the headline's own sheen
  shows through. Dark stops: `#9FE1CB` (new `--color-m8-mint`) →
  `#5DCAA5` → `#E1F5EE`. Paper: `#0F6E56` → `#1D9E75` → `#04342C`.
- 9s cycle: rest for 0–40%, then sweep with
  `cubic-bezier(.45,0,.55,1)`; size 300%, from `150% 0` to `-50% 0`.
  Measured 150% at 3.6s, −49.9% at 8.9s, both letters identical.
- The heading's accessible name is still "Loan intelligence." (sr-only
  copy, split spans aria-hidden).
- Reduced motion: no animation, base colour.

### Item 7
- New `components/TrustLine.tsx`, used by the homepage grid and every
  `BookingCTA` intake (so the Next step cards too): "This is not a credit
  pull · No lead selling · No trigger leads · Free · No spam".
- Hungry-MLO sub: "Licensed in any state? We're vetting originators now."

### Items 1 and 4 builds (mobile only; desktop unchanged)
- **Pill** (`LocationBeacon variant="pill"`, rendered by `Nav` under the
  header, in the page flow, not sticky):
  - reads `● [outline] WA · Jason Shapiro · Change`
  - the name truncates with an ellipsis (min 2.5em); state and "Change"
    never shrink; always one line, at 16px page padding
  - choose state: "OR · Choose your loan officer"; unlicensed: "NV · No
    licensed loan officer yet"; no name (source none): "● Choose your
    state", where the whole pill opens the picker
- **The full line heads the mobile menu.**
- **"Change" opens the picker as a bottom sheet** (portal, Esc or backdrop
  closes, focus moves to the select). On desktop the same component is a
  centred dialog.
- **The old under-trust-strip mobile beacon is removed.**
- **Menu fixes:**
  - outside tap closes it
  - any link tap closes it (same-page included)
  - a tap on the sheet's empty area closes it
  - top = measured header height

**After:** every Item 4 check passes. Verified: pill text in all four
states, scrolls away, one line at 320px, a forced squeeze truncates the
name with "Change" intact, sheet bottom-aligned and full-width, pick OR →
"OR · Ryder Fasse", menu line, Esc closes the sheet but not the menu.

### Item 2: Start your application + Prep with M8
- **2a.**
  - Each MLO record has `applicationUrl` (server env
    `APPLICATION_URL_MLO_001` and `_002`; bracketed placeholder by
    default).
  - `hasApplicationUrl()` accepts https only.
  - New `components/mlo/ApplyCta.tsx`:
    - matched MLO with a link → opens it in a new tab, with "Opens
      {name}'s secure application. Your credit isn't pulled until you
      authorize it there."
    - matched without a link → hidden (never another MLO's link)
    - no match → opens the state picker first
    - routing off → nothing
  - Shown in the Next step cards, `/rates`, calculator pages, the matched
    MLO card, and the prep summary.
- **2b.**
  - New `lib/prep/machine.ts`, a pure state machine shared by text now and
    voice later. Fields: purpose, property type, property state, price
    range, down payment range, occupancy, employment type, income range,
    timeline, questions.
  - `containsSensitive()` rejects SSNs, dates of birth and account
    numbers in free text, and never stores them. There is no field for
    them.
  - UI: `components/chat/PrepFlow.tsx`, entered at `/chat?prep=1` after
    the AI disclosure gate, or by a button in the scripted demo.
  - The state prefills from routing, and the chosen state updates routing
    so the hand-off goes to that state's MLO.
  - The summary has Edit, Copy and Start your application. Nothing is
    sent anywhere.
- **2c.** New `components/NextStepActions.tsx`: Talk to a licensed loan
  officer (primary), Start your application (outlined), "Or prep it with
  M8 first →", then the trust line. Used on `/sample-brief`, state pages
  and `/rates`.
- **M8 system prompt:** new section 10, "When the person is ready to
  apply". It offers both paths, lists exactly the machine's fields and
  the never-ask list (generated from `lib/prep/machine.ts`), says the
  loan officer's application is the official one, and bans
  "submitted/received/taken". The routing section is renumbered to 11.
- **Verified:**
  - **WA, link set:** href and `target=_blank` correct, note names the MLO.
  - **OR, no link:** button hidden.
  - **No state:** button opens the picker; picking WA turns it into the
    link.
  - **Prep:**
    - the gate comes first and the state prefills (CA)
    - an SSN is rejected with a warning and not stored
    - picking OR re-routes to Ryder (no link, so no apply button)
    - the summary shows all 10 answers
    - no "submitted" anywhere
  - 7 new tests; 100 total.

### Verified overall
- `npm run verify` passes: 100 tests, build, `check:identity`,
  `check:bundle`.
- `qa/overflow` is clean on 24 routes at both widths; the only console
  error is the local Analytics 404.
- `qa/fonts`: 0 findings. `qa/footer` and `qa/about` pass.

### Not done (after the STOP)
- Item 3 (savings copy, and the `RateVsAverage` component behind
  `SHOW_NATIONAL_AVG_COMPARISON=false`), including its report-back list of
  rate-comparison claim locations.

## v17 — How it works step //03, demo gate email, two-line hero subhead, routing on for previews (2026-10-01)

### 1. Step //03 never activated: root cause
- `activeStep` came from one IntersectionObserver in
  `components/motion/StepList.tsx` with `rootMargin: "-45% 0px -45% 0px"`:
  a step was active only while it crossed the middle 10% of the viewport.
- There was no hardcoded count, `index < 2`, `steps.length - 1` or clamp.
  Styling keyed only off `i === active` (`.is-active`); no `nth-child`.
- **The cause was the container.**
  - The How it works sheet (`.sheet-item`) is taller than the viewport, so
    `SheetStack` pins it by its bottom edge: `top: -311px` at 1280×800,
    -309px at 1280×720, -313px at 1440×900.
  - Once pinned it stops moving, and the next sheet slides over it.
  - Measured while //03 was still visible, its top never rose above 456px
    at 1280×800, 403px at 1280×720 or 522px at 1440×900. The band was
    360–440, 324–396 and 405–495 respectively, so //03 never entered it.
  - //03 only "activated" once it was already covered. Phones (390×844)
    were fine.
  - Threshold tweaks could never fix this.

### 1b. Fix (owner's pattern)
- New `lib/useActiveStep.ts`: one observer over every step with a
  `-40% 0px -40% 0px` band (highest visible index wins), plus an end
  sentinel that forces the last step active.
- `StepList` uses it:
  - steps have `data-step` and `data-state` (before/active/after)
  - a `.steplist-tail` spacer (35vh desktop, 8vh phones) sits before the
    1px sentinel, inside the section
  - styling derives only from `i === active`
  - the pinned card renders `steps[active]`
- `/join`'s recap (the other `StepList`) gets the same logic.

**Verified** (scrolling in 25px steps, recording the active step only while
it is actually on screen, not under the next sheet):

| Viewport | Down | Up | //03 active while visible | Card at //03 |
| --- | --- | --- | --- | --- |
| 1280×800 | 01→02→03 | 03→02→01 | yes | "// 03 — VERIFY · Talk to your licensed loan officer. · // M8: IDLE" |
| 1440×900 | 01→02→03 | 03→02→01 | yes | same |
| 1280×720 | 01→02→03 | 03→02→01 | yes | same |
| 390×844 | 01→02→03 | 03→02→01 | yes | inline visuals (no pinned card on phones) |

The card never disagreed with the active step. `/join` at 1280×800 ran
01→05 and 05→01.

### 2. Demo gate email
- `CONFIG.demoContactEmail` default `jason@ratem8.com` → `info@loanm8.com`.
  It covers the visible text, the `mailto:` link and the `/api/demo-auth`
  503 message (same constant).
- Repo search for `@ratem8` / `ratem8.com`:
  - The only live address was that constant.
  - Everything else is history in this log (pre-launch item 21, v8/v14
    entries) plus the `PLACEHOLDERS.md` row, now updated.
- Nothing on `/privacy` or in metadata.
- Pre-launch item 21 also mentions Vercel env vars with `@ratem8` values.
  This connector can't read env vars, so check
  `NEXT_PUBLIC_DEMO_CONTACT_EMAIL` and `NEXT_PUBLIC_CONTACT_EMAIL` in
  Vercel; a set value overrides the default.

### 3. Hero subhead
- `copy.hero.subLines`: "AI-powered mortgage rate shopping, built for
  humans and their AI assistants." / "Licensed, vetted loan officers at
  every turn."
- Rendered as one `<p>` with a `<br />`. `copy.hero.sub` joins both for
  metadata and state pages.
- Size, colour and line-height are unchanged: 16px/25.6px desktop,
  14.6px/23.36px mobile.
- Two lines at 1280px; on phones line 1 wraps naturally. The trust line is
  unchanged.

### 4. MLO_ROUTING on for the preview
- The Vercel connector returns 403 for listing and creating project env
  vars on both `ratem-8` and `ratem-8-m4oy`, so the variable could not be
  set from here.
- Instead, `mloRoutingOn()` in `lib/config.ts`, used by the config and
  `middleware.ts`:
  - `MLO_ROUTING=true` → on; `false` → off
  - **unset → on for Vercel preview deployments, off in production**
- Unit-tested.

### Verified
- `npm run verify` passes: 93 tests, build, `check:identity`,
  `check:bundle`.
- `qa/overflow` is clean on every route at both widths; the only console
  error is the local Analytics 404. `qa/fonts`: 0 findings.

## v16 — Orb monogram follows the breath; hover hold on Voice / Q & A (2026-10-01)

**Owner request:** "make the M8 show up every time the Orb pulses/breathes
bigger and also have it stay showing/static when the mouse is hovering
over the Voice and Q&A buttons", and "leave the sizing of the M8 but just
have it come and go with the pulse."

### What changed
- `components/home/home.css`:
  - The once-per-session reveal is replaced by breath-synced opacity:
    0 → 0.62 → 0 on the orb's own keyframe duration and easing per state
    (idle 4s, listening 2.2s, speaking 1.4s, thinking 0.9s, and the 700ms
    tap pulse then idle).
  - The gloss smudge dips 0.7 → 0.3 in step.
  - `.hm-orb-wrap--mono-hold` pins it at 0.62 with `!important`, so the
    animation keeps running underneath and stays in sync when the hover
    ends.
  - Size, placement, tilt, filter and the orb itself are unchanged.
- `components/home/HeroOrb.tsx`:
  - Removed the sessionStorage reveal.
  - Voice and Q & A set the hold on mouse hover (pointer type mouse) and
    on keyboard focus (`:focus-visible` only, so a click doesn't pin it).

### Verified (local build, Chromium)
- **Sync:** sampled over 4s, the correlation between orb scale and
  monogram opacity is 1.000. Opacity is 0.62 at scale 1.05 (peak) and 0
  at scale 1.00. It is still 1.000 after a hover ends and after a popup
  opens and closes.
- **Hold:**
  - Hovering Voice or Q & A gives a steady 0.62 over 2.4s.
  - It is released on leave.
  - A click followed by leaving does not pin it.
  - Tab focus on Voice holds it.
- **Reduced motion:** 0 at rest, 0.62 on hover.
- **Frame rate** (390px, DPR 3, headless with a software GPU):
  - Unthrottled: about 58 fps, the same as with the monogram hidden.
  - 4× CPU throttle: about 49 fps against about 53 baseline.
  - Turning off the SVG filter changes nothing, so the cost is compositing
    one more animated layer in software; a PNG fallback would not help.
    Not measured on a real device.
- `npm run verify` passes.

### Also
- The owner confirmed "Home Trust Loans" is the DBA for NMLS 1761573
  (Adcom Group Inc) and is fine as shown. The v15.1 open question is
  closed.

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
