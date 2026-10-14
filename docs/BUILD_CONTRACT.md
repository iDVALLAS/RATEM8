# LoanM8 build contract (for every contributor, human or agent)

Read this before writing a page. It is the short version of
`docs/SITE_BRIEF.md` plus the foundations that already exist in the repo.

## 1. Facts come from config, never from a component

- `lib/config.ts` exports `CONFIG` and helpers: `STATES`, `stateBySlug`,
  `stateDisplay`, `stateChip`, `LICENSED_IN_LINE`, `STATE_NAMES_LINE`,
  `STATE_CODES_LINE`, `MLO_REF` / `MLO_REF_CAP` (how to refer to the
  closer), `ALL_MLOS`, `HAS_TEAM`, `NOT_A_COMMITMENT`, `CALC_DISCLAIMER`,
  `SAMPLE_LABEL`, `SAMPLE_SENTENCE`, `AI_DISCLOSURE`, `NOT_A_CREDIT_PULL`,
  `hasBooking`, `isPlaceholder`.
- Never type a name, NMLS number, license, email, lender count, or
  Calendly URL. Never write "N lenders". `CONFIG.lenderCountDisplay` is
  null and stays null.
- `CONFIG.liveRatesEnabled` is false: **no rate is ever displayed**.
  Calculators only use user-entered rates. Demo figures are fictional and
  every frame shows `<SampleBadge />`.

## 2. Copy

- UI strings for your page are already in `lib/copy.ts` under your
  page's key (`copy.secondLook`, `copy.join`, `copy.agentsPage`,
  `copy.calculators`, `copy.chat`, `copy.ai`, `copy.statePage`, …). Use
  them verbatim. Do not edit `lib/copy.ts` (another worker is editing
  in parallel; conflicts break the build). If you need a string that is
  not there, put it in `lib/content/<page>.ts` (long-form content,
  FAQs, guide sections, legal skeletons belong there anyway).
- Voice: populist, technically grounded, calm, honest, specific. Never
  corporate, never pressuring, never effusive. Short sentences.
- Banned (the `npm run check:copy` script fails on them, anywhere in
  app/, components/, lib/, public/): "get a quote in 60 seconds",
  "lock in today's rate", "best rates", "guaranteed", "lowest rates",
  "we'll beat any offer", "save $X", "pre-approved in minutes",
  "limited time", countdowns, "trusted by", testimonials, "social proof",
  "six figures", "ground floor", "referral fee", "commission",
  "comp split", "hurry", "act now". Also: no invented statistics, no
  years-in-business, no timing promises ("same day", "24 hours"), no
  earnings claims on /join beyond "Compensation details are shared on
  the intro call."
- Every M8 surface says "I'm an AI, not a person." before any
  interaction. Every intake point says "This is not a credit pull."
- Second Look never compares pricing or implies LoanM8 can beat an
  offer. Neutral language about other lenders' fees only.
- Agents page: no money, gifts, or marketing dollars flow to agents.
- "Built on Claude" may appear as a small mono label. No logos.

## 3. Components you must reuse

- `components/PageShell.tsx` — Nav + `<main id="main">` + Footer, with
  optional breadcrumbs (`crumbs={[{name:"Home",path:"/"},…]}`). Every
  non-home route uses it.
- `components/motion/Scene.tsx` — viewport-triggered, replayable,
  reduced-motion-aware section. Render-prop child receives
  `{ step, reduced, replay, jumpTo, done }`. Props: `label` ("// 01 — drop"),
  `counter` ("01 / 05"), `steps` (ms offsets, one per step), `background`
  ("night" | "forest" | "paper" | "none"), `badge` (e.g. `<SampleBadge />`),
  `textEquivalent` (required plain-text description of the animation),
  `loop`, `autoStart`.
- `lib/useSceneTimeline.ts` — the hook behind Scene. `seq(start,
  interval, count)` builds step arrays. `reached(step, i)`.
- `components/motion/Reveal.tsx` — word-by-word headline; `accent` phrase
  renders italic serif green; `underline` draws a hand-drawn stroke.
