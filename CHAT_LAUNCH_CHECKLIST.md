# CHAT_LAUNCH_CHECKLIST — live M8 chat (C1–C5)

The checklist the launch brief (`LoanM8_Launch_Live_M8_Chat.md`, C5) asks
for. Nothing goes to production until the owner says **"promote"**.

**Legend:**
- ✅ done and verified
- 👤 needs the owner (a Vercel setting, an account, a real device)
- ⏳ waiting on something else

**Preview checked:** `ratem-8-3ofl6vlua-jason-s-projects-1f863c25.vercel.app` (C5 commit `fd18944`, 2026-11-03), through Vercel. The branch's latest preview is always at `ratem-8-git-claude-quirky-feyn-c30aa8-jason-s-projects-1f863c25.vercel.app`.

## 1. What ships (code: C1–C5)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `/chat` is the live M8 chat only (no scripted demo, no tabs); public even in stealth | ✅ | C1; preview check below |
| 2 | Loan officer card pinned at the top: photo, name, NMLS, sponsor, "Talk to …"; Oregon shows the Oregon loan officer | ✅ | C1/C2; browser checks; red-team R40 |
| 3 | Five prompt chips, the AI strip under the input, the AI and recording line, and the privacy line with link | ✅ | C1/C4 |
| 4 | Licensing footer on every page (the owner's four paragraphs, word for word), Equal Housing Opportunity logo, `/licensing`, `/licensing/texas` (7 TAC §56.200(c)) | ✅ | C2; `lib/licensing-config.test.ts` |
| 5 | LoanM8, LLC replaces Shapiro Home Loans everywhere | ✅ | C2; test "Shapiro Home Loans is gone" |
| 6 | Licensing facts only in `config/licensing.ts`; `next build` fails on TBD, VERIFY or XXXX | ✅ | C2; proven by a failing build |
| 7 | Production M8 prompt, word for word from the brief; server-only; values filled per visitor | ✅ | C3; `lib/prompts/m8-system.test.ts`; `check:bundle` |
| 8 | Only `get_pricing` (unavailable) and `request_handoff`, validated server-side | ✅ | C4; red-team R41, R44, R45 |
| 9 | Output guard: no unquoted rates; priced rates need APR and the disclosure; no prompt leaks, promises or echoed numbers | ✅ | C4; red-team R01–R16, R28, R30, R42, R43 |
| 10 | SSN, DOB and account numbers redacted before the model and logs; the borrower gets a note | ✅ | C4; red-team R28–R30; server log checked |
| 11 | Abuse blocked with no model call | ✅ | C4; red-team R37–R39 |
| 12 | Limits: 20/min and 300/day per IP, 12/min per session, 40 turns, daily token budget with alerts | ✅ | C4; red-team R46; route test (21st request → 429) |
| 13 | Bot check on the first message (honeypot and timing) | ✅ | C4; route test |
| 14 | Transcripts (redacted) kept 3 years when Neon is on; "Delete my chat" | ✅ code / 👤 Neon | C4; `lib/m8/store.ts` |
| 15 | Model from `M8_MODEL`, 800 output tokens, streaming | ✅ | C4; `lib/m8/m8.test.ts` |
| 16 | Robots and sitemap allow `/`, `/chat`, `/licensing`, `/privacy`, `/terms` (plus `/licensing/texas`, `/disclosures`, `/ai`, `/states/*`); gated pages stay out | ✅ | C5; `lib/launch.test.ts`; preview check below |
| 17 | Lighthouse mobile ≥ 90 on `/chat` | ✅ | Local production build, mobile: **performance 97, accessibility 100, best practices 96, SEO 100** |
| 18 | Error monitoring on `/api/m8-chat` (Sentry, on with `SENTRY_DSN`) | ✅ code / 👤 DSN | C5; `lib/monitoring.ts` |
| 19 | Uptime target `/api/health` (503 when the chat can't answer); `?deep=1` with a token checks the key and model | ✅ code / 👤 monitor | C5; preview check below |
| 20 | Red-team suite: 47 offline cases green | ✅ | `npm run verify`: 215 tests pass |

## 2. Preview checks

| Check | Result |
| --- | --- |
| `/chat`, anonymous visitor, stealth on | ✅ 200. Loan officer card, the five chips, the AI strip and the privacy line all render. The licensing footer reads word for word ("LoanM8 Loan Intelligence is a trade name of LoanM8, LLC.", "Mortgage loans are originated by Adcom Group Inc dba Home Trust Financial…"). It links the Texas notice and labels the Equal Housing Opportunity logo. No scripted demo and no prompt text in the page. |
| `/chat` head | ✅ The meta description is in `<head>`, the canonical is `https://loanm8.com/chat`, and there's no `noindex` meta. The page title was doubled ("M8 Chat — LoanM8 — LoanM8"), fixed in this patch for `/chat`, `/licensing`, `/licensing/texas`, `/tools`, `/demo` and `/second-look`. |
| `/robots.txt` | ✅ Allows `/`, `/chat`, `/licensing`, `/licensing/texas`, `/disclosures`, `/privacy`, `/terms`, `/ai`, `/states/`, `/llms.txt` and `/team/`; disallows everything else; points to the sitemap. |
| `/sitemap.xml` | ✅ Lists exactly the reachable pages: `/`, `/chat`, `/ai`, `/disclosures`, `/licensing`, `/licensing/texas`, `/privacy`, `/terms` and the five state pages. |
| A gated page (`/rates`) | ✅ Shows the coming-soon page. No example rates are reachable. |
| `/api/health` | ✅ Behaves correctly: **503 `{"ok":false,"chat":"no-key"}`**, because the preview has no `ANTHROPIC_API_KEY` yet (owner item A). It becomes 200 once the key is added. |
| Note | Vercel adds `x-robots-tag: noindex` to every preview deployment. Production doesn't, so the robots policy above is what search engines will see on loanm8.com. |

## 3. Before "promote" (owner)

| # | Action | Where | Status |
| --- | --- | --- | --- |
| A | Add `ANTHROPIC_API_KEY` to **Preview** (it's in Production only), then redeploy the preview | Vercel → ratem-8 → Environments → Preview → Environment Variables | ✅ `/api/health` 200 on the `492cf3f` preview (2026-11-03) |
| B | **Run the live red team against the deployed preview** (`tests/m8-redteam-remote.spec.ts`). The key stays in Vercel: the attacks go through the preview's own chat. Needs A done and the environment's Allowed domains to include `vercel.app` (done 2026-11-03). In a new session: "run the remote red team against the latest preview" (it gets a share link from the Vercel connection and runs `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt M8_REDTEAM_SHARE_URL=… npx vitest run tests/m8-redteam-remote.spec.ts`) | Session | ✅ 2026-11-03: 40/40 passed against the `492cf3f` preview; the guard replaced 1 reply (R13). See PATCHLOG C5.2 |
| C | Talk to M8 on the preview from a real **iPhone (Safari)**, a real **Android phone (Chrome)** and a desktop: send a chip, type a question, tap "Talk to …", "Delete my chat" | Your phones | 👤 |
| D | Connect **Upstash Redis** to `ratem-8` (Production and Preview) | Vercel → Marketplace → Upstash | 👤 |
| E | Connect **Neon** to `ratem-8` (sets `DATABASE_URL`). C7: it also stores the daily pricing snapshots, so `/mlo/pricing` can publish on Vercel | Vercel → Storage → Neon | 👤 (not connected, 2026-11-05) |
| E2 | C7, to show daily pricing examples: set `PRICING_MANUAL=true` (Preview first), `MLO_ADMIN_USER` and `MLO_ADMIN_PASSWORD`; then each morning price the four daily scenarios in ARIVE and enter them at `/mlo/pricing` with the screenshot. Snapshots older than 24 hours are never shown | Vercel env, then `/mlo/setup` and `/mlo/pricing` | 👤 |
| F | Set **Resend**: `RESEND_API_KEY`, `MLO_NOTIFICATION_EMAIL`, `LOANM8_FROM_EMAIL` (and `M8_ALERT_EMAIL` if alerts should go elsewhere) | Vercel env | 👤 |
| G | Create a free **Sentry** project and set `SENTRY_DSN` | sentry.io → Project → Client Keys | 👤 |
| H | Set `HEALTH_CHECK_TOKEN` (any long random string) | Vercel env | 👤 |
| I | Create an **uptime monitor** on `https://loanm8.com/api/health` (every 1–5 minutes, alert by text to your phone). Better Stack and UptimeRobot both have free plans | Monitor's site | 👤 |
| J | Set a **monthly spend limit** on the Anthropic key | Anthropic Console → Limits | 👤 |
| K | Set `NEXT_PUBLIC_CONTACT_EMAIL` (otherwise "[EMAIL]" shows in chat errors) | Vercel env | 👤 |
| L | Production keeps `MLO_ROUTING=true` | Vercel env | 👤 (set 2026-10-15; confirm) |

## 4. Promote (owner says "promote")

1. Merge the branch into `main` through a pull request. Production builds
   from `main`.
2. In Production, confirm A–L above, then redeploy.
3. **Keep `NEXT_PUBLIC_STEALTH_MODE` on for a chat-first launch.**
   - `/chat`, the licensing pages and the legal pages are public, and
     indexable per item 16.
   - The homepage stays the coming-soon page, which has a "Chat with M8"
     button.
   - Opening the full site is part of the L series.
4. **After deploy:**
   - `/api/health` returns 200, and `/api/health?deep=1&token=…` shows
     `model: "ok"`.
   - Send one chat from a phone.
   - Check that Sentry receives events (trigger one with a bad model
     name on a preview, not production).
5. **Submit `https://loanm8.com/sitemap.xml`** in Google Search Console
   and Bing Webmaster Tools.

## 5. Known limits at launch
- **No live pricing.** M8 explains, organizes the scenario and hands off;
  `get_pricing` answers "unavailable" until the pricing robot (L4b).
- **Bot protection is basic** (honeypot and timing). Vercel's Firewall bot
  rules or BotID are the upgrade.
- **Over-masking:** phone numbers with separators are masked in the
  borrower's message.
- **Retention purge** runs as new chats arrive, not on a schedule.
- **Real Safari** couldn't be tested here (Chromium only). The iOS input
  zoom was fixed by setting phone inputs to 16px. Owner check C covers the
  rest.
