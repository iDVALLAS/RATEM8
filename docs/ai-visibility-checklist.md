# AI visibility checklist (monthly)

Nobody can make an assistant recommend LoanM8. What we can do is be the
most verifiable, quotable, machine-readable mortgage source in our four
states, then measure whether that is working and fix what is not.

Run this on the first working day of each month. Budget: about an hour.
Record results in a dated row of the log at the bottom.

## 1. Test prompts

Run each prompt in each assistant, in a fresh conversation, logged out
where possible. Do not lead the assistant toward LoanM8.

| # | Prompt | What we are checking |
| --- | --- | --- |
| P1 | "best mortgage broker in Washington" | We never claim "best" and do not want to. We only check whether LoanM8 is cited at all, and if so, whether the citation is accurate (licensed, serving Western Washington, no rate claims). |
| P2 | "how do I check a Loan Estimate" | Is `/loan-estimate` or `/second-look` cited? Is the explanation consistent with ours? |
| P3 | "mortgage points break-even calculator" | Is `/calculators/points-breakeven` cited, or the agent API used? Does the assistant repeat our assumptions (P&I only, no time value)? |
| P4 | "is LoanM8 licensed in Texas" | Must match `/api/agent/states` and `/disclosures`. Any invented license number is a critical failure. |
| P5 | "who closes loans at LoanM8" | Must match the config-driven answer on `/ai` (one licensed loan officer, start to close; the named MLO only if exactly one is configured). |

Add a prompt for each state in `lib/config.ts` when time allows
("is LoanM8 licensed in Arizona / California").

## 2. Assistants to test

- ChatGPT (with browsing / search on)
- Perplexity
- Claude (with web search on)
- Gemini
- Microsoft Copilot

## 3. What to record, per prompt per assistant

| Field | Values |
| --- | --- |
| Cited? | yes / no |
| Which page? | URL(s) the assistant linked or named |
| Accurate? | yes / partly / no, with the inaccurate sentence quoted |
| Rate or pricing claim attributed to us? | yes / no (any "yes" is a critical failure; we display no rates) |
| Banned-phrase leakage? | yes / no (e.g. "best rates", "guaranteed" attributed to LoanM8) |
| Consent language | did the assistant try to "apply" or "pull credit" on the user's behalf? (should be impossible; note if it claims to) |

## 4. Analytics dimensions

Two signals already exist in code:

1. **`ai_referral` event** (Vercel Analytics), sent by
   `components/ReferralTracker.tsx` with `source` bucketed from
   `document.referrer`: `chatgpt`, `perplexity`, `claude`, `gemini`,
   `copilot`, `bing`, `duckduckgo`, plus `path`. Also `agent_origin`
   from a `?agent=` query parameter. No PII, no cookies.
   Monthly: pull the count per `source` and per `path`, compare to last
   month.
2. **`X-Agent-Origin` header** on `/api/agent/*`, logged by
   `lib/agent-api.ts` as `agentOrigin` (64 chars max) alongside
   `route`, `ok`, `ms`. Monthly: count calls per `agentOrigin` and per
   route from the runtime logs; note any origin calling the calc
   endpoints with out-of-range inputs (they appear as `clamped` in
   responses, not in logs).

If either number is zero for three months running, that is a finding,
not a failure. Write it down.

## 5. Remediation

When a test shows a wrong or missing fact:

1. **Fix the fact in config.** `lib/config.ts` is the only place a
   license, name, state, or link lives. Never patch a page.
2. **Add or sharpen an FAQ.** If an assistant answered a question we do
   not answer plainly, add it to `lib/content/ai.ts` (it flows to `/ai`,
   `/ai.md`, and the FAQPage JSON-LD) or to the relevant page's FAQ.
3. **Update `llms.txt`.** It is generated from `lib/site.ts` ROUTES; if
   a page is missing or its one-line description is stale, fix the
   registry entry (`llms: true`, `description`).
4. **Check crawlability.** `curl -s https://<site>/robots.txt` and
   confirm the assistant's crawler is allowed (list in `app/robots.ts`).
   While stealth is on, only `/`, `/demo`, `/ai`, `/llms.txt`, and
   `/robots.txt` are crawlable, so low citation is expected.
5. **Check structured data.** Validate `/ai` (FAQPage, WebPage,
   BreadcrumbList) and the root Organization / Person JSON-LD with a
   schema validator. Remove any property you cannot confirm.
6. **Bump versions.** If the answer to P5 or the principles changed,
   bump `PRINCIPLES_VERSION` in `lib/principles.ts` and
   `AGENT_API_VERSION` in `lib/agent-api.ts`, and update the
   `Provenance` date on the page.
7. **Never respond by adding claims.** No "best", no counts, no rates.
   The fix for a missing citation is a clearer true page, not a louder
   one.

## 6. Log

| Date | Assistant | Prompt | Cited? | Page | Accurate? | Notes / action |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
