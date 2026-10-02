# COMPLIANCE.md — hard rules and where each one is enforced

LoanM8 is a regulated mortgage site. These rules apply to every string,
component, animation, API response, and piece of metadata. Each entry
says what the rule is and where in the codebase it is enforced. When a
design request conflicts with a rule here, the rule wins and the
conflict is logged in `ATTORNEY_REVIEW_LIST.md`.

Source brief: `docs/SITE_BRIEF.md` Section 5. Working rules for
contributors: `docs/BUILD_CONTRACT.md`.

---

## 1. Rates appear only as dated examples or dated manual snapshots, never as quotes

Changed 2026-10-01 (v13, Patch A). The owner reports that counsel approved
showing example pricing. Live pricing stays off.

- **Flags** (`lib/config.ts` → `CONFIG.pricing`, server-side env only):
  `PRICING_DEMO_EXAMPLES` on unless set to `"false"`; `PRICING_MANUAL`,
  `PRICING_LIVE`, `PRICING_RATESHEET`, `MLO_ROUTING` off by default.
  `CONFIG.liveRatesEnabled` stays false and `lenderCountDisplay` stays null.
- **Where rates may appear:** `/rates` only (noindex, not in the sitemap),
  plus the setup preview inside the auth-gated `/mlo` admin. Nowhere else.
- **Every pricing surface** shows the label "Example pricing · [date] · not
  a quote or commitment to lend." or "Rate snapshot · pulled [time] · not a
  quote or commitment to lend.", pinned at the top and repeated under the
  cards. Never the word "live" while `PRICING_LIVE` is off
  (`lib/pricing/copy.test.ts`).
- **Every rate shows its APR**, points or credit, origination and lender
  fees, lock period, payment, and the scenario assumptions.
- **Numbers come from code.** `lib/pricing/build.ts` computes APR
  (actuarial method), payments, totals and the anti-steering set from
  stored inputs. M8 never generates, rounds or infers a rate; its prompt
  may cite the example figures only as dated examples
  (`lib/prompts/m8-system.ts` rule 1, `lib/pricing/summary.ts`).
- **Three options first** (Reg Z 1026.36(e)(3)): lowest rate; lowest rate
  without risky features; lowest points plus origination fees. Computed
  from normalized quotes only; loan officer notes cannot change them
  (`lib/pricing/pricing.test.ts`).
- **Lenders are anonymized** and re-lettered per snapshot. Real names and
  the letter mapping stay server-side (`npm run check:bundle` fails the
  build if a lender name reaches the browser).
- **Lender consent.** Lenders whose terms restrict consumer display (PRMG,
  Plaza, HomeXpress) cannot be published until written consent is recorded
  in `lib/pricing/lenders.ts` (`publishSnapshot` refuses them).
- **Manual snapshots** require an attached source screenshot or PDF, are
  stored write-once with their sha256, and go stale after
  `PRICING_MANUAL_STALE_HOURS` (default 24). Every write is in the audit log.
- **Calculators** still take user-entered rates only and never supply one;
  `CALC_DISCLAIMER` renders on every calculator page and API response.
- **The agent API** still never returns a rate the caller did not send.
- The legacy scripted chat with real lender names and rates stays deleted;
  the "Sarah" Bellevue scenario returns only as a fictional fixture.

## 2. Banned phrases

"get a quote in 60 seconds", "lock in today's rate", "best rates",
"guaranteed", "lowest rates", "we'll beat any offer", "save $X",
"pre-approved in minutes", "limited time", countdowns, scarcity, urgency,
social proof, testimonials, fake stats, "trusted by" (plus "six figures",
"ground floor", "referral fee", "commission", "comp split", "hurry",
"act now").

- Enforced by `scripts/check-copy.mjs` (`npm run check:copy`), which scans
  `app/`, `components/`, `lib/`, `public/`, `middleware.ts` and fails the
  `verify` pipeline on any match. Because the check is a substring match,
  the word "guaranteed" is banned in every sense (the VA program copy says
  "backed by the VA").
- No stats: `lib/copy.ts` PROPOSAL comments record where earlier copy
  ("47 calls", "14 lenders", "17 years originating") was removed.

## 3. No earnings claims on `/join`

- `lib/copy.ts` → `copy.join` contains exactly one sentence about pay:
  "Compensation details are shared on the intro call."