- `components/motion/Bento.tsx` — `<Bento cols={2}>` + `<BentoSlot filled={step>=n} label="// true cost">`.
- `components/motion/SceneLabel.tsx`, `ReplayButton.tsx` (already inside Scene).
- `components/Orb.tsx` — `size` hero|ambient|mark, `state` idle|listening|thinking|speaking, `px` override. **Never** change its color or shape.
- `components/CTAButton.tsx` — variants primary | secondary | outline | pill; `sub`, `icon`.
- `components/BookingCTA.tsx` — `<BookingCTA kind="borrower|agent|mlo|secondLook">` renders the Calendly CTA with the not-a-credit-pull line; degrades to "coming soon" when the env var is empty.
- `components/SampleBadge.tsx`, `components/Provenance.tsx` (`updated="2026-09-29"`), `components/JsonLd.tsx` with builders in `lib/jsonld.ts` (`faqJsonLd`, `breadcrumbJsonLd`, `webPageJsonLd`, `stateServiceJsonLd`).
- `components/PrincipleCard.tsx` (+ `AccentTitle`), `components/Wordmark.tsx`.
- Calculators: `lib/calc.ts` (pointsBreakeven, refinanceBreakeven, rentVsBuy, affordability, pointsVsCredit; each returns `assumptions`), `lib/calc/format.ts`, `components/calc/*`.

## 4. CSS you can use (all in `app/globals.css`, do not edit that file)

Type: `.tagline` (Fraunces bold), `.font-serif-display`, `.accent-word`,
`.principle-label` / `.eyebrow` (mono caps green), `.mono-label`,
`.code-label` (`// 01 — drop` style). Body font is Geist; `.font-mono`.

Motion: `.step-in`, `.step-scale`, `.step-slide-l`, `.step-slide-r` +
`.is-on` when `step >= n`. `.bento-slot(--filled)`, `.tl` / `.tl-step` /
`.tl-dot.is-on` / `.tl-label` (timeline dots), `.scanline.is-on`,
`.draw-path.is-on` (SVG path draw with `pathLength="1"`),
`.is-flickering`, `.tw-cursor`, `.orb--pulse`.

Chapters: `Scene background="night|forest|paper"` flips the section's
tokens (`--bg`, `--fg`, `--muted`, `--rule`, `--accent`, …). Always style
with tokens (`var(--fg)`, `var(--muted)`, `var(--rule)`, `var(--accent)`,
`var(--accent-soft)`, `var(--bg-elevated)`, `var(--bg-sunken)`), never raw
brand hex, so Night/Dim/Paper themes and chapter flips all work.

Surfaces: `.card`, `.card--sunken`, `.dashed-box`, `.state-chip`,
`.sample-badge`, `.doc` / `.doc__row` / `.doc__section` / `.doc__field.is-reading|is-found` / `.doc__tag` (paper document mock),
`.phone` / `.bubble--m8` / `.bubble--user` / `.bubble--typing` (phone mock),
`.swipe-row` + `.swipe-dots` (mobile swipeable cards), `.m8-toggle`
(two-option switch with `data-value="0|1"`, `.m8-toggle__opt[aria-checked]`,
`.m8-toggle__thumb`), `.m8-range` (slider), `.faq` (details/summary),
`.prose-m8` (long-form), `.provenance`.

Page-specific CSS: create `components/<feature>/<feature>.css` and
`import "./<feature>.css"` from the component. Prefix classes with the
feature name (`.sl-`, `.join-`, `.ag-`, …) to avoid collisions.

## 5. Motion rules

Everything triggers on viewport entry, plays once, is replayable, and
has a static final state under `prefers-reduced-motion` (Scene handles
this: under reduced motion `step` is already the last step and
`data-reduced="true"` disables transitions). Durations 300–900 ms,
ease-out, ≤150 ms between sequenced items. Motion is meaningful, never
decorative noise. Decorative SVG is `aria-hidden`. Every animation has a
text equivalent (the `textEquivalent` prop).

## 6. Layout

Mobile-first: design for 360–430 px, then scale up. No horizontal
scroll. Thumb-reach CTAs (min 44 px tall). Page gutters `px-4 sm:px-6`.
Content widths `max-w-6xl` (sections) / `max-w-3xl` (prose). Semantic
landmarks, one `<h1>` per page, visible focus states (global). WCAG AA
contrast: use tokens.

## 7. Metadata and provenance

Every page exports `metadata` (title, description; no `robots: noindex`
unless the brief says so) and renders `<Provenance updated="2026-09-29" />`
near the bottom on content pages, plus JSON-LD where the brief asks
(FAQPage on calculators and the Loan Estimate guide; BreadcrumbList via
PageShell `crumbs`).

## 8. Verification before you finish

Run `npx tsc --noEmit`, `npx next lint`, and `npm run check:copy` — all
must pass. Do NOT run `npm run build` or `npm install` (other workers
share the tree); the integrator builds at the end. Do not edit
`lib/copy.ts`, `lib/config.ts`, `app/globals.css`, `app/layout.tsx`,
`components/Nav.tsx`, `components/Footer.tsx`, `lib/site.ts`,
`package.json`, or `middleware.ts` unless your task explicitly names it.
Do not commit.
