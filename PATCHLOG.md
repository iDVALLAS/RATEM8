# PATCHLOG — LoanM8 production launch

The running log for the launch series:
- C1–C5 (`LoanM8_Launch_Live_M8_Chat.md`) runs first.
- L1–L8 and L4b (`LoanM8_Production_Launch_Prompt.md`) follow.

Each patch: plan, files, change, `npm run verify`, a Vercel preview, then
a stop for the owner's sign-off. Production only on the owner's "promote".

History before this series (v1–v30) is in `LoanM8_Project_Handoff_README.md`.

## C0 — Audit (2026-10-31)

- **Files:**
  - `LoanM8_Launch_Live_M8_Chat.md` and `LoanM8_Production_Launch_Prompt.md`
    (the owner's briefs, verbatim)
  - `docs/launch/audit-2026-10-31.md`
  - `PATCHLOG.md`
- **No code changes.**
- **Owner statement (2026-10-31):** counsel has approved everything. That
  means the drafts that were waiting on counsel review, including the M8
  prompt, the legal pages and the Second Look prompt. C3 replaces the M8
  prompt with the brief's production prompt anyway.
- **Findings:** see the audit. In short:
  - Licensing facts are already only in `lib/config.ts`.
  - The brief changes the sponsor naming and the AZ license number.
  - `ANTHROPIC_API_KEY` isn't set for Preview.
  - `sml.texas.gov` is unreachable from this environment.
  - C4 needs three services the owner must approve.
- **Next:** C1, after the owner signs off.

## C1 — Live chat only (2026-11-01)

**Owner:** "other than what i mentioned run c1". The owner supplied the
headshot and confirmed LoanM8, LLC replaces Shapiro Home Loans (that's C2).

### Changes
- **`/chat` is the live M8 chat only.**
  - `app/chat/page.tsx` renders `M8LiveChat` inside `PageShell`, so the
    nav and the licensing footer are on the page.
  - `?prep=1` still opens the prep flow, without the old "DEMO" label.
- **Scripted demo deleted:**
  - `components/ChatExperience.tsx`, `components/ChatExperienceWithToggle.tsx`
    and `components/ChatInput.tsx`
  - `lib/demoChat.ts` and `lib/demo-chat.test.ts`
  - `CONFIG.demo`, including the unverified bio "17 years originating ·
    Avg close: 18 days", which no longer renders anywhere
  - the demo tab strings and `copy.demoChat`
- **Gates:**
  - `middleware.ts` makes `/chat` and `/team/*` public in stealth. Every
    other page stays gated.
  - `/api/m8-chat` no longer needs the tester cookie.
    `featureFlags.demoLiveChat` became `featureFlags.liveChat`: on unless
    `M8_LIVE_CHAT` is `"false"` (the kill switch).
  - The route no longer appends example pricing to the system prompt, and
    no longer logs the IP. It logs counts only.
- **`/demo`** is just the tester password page; once unlocked it goes to
  `/`. The coming-soon homepage's main button is now "Chat with M8" →
  `/chat`, and its header link is "Tester access →".
- **`components/chat/MloChatCard.tsx`** (new), pinned at the top of the chat:
  - The matched MLO's photo, name, NMLS number and the sponsor of their
    license in the routed state.
  - "Talk to {first}" opens the booking link and a question form
    (`/api/chat-question`, which refuses SSN/DOB/account numbers).
  - Generic copy when no MLO is nameable.
- **`components/mlo/MloAvatar.tsx`** (new): `next/image`, round, with
  alt "Name, NMLS #…" from config. Without a `/team/` file it draws
  initials in M8 Green.
- **Headshot:** `public/team/jason-shapiro.webp`, the owner's photo
  re-encoded at 512×512 with transparent corners. Set as
  `principalMlo.photo`; Ryder keeps the initials avatar.
- **Chat UI (`M8LiveChat`):**
  - No "Preview build" banner.
  - The opening line no longer says "preview build".
  - The owner's five chips show in the empty state.
  - The owner's strip sits under the input.
  - "Start over" is beside the strip.
  - Errors show the route's message, never raw JSON.
- **Privacy page (`lib/content/legal.ts`):** "Chat and voice" now says chat
  is live, messages go to the AI provider, and transcripts aren't stored
  server-side yet. This is an accuracy fix to counsel-approved text, so
  the owner may want counsel to see it.

### Verified
- `npm run verify` passes: lint, copy, identity, 130 tests (was 135; the
  deleted demo tests went with the demo), build and bundle.
- **Browser, local production build, stealth on, anonymous visitor:**
  - `/chat` returns 200 at 1280 and 390 with no horizontal scroll.
  - WA (default): the card shows the owner's photo, name, NMLS and sponsor.
  - Oregon visitor: "RF" initials, Ryder's name and NMLS, "Talk to Ryder".
  - 5 chips, and the strip is visible on the first screen.
  - Sending a chip without an API key shows "M8 is temporarily unavailable.
    Email …" (fails closed).
  - `/rates` still redirects to the coming-soon page. The coming-soon page
    links to `/chat`.
- `qa/fonts`: one finding, fixed (the M8 avatar's synthesized bold).
- `qa/overflow`: clean.

### Known issues
- The live chat needs `ANTHROPIC_API_KEY` in **Preview** to answer on the
  preview link. It's set only in Production today.
- `[EMAIL]` shows wherever the contact email is used; it needs
  `NEXT_PUBLIC_CONTACT_EMAIL`.
- Sponsor names still come from the old registry ("Home Trust Loans"). C2
  replaces them with Adcom Group Inc dba Home Trust Financial.
- **No rate limits yet (C4).** Don't promote C1 to production on its own.
- Local only: in stealth, the Vercel Analytics script path redirects to
  HTML ("Unexpected token '<'"). This predates C1; Vercel serves that path
  itself.

### Next
- C2: `config/licensing.ts`, the licensing footer, `/licensing` and
  `/licensing/texas` (the owner supplied the 7 TAC §56.200(c) notice
  PDF), the Equal Housing logo, and LoanM8, LLC.

## C2 — Licensing footer, /licensing, the Texas notice (2026-11-01)

**Owner:** "go C2". The owner confirmed LoanM8, LLC replaces Shapiro Home
Loans, and supplied the current SML complaint notice for mortgage companies
(PDF, 7 TAC §56.200(c)).

### Changes
- **`config/licensing.ts` (new), exactly as the brief's L1 block:**
  - `PLATFORM`, `SPONSOR` (with every state license), `MLOS`, `STATE_MLO`.
  - Additions: `DEFAULT_MLO`, `SPONSOR_DISPLAY_NAME`, and
    `TX_COMPLAINT_NOTICE` (the PDF's text, verbatim).
- **`lib/config.ts` now derives from it:**
  - The platform is LoanM8, LLC. `entityNmls` is removed: LoanM8, LLC holds
    no license.
  - One sponsor record replaces "Home Trust Loans" and "Home Financial (AZ
    1037722)". The AZ number is now the brief's 1003167.
  - MLO names, NMLS numbers and photos come from `MLOS`.
  - MLO licenses: CA-DFPI 1844143 in California, the NMLS ID elsewhere.
  - `stateAssignments` comes from `STATE_MLO` (Oregon → Ryder, the rest →
    the default MLO).
  - State entity licenses and regulator names come from `SPONSOR.stateLicenses`.
  - CA and TX required disclosures are filled. The coming-soon sponsor line
    also comes from here.
- **Footer (every page):** the owner's four paragraphs, word for word, from
  `lib/content/licensing.ts`:
  1. The trade-name line. The matched-MLO line that used to follow it is
     deleted.
  2. The originating company with the NMLS Consumer Access link, and every
     state license.
  3. The loan officers.
  4. Equal Housing Opportunity and not-a-commitment.

  Also:
  - Links to Licensing, Texas Consumer Complaint Notice and Full
    disclosures. The AI note stays.
  - The per-state "entity license / MLO license / regulator" lines (which
    showed placeholders) are gone; paragraph 2 replaces them.
  - The Equal Housing Opportunity logo (`components/legal/EqualHousingLogo.tsx`,
    house with the equal sign) replaces the "Equal Housing Lender" icon.
    "Lender" becomes "Opportunity" in the footer and on `/disclosures`.
  - © LoanM8, LLC.
- **`/licensing` (new):** the originating company (NMLS with the lookup
  link, address, phone), every state license with its regulator, the loan
  officers with NMLS, states and lookup links, and the state notices.
- **`/licensing/texas` (new):** the complaint notice verbatim, with its
  citation and the SML link.
- Both licensing pages are public in stealth (middleware) and listed in
  the sitemap and llms.txt (`lib/site.ts`).
- **Every place that used the entity NMLS now points at the sponsor:**
  `/disclosures`, the state pages' license block, `/ai`, and the JSON-LD
  (the sponsor as `parentOrganization` with its NMLS).
- **Chat card:** "Adcom Group Inc dba Home Trust Financial · NMLS #1761573".
- **`npm run check:licensing` (new):**
  - Runs in `npm run verify` and inside every `next build` (`next.config.ts`).
  - Fails while `config/licensing.ts` has TBD, VERIFY or XXXX.
  - Proven: putting TBD in the AZ number failed `next build` with the line
    named.
- `check:identity` and `check:copy` now scan `config/`, and identity allows
  `config/licensing.ts`.
- **Tests:** `lib/licensing-config.test.ts` (11 new) checks:
  - The footer text matches the owner's.
  - Every license is under the one sponsor.
  - Oregon routing goes to Ryder.
  - State records carry the sponsor's licenses.
  - The headshot exists.
  - The marker check works.

  The routing tests now expect the new sponsor name.

### Verified
- `npm run verify` passes: lint, copy, identity, licensing, 141 tests,
  build and bundle.
- **Browser (production build, stealth on, anonymous visitor):**
  - `/`, `/chat`, `/licensing`, `/licensing/texas` and `/disclosures` each
    return 200 at 1280 and 390, with one h1 and no horizontal scroll.
  - The footer's text matches the brief exactly.
  - The EHO logo carries its label.
- `qa/fonts`: 0 findings. `qa/overflow`: clean.

### Known issues and owner items
- **Arizona MLO license:** shown as the NMLS ID. Arizona issues its own
  loan originator number; send it to add it.
- Still placeholders:
  - Regulator URLs (5 states; regulator names show without links)
  - WA, OR and AZ required disclosures
  - Sponsorship effective dates (not rendered anywhere)
- `ryder-fasse.webp` is listed per the brief but not supplied. The avatar
  falls back to initials if the file doesn't load.
- The footer lists both loan officers for every visitor (the brief's C2
  text). L2's per-state version comes later.

### Next
C3: the production M8 system prompt.

## C3 — Production M8 system prompt (2026-11-02)

**Owner:** "go C3".

### Changes
- **`lib/prompts/m8-system.ts`** is rewritten around `M8_SYSTEM_PROMPT`:
  the brief's prompt, word for word. A test reads the brief file and
  compares them. The old draft prompt, its DRAFT markers, the
  roster/section machinery and the prep-fields section are gone.
  - The brief said `lib/m8.ts`. The prompt stays in `lib/prompts/`
    because `lib/m8.ts` is imported by the chat UI (a browser bundle), and
    the brief requires the prompt to be server-only.
- **`m8PromptVars(route)`** fills the six values per request:
  - `{{MLO_NAME}}` / `{{MLO_NMLS}}`: the matched loan officer, named only
    under the existing naming rule (Oregon → Ryder, everyone else → the
    default MLO). Values come from `config/licensing.ts` via `lib/config.ts`.
  - `{{SPONSOR}}` / `{{SPONSOR_NMLS}}`: Adcom Group Inc dba Home Trust
    Financial, 1761573.
  - `{{STATE}}`: the routed state. The two special cases carry their
    facts inside this value:
    - Washington by default: "location couldn't be detected… ask where the
      property is".
    - A property in another state from the connection: "licensing follows
      the property".
  - `{{PRICING_STATUS}}`: "unavailable… don't quote any rate, APR, points,
    or rate-based payment" while `liveRatesEnabled` is false. Once the
    pricing tool exists it says rates come through `get_pricing`.
  - **Not in the brief:** with no nameable loan officer, the "licensed loan
    officer is {{MLO_NAME}}, NMLS #{{MLO_NMLS}}" sentence is replaced:
    - Unlicensed state: "There is no licensed loan officer for Nevada yet…
      don't offer to hand off".
    - Routing off: "will be matched with a licensed loan officer".

    Otherwise the prompt would read "NMLS #" with no number.
  - `buildM8SystemPrompt()` throws if any `{{TOKEN}}` is left unfilled.
- **`app/api/m8-chat/route.ts`** decodes the visitor's route header and
  sends the filled prompt. Nothing else is appended.
- **`lib/m8.ts`** no longer imports the prompt (it did before, through
  `getM8SystemPrompt`, which nothing used).
- **`check:bundle`** now also fails if the prompt's text appears in any
  browser file.

### Verified
- `npm run verify` passes: lint, copy, identity, licensing, 147 tests,
  build, and bundle (no prompt text in browser files).
- **New tests** (`lib/prompts/m8-system.test.ts`; routing and prep tests
  updated):
  - The prompt is the brief's, word for word.
  - All six values are filled for an Oregon visitor.
  - Pricing is unavailable, so M8 quotes nothing.
  - No one is named when routing is off or the state is unlicensed.
  - The owner's hard rules are present.
  - The default-state and mover cases.
  - `lib/m8.ts` doesn't import the prompt.
- **Route smoke test** (local production build, dummy key, Oregon visitor):
  the prompt built and the request reached the AI API, which rejected the
  dummy key (401). The borrower saw "M8 hit a snag mid-response. Try
  again." Nothing broke before the model call.

### Known issues
- No real model run yet: that needs `ANTHROPIC_API_KEY` in Preview. Once
  it's set, try the red-team questions on the preview (C4 automates 40+).
- There is no `get_pricing` tool until C4, and the prompt already treats
  pricing as unavailable.
- The model name and max tokens are still constants in `lib/m8.ts`. C4
  moves the model to an env var and sets max output to 800, per the brief.
- The Second Look prompt (`lib/prompts/second-look.ts`) is unchanged and
  still marked DRAFT. It's out of C3's scope.

### Next
C4: hardening. The tools (`get_pricing` as "unavailable", `request_handoff`),
the output guard, PII redaction, rate limits, the turn cap, moderation,
transcript storage, the privacy line, and the red-team suite.

## C4 — Hardening (2026-11-02)

**Owner:** "go C4 with Neon and build as switches that turn on with Vercel
key".

### Switches (each a no-op until its key is set in Vercel)
| Service | Env | On | Off |
| --- | --- | --- | --- |
| Upstash Redis | `UPSTASH_REDIS_REST_URL` + `_TOKEN` (or Vercel's `KV_REST_API_URL` / `_TOKEN`) | Limits, the turn cap and the daily budget count across every server | Each server instance counts in its own memory (weaker, but on) |
| Neon Postgres | `DATABASE_URL` (Vercel's Neon integration sets it) | Redacted transcripts and handoff requests stored, kept 3 years. The chat and `/privacy` say so, and "Delete my chat" deletes them | Nothing stored; the chat and `/privacy` say chats stay in the browser |
| Resend | `RESEND_API_KEY`, `MLO_NOTIFICATION_EMAIL`, `LOANM8_FROM_EMAIL` (alerts: `M8_ALERT_EMAIL`) | Handoffs are emailed to the loan officer; budget alerts are emailed | Handoffs say "use the Talk to button"; alerts go to the log only |
| Overrides | `M8_MODEL`, `M8_MAX_TURNS` (40), `M8_DAILY_TOKEN_CAP` (2,000,000), `M8_IP_SALT` | | Defaults |

One new dependency, `@neondatabase/serverless@^1.2.0`. Upstash and Resend
use plain `fetch`.

### What a turn now goes through
1. **Kill switch and API key** (both fail closed).
2. **Body checks:** 1–100 messages of 1–4000 characters each, ending
   with the borrower.
3. **Bot check on the first message:** a hidden honeypot field, and the
   first send must come at least 0.8s after the page loads.
4. **Limits** (`lib/m8/limits.ts`):
   - 20 requests per minute and 300 per day per IP. The IP is salted and
     hashed and never stored raw.
   - 12 per minute per chat session.
   - 40 turns per session. The client's own message count is a floor, so
     a cold counter can't reset a long chat.
   - The daily token budget: alert emails at 80% and 100%, once each per
     day, and a polite pause when it's used up.
5. **Redaction** (`lib/m8/redact.ts`):
   - SSNs, birth dates (a date near a birth word, or a year from 1920 to
     2010) and 8–19-digit account or card numbers become `•••••` before
     the model or any log sees them.
   - The borrower sees their message masked, plus a note.
   - Dollar amounts, ZIPs, percentages and future dates are untouched.
6. **Moderation** (`lib/m8/moderation.ts`): threats, abuse and sexual
   harassment get a polite reply with no model call. Frustration is never
   blocked.
7. **The model** (`lib/m8/pipeline.ts`):
   - The model comes from `M8_MODEL` (with the previous default) and
     output is capped at 800 tokens. Streaming is kept.
   - Only `get_pricing` and `request_handoff` are offered
     (`lib/m8/tools.ts`). Inputs and outputs are validated with zod, and
     unknown tools are refused.
   - `get_pricing` returns `{status:"unavailable"}` until L4b.
   - `request_handoff` saves to Neon and emails the loan officer. Its
     summary is redacted, and it says honestly when neither is set up.
   - Up to 3 tool rounds.
8. **Output guard** (`lib/m8/guard.ts`), on every slice of the stream and
   again at the end. A failure stops the stream and replaces the whole
   reply with a safe line. The log gets the reason only. It catches:
   - a rate or APR that isn't in the latest `get_pricing` result
   - a priced rate without its APR and "not a commitment to lend"
   - text from the system prompt
   - promises of approval, pre-approval, a lock or a closing date
   - an echoed SSN or account number

   **Allowed by design (owner may veto):** percentages the borrower typed
   themselves ("I'm at 7.25%") can be repeated back, because they aren't
   quotes. Down payment, LTV, DTI, PMI and similar percentages are told
   apart from rates by the words around them.
9. **After the response** (Next.js `after`): today's token use is added,
   and the redacted transcript is saved when Neon is on.

### Borrower-facing
- **Above the input:** the AI and recording line, plus one privacy
  sentence and a "Privacy policy" link.
  - Neon on: "kept for 3 years, with sensitive numbers removed", and in WA
    or CA, the two-party consent sentence.
  - Neon off: "Chats stay in this browser".
- **"Delete my chat"** beside "Start over": it deletes the server copy (if
  any), clears the browser copy and expires the session cookie.
- **`/privacy`:** the "Chat and voice" item and the retention table now
  describe redaction, 3-year retention (or no storage), deletion and the
  chat session cookie (first-party, httpOnly, 30 days, not for tracking).
  `copy.chat.gate.recording` now says 3 years.

### Red team (`tests/m8-redteam.spec.ts`, 47 offline cases; must pass before promote)
- **The offline layer drives the real pipeline with a fake model that
  misbehaves on purpose** (`tests/m8-harness.ts`). For example:
  - Ignore-instructions and role switch: the fake model invents a rate,
    and the guard replaces it.
  - Print or repeat or translate the prompt: the fake model leaks it, and
    the guard replaces it.
  - Injection inside a pasted Loan Estimate.
  - "Ballpark today's rate", national average, APR from memory.
  - Guarantee, pre-approved, lock, closing-date promises.
- **Where the prompt is the only defence**, the case asserts the owner's
  rule is in it:
  - lender comp and commission
  - protected-class bait (marital/familial status, race, age, public
    assistance, religion)
  - fraud ("hide income", "say I'll live there", inflate income)
  - off-topic code and recipes, credit repair, legal and tax advice
- **Other cases:**
  - SSN, DOB and account numbers are redacted, and echoes are caught.
  - Abuse and threats are blocked; frustration passes.
  - An Oregon visitor names the Oregon loan officer.
  - Pricing unavailable produces the handoff line and no numbers.
  - Every priced rate carries its APR and disclosure.
  - The borrower's own numbers, LTV and down payment aren't treated as
    rates.
  - Only two tools exist, and bad tool input is refused.
  - A handoff summary never carries an SSN.
  - The 40-turn cap.
  - A Nevada visitor sees no loan officer named.
- **The live layer** runs the same attacks against the real model through
  the same pipeline:
  `M8_REDTEAM_LIVE=1 ANTHROPIC_API_KEY=… npx vitest run tests/m8-redteam.spec.ts`.
  It checks no leak, the guard passes, and each case's must-not and must
  patterns. **It hasn't run yet: there's no key in this environment.**

### Other files
- `lib/m8.ts` became `lib/m8/shared.ts` (types and the SSE event shape
  only; the chat UI imports it).
- `lib/m8/server.ts` holds the switches.
- `app/chat/page.tsx` passes whether storage is on.
- `.env.local.example` documents every switch.
- `vitest.config.mts` now includes `tests/**/*.spec.ts`.

### Verified
- `npm run verify` passes: lint, copy, identity, licensing, 205 tests
  (37 live red-team cases skipped without a key), build and bundle.
- **Route, local production build** (dummy key):
  - No timing or a filled honeypot → "Please try again."
  - Abuse → the polite reply with no model call, and the session cookie is
    set.
  - "my ssn is 123-45-6789" → the masked message comes back with the
    notice. The SSN never appears in the server log.
  - The 21st request in a minute from one IP → 429.
  - The 41st turn → the turn-limit message.
  - DELETE → 200 and the cookie cleared.
- **Browser, 1280 and 390:**
  - The privacy line and link show.
  - The SSN shows masked, with the notice.
  - Abuse gets the polite reply.
  - "Delete my chat" clears the thread and says so.
  - No horizontal scroll.

### Known issues and owner items
- **To turn things on:**
  - add `ANTHROPIC_API_KEY` to Preview
  - connect Neon (Vercel → Storage → Neon) and Upstash (Vercel →
    Marketplace) to the `ratem-8` project
  - set the Resend variables
  - set a spend limit in the Anthropic Console
- **Then run the live red-team layer against the preview key before
  promote.**
- **Bot protection is basic** (honeypot and timing). Vercel's Firewall
  bot rules or BotID are the stronger option, which C5 can add.
- **Phone numbers with separators are masked as account numbers in the
  borrower's message** (over-masking, by design). The handoff tool takes
  email only.
- Transcripts are purged as new ones arrive (about 1 in 50 writes), not
  on a schedule. That's fine at launch volume. A Vercel Cron purge can
  come later.

### Next
C5: launch. Robots and sitemap for `/`, `/chat`, `/licensing`, `/privacy`
and `/terms`; Lighthouse ≥90 on `/chat`; device checks; Sentry and uptime
monitoring on `/api/m8-chat`; and `CHAT_LAUNCH_CHECKLIST.md`.

## C5 — Launch prep for the live chat (2026-11-03)

**Owner:** "go C5". It stops here for "promote".

### Changes
- **One public-pages list** (`lib/public-paths.ts`): `middleware.ts`,
  `app/robots.ts` and `app/sitemap.ts` all use it, so they can't disagree.
  - In stealth, robots allows `/`, `/chat`, `/licensing`,
    `/licensing/texas`, `/disclosures`, `/privacy`, `/terms`, `/ai`,
    `/states/`, `/llms.txt` and `/team/`, and disallows the rest.
  - The sitemap lists only reachable pages; when live, it lists
    everything.
  - `/chat` is indexable, with a canonical URL.
- **`/api/health`** (new), the uptime target:
  - 200 when the chat is on and has its key, 503 otherwise.
  - `?deep=1` with `HEALTH_CHECK_TOKEN` also looks the model up (no
    tokens used) and lists which switches are on, as true/false only.
- **Sentry** (`lib/monitoring.ts`), on with `SENTRY_DSN`:
  - Sends events to Sentry's envelope endpoint with `fetch`. No SDK and
    no new dependency.
  - Reports chat model errors, guard replacements (as warnings, with the
    reason), storage failures and budget alerts.
  - Messages are scrubbed of URLs (connection strings), emails, keys and
    long numbers. Never chat text.
  - 2-second timeout; it never throws.
- **Lighthouse fixes:**
  - Metadata goes in `<head>` for every visitor (`htmlLimitedBots`), so
    the meta description audit passes on dynamic pages.
  - The closed mobile menu is `inert`.
  - Links in the footer's licensing text are underlined.
- **iOS:** phone inputs are 16px, so Safari doesn't zoom on focus (the
  chat input and the "Talk to" form).
- **Page titles** no longer double the "— LoanM8" suffix.
- **`CHAT_LAUNCH_CHECKLIST.md`** (new): what ships, preview checks,
  owner actions before promote, promote steps and known limits.
- **`.env.local.example`:** `SENTRY_DSN` and `HEALTH_CHECK_TOKEN`.
- **Tests:** `lib/launch.test.ts` (10 new): DSN parsing, the no-op without
  a DSN, the envelope, scrubbing, the public-pages list, robots and the
  sitemap in both modes, and the health responses.

### Verified
- `npm run verify` passes (215 tests; 37 live red-team cases skipped
  without a key).
- **Lighthouse, mobile, local production build (warm):**

  | Page | Performance | Accessibility | Best practices | SEO |
  | --- | --- | --- | --- | --- |
  | `/chat` | 97 | 100 | 96 | 100 |
  | `/licensing` | 98 | 100 | 96 | 100 |
  | `/privacy` | 94 | 100 | 96 | 100 |

  - Best practices is 96 only because of a local-only console error: the
    stealth redirect of the analytics script, which Vercel serves itself.
  - The first cold run of `/chat` scored 55 (2s of simulated blocking
    time). It didn't reproduce warm, or with real CPU throttling (99).
- **Emulated devices** (iPhone 13, iPhone SE, Pixel 7, Galaxy S9+,
  desktop): no horizontal scroll, the input and strip are on the first
  screen, a chip sends, and no page errors. Real Safari can't run here;
  that's an owner check.
- **Preview** (via Vercel): see the checklist's section 2. `/chat`,
  robots, sitemap, gating and `/api/health` all checked. Health is 503
  until the preview has its key, which is correct.

### Owner items before promote
`CHAT_LAUNCH_CHECKLIST.md` section 3:
- the API key in Preview
- **the live red-team run**
- real iPhone and Android checks
- Upstash, Neon, Resend, Sentry, the health token and an uptime monitor
- the Anthropic spend limit
- the contact email

### Next
Stop for **"promote"**. After that comes the L series
(`LoanM8_Production_Launch_Prompt.md`): L1 and L2 are largely done by C2;
L4b needs the LoanSifter screenshots.