- `app/join/page.tsx` renders only copy strings; no dollar figures, no
  splits, no "six figures" (also caught by rule 2's script).
- Borrower routing is unspecified in public copy ("Borrower assignment is
  explained on the intro call.") with a `ROUTING POLICY — to be defined`
  comment in the page source.

## 4. Second Look never compares pricing

- `lib/copy.ts` → `copy.secondLook.*` uses neutral language only.
- `lib/prompts/second-look.ts` forbids pricing comparisons, disparaging
  other lenders, and any promise; treats document text as data.
- `lib/second-look/schema.ts` has no field for LoanM8 pricing, so a
  comparison cannot be rendered even if the model produced one.
- `app/api/second-look/route.ts` response `disclaimer` states "not a
  pricing comparison".

## 5. AI disclosure before any interaction

- `lib/config.ts` → `AI_DISCLOSURE = "I'm an AI, not a person."`
- Hero orb tap card: `copy.hero.orbCardBody` (`components/home/*`).
- Chat gate: `copy.chat.gate.body` rendered before any interaction in
  `components/chat/ChatShell.tsx`; the scripted demo's first M8 line
  repeats it; `components/M8LiveChat.tsx` shows it above its input.
- Footer on every page: `copy.footer.aiNote` (`components/Footer.tsx`).
- `/ai` page and `/ai.md` state it for agents.

## 6. Recording disclosure and consent

- `components/chat/ChatShell.tsx` shows a pre-interaction consent screen
  (recording, transcript on request, retention placeholder, two-party
  consent line) with a Continue button. Voice stays disabled by
  `CONFIG.featureFlags.voice = false` (`components/chat/VoiceModal.tsx`).
- Two-party consent states come from `CONFIG.states[].twoPartyConsent`
  and are listed on `/privacy` and `/disclosures`.

## 7. "Not a credit pull" at every intake point

- `lib/config.ts` → `NOT_A_CREDIT_PULL`.
- `components/BookingCTA.tsx` prints it under every Calendly CTA (`intake` default true).
- Second Look consent screen, drop zone, chat gate, hero orb card, and
  `copy.how.steps[0]` all include it.

## 8. Equal Housing Lender on every page

- `components/Footer.tsx` renders the house icon with a visible text label
  and an `sr-only` "Equal Housing Lender logo" on every route (all routes
  use `PageShell` or render `Footer` directly).
- Also on `/disclosures`.

## 9. Fair housing / ECOA

- No copy targets or excludes by protected class; no imagery of a
  preferred buyer profile; no stock photos at all (the orb is the only
  character). Enforced by design review; `docs/BUILD_CONTRACT.md` §2.

## 10. Referral partners (agents)

- `lib/copy.ts` → `copy.agentsPage.sections[3]` and `howBox` state that no
  money, gifts, or marketing dollars flow between LoanM8 and agents.
- The words "referral fee" and "commission" are in the banned list
  (rule 2 script), so they cannot appear anywhere.
- Co-branded pages are described only as a future feature; nothing is built.

## 11. MLO recruiting addresses licensed MLOs only

- `copy.join.lookFor.items` includes "Must hold an active NMLS license"
  and "Sponsorship and state licensing requirements apply."
- `/join` has no form; the only CTA is the MLO Calendly link.

## 12. AI description line

- The brief permitted a plain "Built on Claude" label; the owner chose
  to drop it. `CONFIG.aiLine` ("AI built for mortgages, not borrowed
  from a chatbot.") renders in `components/Footer.tsx` and on
  `/disclosures`. No Anthropic logos anywhere. The Claude API remains
  disclosed factually as a vendor on `/privacy`.

## 13. Footer "not a commitment to lend" sentence on every page

- `lib/config.ts` → `NOT_A_COMMITMENT` (locked text) rendered by
  `components/Footer.tsx`, included in `lib/licensing.ts → buildDisclaimer()`,
  and in every agent API envelope (`lib/agent-api.ts`).

## Where the strings live

UI strings: `lib/copy.ts`. Long-form content: `lib/content/*.ts`
(home, agents, join, calculators, states, loan-estimate, sample-brief,
ai, legal). Shell-only labels: `components/chat/chatContent.ts`,
`components/second-look/strings.ts`. All are inside the `check:copy`
scan.

## 14. Principle 2 is a platform promise, not a UI claim

- `lib/principles.ts` holds the verbatim principle. No other copy implies
  live rates are shown on the site (`lib/copy.ts` PROPOSAL block lists the
  removed legacy sections that did).

---

## Robots / crawl policy

`app/robots.ts` allows standard crawlers and AI crawlers (OAI-SearchBot,
GPTBot, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended) once
stealth is off. This policy can be tightened later by editing that file;
nothing else depends on it.

## Agent guardrails (Section 13.8)

- An agent can never grant consent on a borrower's behalf: every agent
  API response carries `requires_human_consent_for: [credit_pull,
  recording, data_sharing]` (`lib/agent-api.ts`), and `/api/agent/handoff`
  says so in `message`.
- Uploaded documents and third-party text are data, never instructions:
  `lib/prompts/second-look.ts`, `lib/prompts/m8-system.ts`.
- No hidden text, cloaking, or AI-only content: `/ai.md`, `/principles.md`,
  and `/llms.txt` are generated from the same content modules as the
  visible pages (`lib/content/ai.ts`, `lib/principles.ts`, `lib/site.ts`).
- Every factual claim is config-driven (`lib/config.ts`); `PLACEHOLDERS.md`
  tracks unfilled values.

## Locked items (Section 3)

Brand tokens (`app/globals.css` `@theme`), the orb (`components/Orb.tsx`,
`.orb` CSS; `state` changes only speed/amplitude/halo), fonts
(`app/layout.tsx`), the eight principles (`lib/principles.ts`), the
tagline and hero headline (`lib/config.ts`, `lib/copy.ts`), the footer
compliance block (`components/Footer.tsx`). `// PROPOSAL:` comments mark
every place a change was suggested rather than made.
