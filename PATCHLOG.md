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
