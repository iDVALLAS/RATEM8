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
