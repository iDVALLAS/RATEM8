# RateM8 — Claude Code Build Primer

**Paste this entire document into Claude Code as your first message. It contains everything Claude Code needs to build RateM8 v1 and deploy it to Vercel on ratem8.com.**

---

## Who you are working for

Chris Boyle. NMLS-licensed Mortgage Loan Originator. Authorized in 49 states. Building RateM8 — an AI-powered mortgage rate shopping platform where every loan is closed by Chris personally via wholesale lender partners.

The AI assistant is called **M8** (built on Anthropic's Claude API). The brand voice is populist, technically grounded, calm, honest, specific. Never corporate, never pressuring, never effusive.

Tagline: **"Loan intelligence. Free for the people."**

---

## What you are building (v1 scope)

A single-domain consumer platform at **ratem8.com** that serves two audiences from one homepage:

1. **Borrowers** in WA and AZ who want to shop mortgage rates without being sold to
2. **Real estate agents** in WA and AZ who want a mortgage partner that doesn't spam their buyers

v1 is the **marketing site + booking funnel**. It does NOT yet include:
- The M8 chat (Stage 2, weeks 4–6)
- Live wholesale pricing display (Stage 3, weeks 7–12)
- Voice agent (Stage 4, month 3+)

DO build the architecture so M8 chat can drop into `/app/chat` later without refactoring.

---

## Tech stack (locked)

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS v4 with CSS variables for brand tokens
- **Hosting:** Vercel
- **Forms:** Server actions → forward to Chris's email via Resend (or Vercel email) for v1. Calendly embed for booking calls.
- **Fonts:** Self-hosted via `next/font/google`
  - Display: **Fraunces** (serif, distinctive, warm — for headlines and the tagline)
  - Body: **Geist** (sans, refined, modern — for UI and body)
  - Mono: **JetBrains Mono** (for data, labels, the subname "LOAN INTELLIGENCE")
- **Animation:** Pure CSS for the orb. Framer Motion only if absolutely needed later.
- **Analytics:** Vercel Analytics + a server-side event log for form submissions (not Google Analytics for v1 — fewer cookies, simpler privacy policy)

---

## Brand tokens (do not modify)

```css
--m8-green: #5DCAA5;      /* primary CTA, accents, orb */
--m8-deep: #1D9E75;       /* hover, secondary emphasis */
--m8-forest: #04342C;     /* dark text on green, dark mode foreground */
--m8-night: #050B08;      /* dark mode page background */
--m8-paper: #FAFAF9;      /* light mode page background, warmer than white */
--m8-stone: #E8E6E1;      /* subtle borders, dividers on paper */
--m8-charcoal: #1A1A19;   /* body text on paper */
```

**Default theme: dark.** RateM8 is a dark-mode-first brand. The orb glows on `--m8-night`. The serif tagline reads in `--m8-paper` against the dark background. Light mode exists but is secondary.

---

## The Orb (the brand's visual identity)

A breathing teal-green orb. CSS-only animation. Three sizes:
- **Hero (220px):** Centerpiece of the homepage above the tagline
- **Ambient (48px):** Sticky bottom-right corner companion after first scroll
- **Mark (24px):** Inline in nav and footer

The orb never changes color, never changes shape, always breathes. Animation: radial gradient from `--m8-green` center fading to transparent, with a `scale(1) → scale(1.05) → scale(1)` pulse on a 4-second loop, and a subtle inner glow that pulses on a 6-second loop offset by 1s. Add a soft outer blur halo using `filter: blur(40px)` on a sibling pseudo-element.

See `/components/Orb.tsx` for the reference implementation — start there.

---

## Page structure (single page, two CTAs)

```
┌─────────────────────────────────────────────────────────┐
│  NAV  [RateM8 wordmark + mark]    For Agents  About  → │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    [HERO ORB]                           │
│                                                         │
│            Loan intelligence.                           │
│            Free for the people.                         │
│                                                         │
│   AI-powered mortgage rate shopping. Every loan         │
│   closed by one licensed loan officer. Available in     │
│   Washington and Arizona.                               │
│                                                         │
│   ┌──────────────────┐  ┌──────────────────┐           │
│   │ I'm shopping a   │  │ I'm a real       │           │
│   │ mortgage  →      │  │ estate agent  →  │           │
│   └──────────────────┘  └──────────────────┘           │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  THE EIGHT PRINCIPLES                                   │
│  (8 cards, asymmetric grid, mono labels)                │
├─────────────────────────────────────────────────────────┤
│  HOW IT WORKS                                           │
│  (3-step explainer for borrowers)                       │
├─────────────────────────────────────────────────────────┤
│  FOR AGENTS                                             │
│  Headline: "Your buyers stall when financing            │
│  is murky. M8 unsticks them."                           │
│  3-card value prop + CTA to /agents (or modal)          │
├─────────────────────────────────────────────────────────┤
│  ABOUT CHRIS                                            │
│  (Brief bio, NMLS#, photo, 49-state license context     │
│   but emphasize WA + AZ as the launch markets)          │
├─────────────────────────────────────────────────────────┤
│  FOOTER                                                 │
│  (Wordmark, principles links, NMLS#, Equal Housing      │
│   Lender mark, social, privacy)                         │
└─────────────────────────────────────────────────────────┘
```

Two-page architecture in v1:
- `/` — Homepage as above
- `/agents` — Agent deep-dive: full value prop, partnership terms, co-branded subdomain explanation, booking link
- (later) `/chat` — M8 chat
- (later) `/[agent-slug]` — Co-branded agent subdomains

---

## Copy library

All real copy lives in `/lib/copy.ts`. Pull strings from there, never hardcode in components. This makes A/B testing and content edits trivial later.

The hero, principles, and agent section copy is already written in that file — use it verbatim. If you want to suggest changes, propose them as comments, don't edit the strings.

---

## The eight principles (display verbatim — these are the brand spine)

1. **One loan officer, start to close.** No bouncing between reps.
2. **Live wholesale pricing.** Not yesterday's bait rate.
3. **Every lender shopped on every file.** Same algorithm for everyone.
4. **All-in cost displayed before you decide.** No surprises at signing.
5. **Soft pull until you're ready.** No trigger leads. No spam blast.
6. **Your data stays yours.** Never sold, never shared, fully exportable.
7. **M8 shops the math. A licensed human verifies the deal.**
8. **Documented decisions.** You leave with a written record.

---

## CTAs and form behavior

Two primary CTAs on the homepage. Each routes to a Calendly embed in a modal (not a separate page):

- **Borrower CTA → "Talk to Chris" Calendly** (15-min intro call)
- **Agent CTA → "Partner intro call" Calendly** (20-min agent partnership call)

Calendly URLs are placeholders in the code — Chris will swap them in via `.env.local`:
```
NEXT_PUBLIC_CALENDLY_BORROWER=https://calendly.com/chris-ratem8/talk-to-chris
NEXT_PUBLIC_CALENDLY_AGENT=https://calendly.com/chris-ratem8/agent-partnership
```

DO NOT add a "join the waitlist" email form. Chris doesn't want one in v1. The two CTAs are both "book a call." That's the whole funnel.

---

## Compliance must-haves on the v1 site

Even though no rate display and no chat exists yet, the marketing site itself is regulated. Required elements:

- **NMLS #** displayed in footer (placeholder `NMLS #XXXXXX` until Chris drops his in)
- **Equal Housing Lender** logo or text in footer
- **"Licensed in WA and AZ"** explicit on homepage and footer (NOT "49 states" on the public site — that's true but creates expectation mismatch for v1 launch)
- **Privacy policy link** in footer (placeholder `/privacy` page with a short v1 statement: "We don't sell leads. We don't share your data. Full policy coming with platform launch.")
- **Disclaimer at bottom of homepage:** "RateM8 Loan Intelligence is the trade name of [Chris's licensed entity]. Equal Housing Lender. NMLS #XXXXXX. Licensed in Washington (NMLS #) and Arizona (NMLS #). This is not a commitment to lend. Rates and terms subject to change."

Use brackets `[ ]` for any field Chris needs to fill in. Don't invent license numbers.

---

## Files to expect in this scaffold

Start with what's in `/home/claude/ratem8/` — extend from there. Key files:

- `package.json` — Next.js 15, TypeScript, Tailwind v4, fonts
- `app/layout.tsx` — Root layout with fonts and brand CSS variables
- `app/page.tsx` — The homepage
- `app/globals.css` — Brand tokens, base styles
- `components/Orb.tsx` — The breathing orb
- `components/Nav.tsx` — Sticky top nav with wordmark
- `components/Footer.tsx` — Footer with compliance disclosures
- `components/PrincipleCard.tsx` — Used in the principles grid
- `lib/copy.ts` — All user-facing strings, single source of truth
- `lib/principles.ts` — The 8 principles as data
- `.env.local.example` — Environment variables template

---

## Deployment to ratem8.com

After build:

1. `git init && git add . && git commit -m "RateM8 v1"`
2. Push to a private GitHub repo
3. Connect repo to Vercel
4. In Vercel: Project Settings → Domains → add `ratem8.com` and `www.ratem8.com`
5. Update DNS at your registrar:
   - `A` record `@` → `76.76.21.21` (Vercel)
   - `CNAME` `www` → `cname.vercel-dns.com`
6. Set environment variables in Vercel: the two Calendly URLs above
7. Deploy. HTTPS provisioning is automatic via Vercel.

DNS propagation: 1–6 hours typically.

---

## What to do RIGHT NOW

1. Read every file in this scaffold to understand the existing structure
2. Install dependencies: `npm install`
3. Run dev: `npm run dev`
4. Open `http://localhost:3000` and verify the orb breathes, the layout renders, fonts load
5. Polish only what feels rough — Chris cares about the orb feeling alive, the typography feeling expensive, and the eight principles section feeling like a manifesto, not a feature list
6. Ship to Vercel once it feels right

**Do not over-engineer.** This is v1. Keep components small. Skip Storybook, skip testing infrastructure, skip i18n. Focus on: orb that breathes beautifully, typography that punches, two CTAs that feel like distinct paths, footer that reads as compliant and serious.

---

## Things Chris explicitly does NOT want in v1

- Email waitlist forms
- "Get a quote in 60 seconds" anywhere
- Stock photos of smiling couples in front of houses
- A blog or content section (comes month 4)
- Live chat widget
- Cookie banners beyond the legally required minimum (only if compliance attorney says so later)
- Testimonials (none exist yet; don't invent them)
- "Trusted by" logos
- Any countdown timer, urgency language, or scarcity tactic anywhere

---

## Things Chris explicitly DOES want

- The breathing orb as the first thing you see
- The serif tagline rendered with care — italicize "Free for the people."
- The principles section feeling like an op-ed, not a feature grid
- An agent section that respects agents' intelligence (no marketing jargon)
- A footer that reads as a regulated entity, not a startup pitch
- A site that looks expensive but loads in under 1.5 seconds on 4G

---

End of primer. Build accordingly. When in doubt, choose calm and specific over loud and corporate.
