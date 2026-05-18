# RateM8

**Loan intelligence. Free for the people.**

Consumer-facing AI-powered mortgage rate shopping platform. Every loan is closed by Jason Shapiro, NMLS-licensed in Washington, Arizona, California, and Texas.

This repo contains the v1 marketing site. The M8 chat and live rate-shopping platform ship in Stage 2.

---

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS v4 with CSS variables for brand tokens
- Self-hosted Google fonts (Fraunces, Geist, JetBrains Mono)
- Vercel hosting
- Calendly for booking calls

## Quick start

```bash
npm install
cp .env.local.example .env.local
# Fill in Calendly URLs in .env.local
npm run dev
```

Open http://localhost:3000.

## Deploy

```bash
git remote add origin <your-repo>
git push origin main
```

Then in Vercel:
1. Import the repo
2. Set environment variables (the two `NEXT_PUBLIC_CALENDLY_*` URLs)
3. Add domain `ratem8.com` and `www.ratem8.com`
4. Update DNS at your registrar:
   - A record `@` → `76.76.21.21`
   - CNAME `www` → `cname.vercel-dns.com`

## File map

```
app/
  layout.tsx          # Root layout, fonts, metadata
  page.tsx            # Homepage
  globals.css         # Brand tokens, orb animation, base styles
  agents/page.tsx     # Agent partnership deep-dive
  privacy/page.tsx    # v1 privacy statement
components/
  Orb.tsx             # The breathing teal-green orb (brand identity)
  Wordmark.tsx        # RateM8 wordmark + subname
  Nav.tsx             # Sticky top nav
  Footer.tsx          # Compliance footer with NMLS, Equal Housing
  PrincipleCard.tsx   # Used in the 8 principles grid
  CTAButton.tsx       # Primary/secondary CTA buttons
lib/
  copy.ts             # All user-facing strings — single source of truth
  principles.ts       # The 8 principles as structured data
```

## Brand rules

See `CLAUDE_CODE_PRIMER.md` in the project root. Short version:

- The orb breathes. Never change its color or shape.
- "M8" is always emphasized in `--color-m8-green` (`#5DCAA5`) within the wordmark.
- Default theme is dark. Light mode is secondary.
- No urgency tactics. No "get a quote in 60 seconds." No stock-photo couples.
- All compliance disclosures (NMLS, Equal Housing, full state license list) must remain in the footer.

## Roadmap

- **v1 (now):** Marketing site, two CTAs, Calendly booking
- **v2 (weeks 4–6):** M8 text chat at `/chat` — Claude API integration
- **v3 (weeks 7–12):** Live wholesale pricing + 3-card anti-steering display + soft-pull credit
- **v4 (month 3+):** Voice agent via Vapi + ElevenLabs + Deepgram
- **v5 (month 5+):** Co-branded agent subdomains (`agentname.ratem8.com`)

---

Jason Shapiro · NMLS #1844143 · Equal Housing Lender
WA #1844143 · AZ #1037722 · CA DFPI #1844143 · TX #1844143
