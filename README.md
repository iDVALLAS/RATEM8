# LoanM8

**Loan intelligence. Free for the people.**

A consumer-facing, AI-powered mortgage rate-shopping brokerage. The AI,
**M8**, is built on Anthropic's Claude API and acts as a borrower
advocate: it explains the math, compares options honestly, and produces a
written Rate Strategy Brief the borrower keeps. Loans are originated by
licensed Mortgage Loan Originators. LoanM8 does not sell leads.

Launch states: Washington (serving Washington), Arizona,
California, Texas. Every fact on the site comes from `lib/config.ts`.

---

## Stack

- Next.js 15 (App Router) + TypeScript (strict)
- Tailwind CSS v4 with CSS-variable tokens (`app/globals.css`)
- Fonts via `next/font`: Fraunces (display), Geist (body/UI), JetBrains Mono (labels)
- Motion: pure CSS + `IntersectionObserver` through one hook, `lib/useSceneTimeline.ts`
- Vercel hosting + Vercel Analytics (no other trackers)
- Calendly for every consumer CTA (no forms, no waitlist)
- Claude API reserved behind feature flags (`lib/config.ts` → `featureFlags`)
- Tests: Vitest (`lib/calc.test.ts`, `lib/agent-api.test.ts`, …)

## Quick start

```bash
npm install
cp .env.local.example .env.local   # fill in Calendly URLs; STEALTH=false locally
npm run dev                        # http://localhost:3000
```

## Scripts

| Command              | What it does                                                    |
|----------------------|-----------------------------------------------------------------|
| `npm run dev`        | Dev server                                                      |
| `npm run build`      | Production build (must pass with zero errors)                   |
| `npm run lint`       | ESLint (Next core-web-vitals + TypeScript)                      |
| `npm test`           | Vitest unit tests (calculator math, agent API envelope, …)      |
| `npm run check:copy` | Fails if any banned phrase appears in app/, components/, lib/, public/ |
| `npm run verify`     | lint + check:copy + test + build, in that order                 |

## Routes

| Route | Purpose |
|---|---|
| `/` | Homepage: hero orb, four-button grid, trust strip, states, eight principles, how it works, Second Look teaser, agents, MLO band, about |
| `/second-look` | Loan Estimate decode demo (sample); real upload built, feature-flagged off |
| `/join` | Recruiting page for licensed MLOs |
| `/agents` | Real estate agent partnership page |
| `/calculators` + 4 pages | Points break-even, refinance break-even, rent vs. buy, affordability (+ `/calculators/methodology.md`) |
| `/tools` + 12 pages | The earlier calculator set, kept and pointed at the same rules |
| `/states/{washington,arizona,california,texas}` | State pages with license lines |
| `/principles` (+ `/principles.md`) | The eight principles as a scroll manifesto |
| `/loan-estimate` | Annotated Loan Estimate guide |
| `/sample-brief` | Sample Rate Strategy Brief (labeled SAMPLE) |
| `/chat` | M8 chat shell: disclosure gate, orb states, scripted demo. No live AI |
| `/ai` (+ `/ai.md`) | What LoanM8 is and is not, for AI assistants and humans |
| `/privacy`, `/terms`, `/disclosures` | Legal pages, every counsel-dependent block marked `[COUNSEL REVIEW]` |
| `/llms.txt`, `/robots.txt`, `/sitemap.xml` | AI-agent and crawler readiness |
| `/api/agent/*` | Agent API: calculators, states, handoff, OpenAPI spec (`AGENTS.md`) |
| `/api/second-look` | Returns 503 unless `SECOND_LOOK_LIVE=true` |
| `/demo` | Password-gated tester preview (stealth-era tool) |

## Configuration

Everything factual lives in **`lib/config.ts`**: brand, legal entity,
principal MLO (and a `team` array for more), contact emails, the four
states with their license placeholders and regulator links, Calendly
links (from env), feature flags, and the retention placeholder.
Bracketed values like `[WA ENTITY LICENSE #]` must be filled before
launch; `PLACEHOLDERS.md` lists every one with its file path.

Env vars are documented in `.env.local.example`.

## Stealth gate

`middleware.ts` keeps the site in stealth until `NEXT_PUBLIC_STEALTH_MODE`
is set to the string `false`. In stealth, anonymous visitors see the
coming-soon homepage and only the legally/machine-required routes
(`/ai`, `/llms.txt`, `/disclosures`, `/privacy`, `/terms`, `/states/*`,
`/api/agent/*`, robots, sitemap). Testers with the `/demo` cookie see
everything. Set the variable to `false` in Vercel to launch.

## Deploy to Vercel (loanm8.com)

1. Import the GitHub repo into Vercel (framework preset: Next.js).
2. Environment variables (Production + Preview):
   `NEXT_PUBLIC_SITE_URL=https://loanm8.com`, the four
   `NEXT_PUBLIC_CALENDLY_*` URLs, `NEXT_PUBLIC_CONTACT_EMAIL`,
   `NEXT_PUBLIC_STEALTH_MODE` (`true` until launch), `DEMO_PASSWORD`.
   Leave `ANTHROPIC_API_KEY` and `SECOND_LOOK_LIVE` unset until counsel
   signs off on `lib/prompts/*`.
3. Domains: add `loanm8.com` and `www.loanm8.com`; set `www` to redirect
   to the apex (or vice versa) in Vercel's domain settings.
4. DNS at the registrar: `A @ → 76.76.21.21`, `CNAME www → cname.vercel-dns.com`
   (or follow the records Vercel shows for your account).
5. Vercel Analytics: enable in the project's Analytics tab. The site
   already mounts `@vercel/analytics`; the custom `ai_referral` and
   `agent_origin` events appear under Custom Events.
6. After the first deploy, run the routine in `docs/ai-visibility-checklist.md`.

## Compliance and legal

- `COMPLIANCE.md` — every hard rule and where it is enforced in code.
- `ATTORNEY_REVIEW_LIST.md` — every counsel-dependent decision, grouped.
- `PLACEHOLDERS.md` — every bracketed value to fill before launch.
- `AGENTS.md` — the agent-facing surface and the MCP plan.

Locked items (never change without a brief revision): brand tokens, the
orb's color and shape, the fonts, the eight principles, the tagline, the
hero headline, the footer compliance block. See `docs/SITE_BRIEF.md`.

## Contributing

Read `docs/BUILD_CONTRACT.md` first. Then `docs/TYPOGRAPHY_GUIDE.md` and
`docs/PAPER_MODE_DECISIONS.md`. Run `npm run verify` before pushing.
