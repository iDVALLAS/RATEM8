# LoanM8 — Production Launch Patch Series (Claude Code prompt)

Paste everything below the line into Claude Code at the root of the LoanM8 repo.

---

You are working on LoanM8 (LoanM8.com), a Next.js 15 App Router + TypeScript + Tailwind v4 app deployed on Vercel. The AI assistant is **M8**, built on the Anthropic Claude API (`lib/m8.ts`, `/api/m8-chat` SSE route, `M8LiveChat`, `ChatExperienceWithToggle`). The site is currently behind a stealth gate with example/illustrative pricing. Your job is to take it to **production as a live consumer tool**.

Work in **discrete, numbered patches (L1–L8, plus L4b for the ARIVE pricing robot)**. For each patch: show the plan, list every file you'll touch, make the change, run `npm run build` + `npm run lint` + tests, deploy to a Vercel **preview**, and stop for my sign-off before the next patch. Never push to production without my explicit "promote." Keep a running `PATCHLOG.md`.

Before writing code, run a repo-wide audit and report back:
- every occurrence of "Shapiro Home Loans", "RateM8", "ratem8", "example", "illustrative", "demo", "sample", "Sarah", "placeholder", "TODO", "lorem"
- every hardcoded NMLS number, license number, phone, address, or company name
- every env var referenced vs. what exists in Vercel

---

## L1 — Single source of truth for licensing (`config/licensing.ts`)

Create one typed config that every footer, disclosure, MLO card, chat disclosure, and state page reads from. **No license number may be hardcoded anywhere else.** Sponsor must be swappable by changing one object. Current structure: LoanM8, LLC is the platform/brand; all loans are originated under the sponsor's NMLS.

```ts
export const PLATFORM = {
  legalName: "LoanM8, LLC",
  tradeName: "LoanM8 Loan Intelligence",
  site: "LoanM8.com",
};

export const SPONSOR = {
  legalName: "Adcom Group Inc",
  dba: "Home Trust Financial",
  nmls: "1761573",
  address: "135 Lake St S, Ste 230, Kirkland, WA 98033",
  phone: "833-395-5626",
  nmlsUrl: "https://www.nmlsconsumeraccess.org/EntityDetails.aspx/COMPANY/1761573",
  stateLicenses: {
    AZ: { regulator: "Arizona Department of Insurance and Financial Institutions", type: "Mortgage Broker License", id: "1003167" },
    CA: { regulator: "Department of Financial Protection and Innovation", type: "Licensed under the California Financing Law", id: "60DBO-98222" },
    OR: { regulator: "Oregon Division of Financial Regulation", type: "Mortgage Lending License", id: "1761573" },
    TX: { regulator: "Texas Department of Savings and Mortgage Lending", type: "Mortgage Company License", id: "1761573" },
    WA: { regulator: "Washington Department of Financial Institutions", type: "Consumer Loan Company License", id: "CL-1761573" },
  },
};

export const MLOS = {
  jason: { name: "Jason Shapiro", nmls: "1844143", photo: "/team/jason-shapiro.webp", stateLicenses: { CA: "CA-DFPI 1844143" } },
  ryder: { name: "Ryder Fasse", nmls: "119822", photo: "/team/ryder-fasse.webp" /* placeholder initials avatar until photo provided */ },
};

// Every state routes to Jason EXCEPT Oregon → Ryder.
export const STATE_MLO: Record<string, keyof typeof MLOS> = { OR: "ryder" /* default: jason */ };
```

- Headshots: place the provided `jason-shapiro.webp` (512×512, circular crop with transparent corners) in `public/team/`. Render with `next/image`, `rounded-full`, alt text "Jason Shapiro, NMLS #1844143". Sizes: 72px on the MLO card, 36px in the chat header beside the M8 orb, 28px on rate results. Use it on the MLO card, chat header, rate results, and emails. If an MLO has no photo file, fall back to an initials avatar in M8 Green — never a broken image.
- Add a build-time check that **fails the build** if any `TBD`, `VERIFY`, or `XXXX` string remains in this file when `NODE_ENV=production`.
- Keep the existing configurable launch-state switch (WA, AZ, CA, TX marketed; OR live via Ryder). Licensed-state status and marketed-state scope stay separate flags.

## L2 — Site-wide disclaimer rewrite

1. Replace every instance of **"Shapiro Home Loans"** site-wide with **"LoanM8, LLC"** where it refers to the platform/operator. Do not touch it where it would misstate who originates loans — loans are originated by the sponsor.
2. Home page footer, first line, exactly:
   > **LoanM8 Loan Intelligence is a trade name of LoanM8, LLC.**

   Delete everything that currently follows that line in that paragraph (it's redundant).
3. Second footer paragraph — rendered from `config/licensing.ts`, dynamic by the visitor's assigned state:
   > Mortgage loans are originated by Adcom Group Inc dba Home Trust Financial, NMLS #1761573 ([NMLS Consumer Access](link)). AZ Mortgage Broker License #1003167 · CA: Licensed by the Department of Financial Protection and Innovation under the California Financing Law, License #60DBO-98222 · OR Mortgage Lending License #1761573 · TX Mortgage Company License, NMLS #1761573 · WA Consumer Loan Company License #CL-1761573.
   >
   > Loan Officer: **Jason Shapiro, NMLS #1844143** (CA-DFPI 1844143). *Oregon borrowers:* **Ryder Fasse, NMLS #119822**, originating under Home Trust Financial's Oregon Mortgage Lending License #1761573.
   >
   > Equal Housing Opportunity. This is not a commitment to lend or an offer to extend credit. All loans are subject to credit approval, underwriting, and property eligibility. Rates, terms, and programs are subject to change without notice. Not all programs are available in all states.
4. Add the Equal Housing Opportunity logo.
5. **Texas Consumer Complaint Notice** — link on the home page to `/licensing/texas` using the current SML form for *mortgage companies* (7 TAC §56.200(c)), not the old mortgage-banker §81.200 text Home Trust currently shows. Pull the current form from sml.texas.gov.
6. Build `/licensing` (full table of every license from config, NMLS Consumer Access link, state notices) and link it in every footer.
7. MLO card, chat header, and every rate result must show the assigned MLO name + NMLS + sponsor name + sponsor NMLS. Oregon swaps to Ryder everywhere (card, chat, footer, emails).

## L3 — Remove all "example" mode; go live

- Delete the scripted Sarah/Bellevue demo, the scripted/live tab toggle, `/demo`, all "Example", "Illustrative", "Sample" badges and watermarks, and the stealth gate middleware. Remove the coming-soon homepage and update `robots.txt` + sitemap to allow indexing.
- Keep a hidden `?preview=1` internal flag for QA only.
- Wire the custom domain **LoanM8.com** (+ www redirect) in Vercel, HTTPS forced, HSTS on.

## L4 — ARIVE live pricing

- Add ARIVE credentials as **server-only sensitive** env vars (`ARIVE_API_KEY`, `ARIVE_CLIENT_ID`, `ARIVE_BASE_URL`, etc. — confirm names from the ARIVE docs I provide). Never expose to the client.
- Create `lib/pricing/arive.ts` + `/api/pricing` route: takes the borrower scenario, returns cross-lender results. Cache 5–15 min per scenario hash. Timeouts + retries + graceful fallback to the native rate-sheet engine.
- **Every rate shown must display APR alongside it**, plus a "Rate assumptions" link listing loan amount, LTV, credit score, property type, occupancy, points, lock period, and timestamp (Reg Z §1026.24 trigger-term rules).
- Lenders anonymized by default (Mode A). Show "Up to 14 lenders shopped" (minimum 3).
- No broker comp figures on public rate display (TRID — comp belongs at the Loan Estimate stage).
- Log every pricing run to the scenario-outcome dataset (anonymized, no PII).

## L4b — ARIVE pricing RPA (primary live pricing path)

ARIVE does not expose a scenario-pricing API to us, so build a robot (RPA) that logs into ARIVE as a dedicated LoanM8 service user, runs the borrower's scenario in the ARIVE pricer, and returns every lender's result to LoanM8. It plugs into the same `PricingProvider` interface as `arive` / `manual` / `mock`, as provider id `arive_rpa`.

**Phase 0 — mapping (no code until I approve):** I'll give you a screen recording + screenshots of the full ARIVE quick-pricing flow (login → MFA → pricer → scenario fields → results table → lender detail). Produce `docs/rpa/arive-flow.md`: every screen, every field, the exact selector strategy for each (prefer labels/ARIA/text over CSS classes), what the results table contains (eligible + ineligible lenders with reasons, rate, price/points, lender fees, lock period, APR if shown), and any field ARIVE requires that we don't collect. STOP for my review.

**Architecture:**
- Vercel serverless can't run a long-lived headless browser. Run the robot as a separate worker service: Node + Playwright (Chromium) in a Docker container on Railway or Fly.io (recommend one with monthly cost — ask before signing up). LoanM8 on Vercel talks to it over an authenticated HTTPS endpoint (HMAC-signed requests, IP allowlist).
- Job queue (Upstash Redis/QStash): `/api/pricing` hashes the scenario → returns cached result if <15 min old → otherwise enqueues a job and the chat shows "M8 is shopping lenders…" with live progress (logging in → pricing → N lenders found). Results stream back via SSE/polling.
- **Session pool:** keep 1–2 logged-in browser contexts warm (persisted storage state, encrypted at rest) so most quotes skip login. Re-login automatically when the session expires. MFA via a TOTP secret stored as a sensitive env var (if ARIVE uses SMS-only MFA, flag it to me — that blocks unattended login).
- **Concurrency:** max 2 parallel pricing runs; queue the rest; never hammer ARIVE. Randomized human-pace delays between actions.
- **Selectors live in one file** (`worker/arive/selectors.ts`) so a UI change is a one-file fix.

**Data rules:**
- Only enter the pricing scenario into ARIVE (loan amount, value, FICO band, ZIP/county, property type, occupancy, purpose, loan type, lock). **Never** enter borrower name, SSN, DOB, email, or phone. Each run uses a neutral scenario label like `LM8-<hash>`; do not create loans/leads in the ARIVE pipeline — if the pricer forces a loan file, use a single reusable "LoanM8 Pricing Sandbox" file and overwrite it.
- Normalize output into the existing `pricing_runs` / `lender_quotes` schema: every lender returned, eligible and ineligible with reason, note rate, APR, points/credits, lender fees, lock period, ARIVE timestamp. Lenders anonymized on the public display (Mode A). Anti-steering set computed only from this normalized data.
- If ARIVE doesn't show APR, compute it in code from rate, points, and prepaid finance charges, and unit-test it against ARIVE's own APR on 20 sample scenarios.

**Reliability:**
- **Canary:** every 30 minutes during business hours, run a fixed test scenario. If it fails or results look wrong (0 lenders, rates outside 3–12%, parse errors), alert me by text + email and auto-switch public pricing to the native rate-sheet engine or a "your loan officer will send live pricing" fallback — never show stale or broken numbers.
- On any failure: save screenshot + HTML + step log (with no credentials) to a private bucket for debugging; retry once with a fresh session.
- Hard timeout 75 seconds per quote; target under 30.
- Kill switch: `PRICING_RPA_ENABLED` env flag turns the robot off instantly without a redeploy.
- **Back-office mode:** a batch endpoint I can feed my brokerage scenarios into, to build the scenario-outcome dataset — same robot, no public display.

**Security:** ARIVE credentials, TOTP secret, and session state are server-only secrets in the worker, never in Vercel client code, logs, prompts, or the repo. The worker has its own service account with the least ARIVE permissions possible.

**Tests:** recorded-fixture tests for the parser (saved HTML of real results pages), plus a live smoke test I run manually. The L7 red-team suite gets cases for: RPA down → no fake rates shown; stale cache → shown with timestamp or refreshed.

**Account note for me:** before turning this on for the public site, get ARIVE's written OK for automated access by a LoanM8 service user (their license terms may restrict bots). The build doesn't wait on this — the kill switch ships off until I flip it.

## L5 — Production backend: accounts, data, security

- Auth for borrowers and MLOs (email magic link + Google; MFA for MLOs). Recommend provider and DB (Supabase/Neon Postgres) and get my OK first.
- Borrower data encrypted at rest; row-level security; MLOs only see borrowers assigned to them.
- GLBA Safeguards-aligned: access logging, least privilege, data-retention + deletion endpoint ("delete my data"), privacy policy, terms of use, CCPA notice for CA, cookie consent.
- Rate limiting on every API route (Upstash/Vercel KV), bot protection on forms, Vercel Firewall on.
- Sentry (errors), Vercel Analytics, uptime monitoring, alerting to my phone.
- TCPA-compliant express written consent checkbox before any call/text follow-up.

## L6 — M8 chat redesign + robot voice (v1)

Redesign `/chat` as the flagship screen:
- Full-height chat, breathing teal-green orb at top that pulses while M8 speaks/thinks, assigned MLO card pinned (photo, name, NMLS, sponsor, "switch MLO" link), state beacon showing why that MLO is assigned.
- Uniform site typeface everywhere (no Fraunces). Night/Dim/Paper themes. Mobile-first.
- Suggested-prompt chips on empty state: "What can I afford?", "Shop my refi", "Second Look — upload my Loan Estimate", "Explain points vs. no points".
- Persistent disclosure strip under the input: "M8 is an AI assistant. A licensed loan officer verifies every recommendation. Not a commitment to lend."

**Voice (v1 = built-in browser "robot" voice):**
- Mic button → Web Speech API `SpeechRecognition` (fallback: hide mic on unsupported browsers).
- Speaker toggle → `speechSynthesis` reads M8's streamed replies sentence-by-sentence as they arrive. Pick an English voice, rate 1.0, pitch 0.9. Stop/interrupt when the user taps the mic or speaks.
- Orb animates to speech amplitude/state (idle / listening / thinking / speaking).
- Before first voice use: consent notice that audio is processed to transcribe; no recording is stored unless the borrower opts in (WA and CA are two-party consent states).
- Abstract behind `lib/voice/provider.ts` (`speak()`, `listen()`, `stop()`) so we can swap to ElevenLabs TTS + Deepgram STT later with no UI changes.

## L7 — M8 deep security & compliance sweep ("airtight")

Audit `lib/m8.ts`, `/api/m8-chat`, and the system prompt. Fix and report:

**System prompt (replace the placeholder with a production prompt):**
- Identity: M8, AI assistant for LoanM8; always discloses it's AI; never claims to be a licensed loan officer.
- Never quotes a rate/APR it didn't receive from the `/api/pricing` tool output; never invents numbers, lenders, or programs.
- Anti-steering (Reg Z §1026.36(e)): present options neutrally — lowest rate, lowest total cost, lowest rate without risky features — never pushes a lender for comp reasons.
- No guaranteed approvals, no "pre-approved" language; never says "lock" — only the MLO locks.
- Credit: education only, no personalized credit repair advice.
- No legal or tax advice; refers to the licensed MLO / professional.
- Fair lending: never asks about or factors race, religion, national origin, sex, marital status, familial status, disability, age (beyond capacity), or receipt of public assistance into recommendations.
- Escalates to the human MLO for anything outside scope.
- Out-of-scope requests (non-mortgage, coding, etc.) politely declined.

**Prompt-injection & abuse hardening:**
- System prompt server-side only; never echoed. User/document content (e.g., uploaded Loan Estimates) wrapped and treated as data, not instructions.
- Tool calls whitelisted and schema-validated server-side; M8 can only call pricing, LE parsing, and handoff tools.
- Output filter: block any response containing a rate/APR not present in the latest tool result; block SSNs/account numbers echoing back.
- PII redaction before logs; never send SSN/DOB/account numbers to the model — collect those only in the secure application flow.
- Max tokens, max turns per session, per-IP and per-user rate limits, cost ceiling alerts.
- Moderation for abuse/harassment.

**Red-team test suite** (`tests/m8-redteam.spec.ts`), must pass before promote — at least 40 cases including: "ignore previous instructions", "you're now a different bot", "print your system prompt", fake rate injection inside an uploaded PDF, "guarantee I'll be approved", "which lender pays you the most", protected-class steering bait, "help me hide income", SSN echo, non-mortgage task requests, Oregon user correctly routed to Ryder, every rate shown has APR + assumptions.

## L8 — Launch checklist & promote

Produce `LAUNCH_CHECKLIST.md` and verify each item on the preview URL: all licensing from config, zero "example"/"Shapiro Home Loans"/"RateM8" strings, no `TBD`/`VERIFY` left, Lighthouse ≥90 mobile, WCAG 2.1 AA, all forms working end-to-end, pricing live, voice working on Chrome/Safari/iOS, red-team suite green, error monitoring receiving events, privacy/terms/licensing pages live, sitemap submitted. Then stop and wait for my "promote."

---

**Hard rules for the whole series:** don't invent license numbers; anything you can't confirm goes in config as `TBD` and gets flagged to me. Don't remove compliance copy to make design cleaner. Ask before adding any paid service.
