# D81–D87 — Lead sources rebuild (owner brief, 2026-11-22)

The owner's brief, verbatim. Mockups: https://claude.ai/artifact/HQrwiMfn2W2WHKTnZz5XTY
(artboards "1 · Lead sources, cleaned up", "1b · phone", Option A, B, C, and "The page once it's built").
All numbers in the mockups are examples.

Process rules from the owner: seven patches, D81 to D87, in order. For each: one commit per patch; a PATCHLOG
entry in the existing style; tests passing, plus the red-team copy checks; push to the branch and deploy a
preview. Do not promote anything to production until the owner signs off. **If something here conflicts with
existing code or the compliance ledger, stop and ask instead of guessing.**

---

## D81 — Lead sources copy cleanup and the "i" pop-up

1. In `lib/content/cc-pages.ts`, edit `LEADS.how` and delete the sentence "A duplicate is merged, never doubled." The intake behavior stays as it is; only the copy goes.
2. In `app/mlo/leads/page.tsx`, replace the `LEADS.consent` paragraph with one line: "Permission is saved with every lead." Follow it with an i button that opens a pop-up. On phones the pop-up is a bottom sheet.
   * Title: When a lead counts as permission
   * "Your vendor's consent wording is saved with every lead. It counts as permission to text or call only when it names you or your company."
   * "Many forms name only "partners." Those leads show No permission yet."
   * "Ask your vendor to send three things with every lead:" then a list:
      * Their consent wording
      * When the person agreed
      * The web page where they agreed
   * Button: "Copy a note for your vendor". It copies a short, polite request for those three fields, including the field names `consent_text`, `consent_timestamp` and `page_url`.
3. Put the same i next to every "No permission yet" in Recent leads.
4. Build the button as a reusable `InfoTip` component.
   * It is a real `<button>` with `aria-label` and `aria-expanded`.
   * Focus moves into the pop-up and back out.
   * It closes on Esc and on a tap outside.
   * The tap target is at least 44px.
   * It works in light and dark themes.
   * All of its copy lives in `cc-pages.ts`.

## D82 — Example mode until real leads arrive

Until the signed-in loan officer has at least one real lead (a contact with a `lead:` source, or a D83 lead event), the page shows the full new layout from the "page once built" mockup, filled with example data:

* the ask bar;
* the scorecard;
* the lead-plan card;
* the compact Add a lead source card;
* Recent leads.

Rules:

* Example data comes from one fixed fixture: `lib/leads/examples.ts`, holding the mockup's sample rows.
   * The fixture is never written to the database.
   * It is never exported.
   * It is never counted in reports.
   * It is never sent to the AI or the agents as real data.
* Every example section carries a visible "EXAMPLE" label and one line of copy: "These are example numbers. Yours appear here after your first lead arrives."
* Each section switches to real data on its own, as soon as it has some:
   * the scorecard after the first real lead;
   * the plan card after the first saved plan.
* Never mix example and real rows in one section.
* In example mode the Add a lead source card sits at the top of the page, because connecting a source is the first job. Once real leads exist it moves to section 4, in its compact form.
* Unit-test the switch logic. Add a test proving example rows never reach the store, the Concierge context or exports.

## D83 — Lead spend tagged by source, and a lead-event log

1. Expenses. Add `leadSource: string | null` to the expense `Entry`.
   * Update both store implementations and any migration. Existing rows default to `null`.
   * Show a "Lead source" picker on advertising lines, and on software lines that are lead spend. Its options:
      * sources already seen in `lead:` contacts and in connection-address labels;
      * "Past clients & sphere";
      * "Your web form";
      * "Other…" (free text).
   * When the vendor or the words name a known source (Zillow, LendingTree, Bankrate, LowerMyBills, Google Ads, Meta), pre-select it in the expense parser and in M8's expense drafts. The loan officer confirms it, as with every draft today.
   * Normalize source keys (lowercase slug) in one helper. Spend and leads must join on the same key.
2. Monthly amount per source. On Lead sources, the loan officer can set a monthly amount per source (for example, Zillow $1,200). Each month this creates a draft expense, tagged with the source, for them to confirm in the existing drafts flow. Nothing posts on its own.
3. Lead events. Intake currently merges duplicates into an existing contact and keeps the first source, so repeat deliveries don't count for the source that sent them. Add a lightweight log with one event per delivered lead: `{ ownerUserId, sourceKey, contactId, at, duplicate: boolean, namesYou: boolean }`.
   * The scorecard counts leads from events, not from contacts.
   * Each source's card gets a "repeats" count (duplicate deliveries), so the loan officer can ask the vendor for credit.
   * Backfill one event per existing `lead:` contact.

## D84 — Scorecard (Option B)

1. Add `lib/leads/scorecard.ts`. It is pure and fully unit-tested.
2. Inputs:
   * the period: 30 days, 90 days or this year;
   * lead events;
   * confirmed lead-spend expense lines, at their business-use share;
   * pipeline loans, joined to the contact and then to that contact's first lead source.
3. For each source it reports:
   * spend;
   * leads;
   * leads you can call: the event's `namesYou`, equal to the consent summary the page already uses;
   * share you can call;
   * cost per lead;
   * cost per lead you can call;
   * in pipeline;
   * loans closed;
   * cost per loan;
   * repeats.
4. Badges come from deterministic rules. Thresholds sit in one config object with tests.
   * Not enough data: fewer than 10 leads. This overrides every other badge except Pause?.
   * Best value: the lowest cost per loan among sources with at least 1 loan.
   * Scale up: at least 2 loans, and cost per loan at or under the target.
   * Watch: spend with cost per loan over the target, or fewer than 2 loans.
   * Fix permission: at least 10 leads, and under 50% you can call.
   * Pause?: at least $1,000 spent, 60 days or more of history, and 0 loans.
5. The target cost per loan is a setting on the page. The default is $1,000, which the loan officer can edit.
6. "Past clients & sphere" is its own row.
   * Spend: lines tagged with that source, such as cards, Thanks.io and gifts.
   * Leads and loans: contacts tagged past client or sphere who started a new loan in the period. Reuse the existing tags and segments; don't invent new ones.
7. Layout: a table on desktop and stacked cards on phones, as in the mockup. Add the period switch.
   * Under the table: "Spend comes from lead-spend lines in Expenses", with links to "Log spend" and "Set a monthly amount per source".
8. Business Manager. Extend `lib/agents/business.ts`:
   * Add the scorecard numbers to `snapshot.sources`.
   * Each period, propose at most one lead-source move. Examples: "Move Bankrate's budget to your web form for 60 days" or "Ask LendingTree for consent wording that names you".
   * The proposal uses the existing approval flow, with `href: /mlo/leads`. Approving only updates the saved plan (D86) and adds tasks. It never moves money or contacts a vendor.
   * Show the newest pending lead-source proposal as the banner at the top of the scorecard, with a Review button.

## D85 — Ask your Concierge on Lead sources (Option A)

1. Put a question box at the top of the page, with three suggested questions:
   * "Which source should I add next?"
   * "Plan $1,500 a month for 90 days"
   * "Which vendors don't give me permission?"
2. Route questions through the Concierge `ask()` path in `lib/concierge/desk.ts`, with a lead-source context pack:
   * the scorecard rows for the chosen period;
   * the target cost per loan;
   * the saved plan;
   * connected sources;
   * permission rates;
   * monthly amounts.
3. Code computes every number. The AI explains them and must quote figures from the pack only. Validate the answer: if it states a dollar figure or count that isn't in the pack, drop that sentence and add "see the scorecard".
4. Answer card:
   * the plain-language answer;
   * a table rendered from the pack, not from AI text;
   * buttons: "Save as my 90-day plan" (goes to D86), "Add the steps to Today" (creates Concierge tasks) and "Show the math".
5. Respect the AI allowance. When it's used up, answer from a template built on the scorecard.
6. Compliance and the guard (`lib/concierge/guard.ts`) review every answer. Answers must never recommend:
   * trigger leads, or buying credit-inquiry data;
   * paying real estate agents or anyone else for referrals, or "exclusive" deals that work as a referral fee (RESPA §8);
   * contacting leads without permission;
   * quoting rates. Add red-team tests for each.
7. In example mode, the Concierge says the numbers are examples and answers in general terms, such as how to choose a first source. It never treats the example numbers as the loan officer's own.

## D86 — Budget planner and 90-day roadmap (Option C)

1. Add the planner section or page at `/mlo/leads/plan`.
   * Inputs: a monthly budget, with presets of $750, $1,500 and $3,000 plus a custom amount, and the target cost per loan.
2. Allocation is deterministic code, unit-tested:
   1. Fund "Past clients & sphere" first, with a small amount.
   2. Rank paid sources by cost per loan. Where loans are fewer than 2, rank by cost per lead you can call.
   3. Fund the best source up to its share.
   4. When the budget is at least $2,000, keep one test slot of at most 20% for a new source, capped for 60 days.
   5. Leave out sources flagged Pause?.
   6. Cap sources marked Not enough data as tests.
3. Expected leads and loans a month are ranges built from the loan officer's own history, labeled "estimates". Never use made-up industry benchmarks.
4. The roadmap has three phases, matching the mockup:
   * Days 1–30, Free first.
   * Days 31–60, One paid test.
   * Days 61–90, Scale or cut. Each step becomes a Concierge task on Today. The Business Manager checks in every 30 days and proposes the next adjustment.
5. Saving a plan stores it and shows the plan card on Lead sources: budget, split bar, day X of 90 and next check-in.
6. Business Finder suggestions for the test slot come from a curated catalog of source types. Each type comes with setup steps and a note on getting permission. The catalog:
   * your own web form with search ads;
   * Meta lead forms;
   * Google Business Profile and local SEO;
   * open houses with listing agents, with nothing of value exchanged;
   * past-client and sphere campaigns;
   * vendor marketplaces such as Zillow, LendingTree, Bankrate and LowerMyBills. Show no invented prices. Use the line: "Cost comes from your own spend once you test it."
7. The planner never spends money, signs up for a vendor or contacts anyone. It only saves the plan and makes tasks.

## D87 — Tests, red team and docs

* Unit tests for:
   * scorecard math, including zero-spend, zero-lead and divide-by-zero cases;
   * badge rules;
   * allocation;
   * the example-mode switch;
   * source-key normalization;
   * the lead-event backfill.
* Red-team copy tests across the new copy and the Concierge answers: no rates or promises, nothing of value for referrals, no trigger leads, fair housing.
* Accessibility:
   * the InfoTip, the period switch and the planner presets have keyboard and screen-reader names;
   * every tap target is at least 44px;
   * text contrast is at least 4.5:1;
   * the page works at phone width.
* Update the Lead sources entry on the Tools page, `SUBS.leads`, to: "Where your leads come from, what each source costs, and what to do next."
* Write the PATCHLOG entries.
* Post the preview URL and a short list of anything you couldn't build or had to change.

---

## Owner decisions (2026-11-22), answering the pre-flight conflict check

1. **"Leads you can call" — both.** The scorecard credits a vendor only when *that delivery's* consent wording named
   the loan officer or their company (`namesYou`, frozen on the lead event at delivery; from `consentNamesUs` in
   `lib/leads/intake.ts`). Recent leads keeps showing whether the person can be contacted *today* (the current
   consent summary). A repeat delivery from a vendor whose form names only "partners" is not callable for that
   vendor even if another vendor's form gave permission earlier.
2. **Example mode keeps the real vendor names** (Zillow, LendingTree, Bankrate) from the mockup, under the visible
   EXAMPLE label and its line "These are example numbers. Yours appear here after your first lead arrives." The
   owner's reasoning: the label tells the user these are layout examples, not real data. Never mix example rows
   with real rows, never send them to the AI or agents as real, never export or count them.
3. **Sphere spend includes closing gifts, as written.** Owner: "closing gifts are allowed for clients and agents
   under RESPA — they are not tied to referrals." So "Past clients & sphere" spend may include cards, Thanks.io and
   closing gifts (client or agent) tagged with that source. Guardrails that stay: nothing — copy, Concierge answers,
   Business Manager moves or the planner — may tie a gift to a referral, suggest a gift in exchange for referrals,
   or describe gifts as "the cost of a referral"; the RESPA §8 guard lines stay. Record this decision in the PATCHLOG
   for counsel.
4. **Imported vendor leads count fully.** Contacts imported from a vendor file with a Lead source (`Contact.leadSource`,
   or provenance `lead_vendor`) are backfilled as lead events and counted everywhere (leads, permission rates, loans),
   and the loan officer can work them from Contacts the same as delivered leads. Their `namesYou` comes from what the
   import recorded (a granted consent row for that person whose wording/attestation names the LO), else false.

## Builder notes from the pre-flight check (obvious choices, apply unless they conflict)

- **One source-key helper** (lowercase slug) with aliases for Zillow, LendingTree, Bankrate, LowerMyBills, Google Ads,
  Meta, "Past clients & sphere" and "Your web form"; use it for `lead:` sources, the `lead:<slug>` tag, imports'
  `leadSource`, expenses and `lib/agents/business.ts` (which slices the source differently from the page today).
- Connection-address labels (`lib/pipeline/keys.ts`) are only picker suggestions; drop default labels like
  "Loan system" and "Lead vendor".
- **Webhook retries are not repeats:** skip a second event with the same owner, source and `externalId`.
- Every delivery is a lead; repeats are a subset. Loans credit the contact's first source only.
- Backfill `namesYou` from a granted consent row whose actor starts with `lead:` (not the current summary); the
  `lead.inbound` audit rows hold duplicate history.
- Past client / sphere are `Contact.relationship` values (`lib/contacts/filter.ts`), not tags — use the field.
- Loans: no `createdAt`; "started" = `keyDates.application`, else the first history entry. "Closed" =
  `closed && !dead` with `milestoneAt`, as `business.ts` does.
- Expense parser: add Bankrate, LendingTree, LowerMyBills (and the other named vendors) under advertising.
- `Entry.source` gains "monthly"; one draft per source per month, made by the morning run (Hobby: no new cron);
  Neon `ALTER TABLE cc_expenses ADD COLUMN IF NOT EXISTS lead_source text`.
- Tasks on Today: either allow a task with no contact plus a "plan step" card linking to `/mlo/leads/plan`, or use
  Business Manager moves (`contactId: null`, `href`). Pick one and keep it consistent across D84–D86.
- Approval: moves have no generic Approve today (`kind: "plan"` offers Done/Dismiss). Add an approve action that
  passes Compliance (`reviewMove`); D84's approve stays disabled or "coming with the planner" until D86's plan store.
- Concierge: a new `askLeadSources()` beside `ask()` in `lib/concierge/desk.ts`; keep the guard (a guard failure holds
  the whole answer); only figures missing from the pack drop their sentence; figures in the question count as allowed;
  vendor names go in nonce data blocks; in example mode send no example rows at all.
- Red-team tests that must contain banned words go in `tests/` or build the strings in pieces (check:copy scans
  `lib/**/*.test.ts`).
- Exports: `expenses.csv` gains `leadSource`; add `lead-events.csv` and the saved plan to Download everything.
- Contact merge re-points lead events (like tasks in `lib/contacts/manage.ts`); deleting a contact keeps events.
- Expenses are private to their owner: the page stays own-book only; assistants see no spend.
- `/mlo/agents` shows `snapshot.sources` with a conversion rate — update it and its test; name the new scorecard so it
  doesn't collide with `scorecard()` in `lib/agents/service.ts`.
- There is no Tools page: update `SUBS.leads` and the Leads entry's `desc` in `app/mlo/nav.ts`.
- Test that "%" in "share you can call" doesn't trip the rate detector (`findRateMentions`).
- Label planner ranges "estimates" (own-data only, like `goalPlan`).
- For counsel in the PATCHLOG: the catalog's open-house line (`ATTORNEY_REVIEW_LIST.md` co-marketing), Meta and
  search ads need Special Ad Category and fair-housing audiences, the trigger-lead block added to the guard, and the
  closing-gift decision above.
- The weekly report still counts leads from contacts; leave it and note the difference in the PATCHLOG.

## Owner decision 5 (2026-11-22, after D82): dating imported leads

"Count all, date right." Every imported contact with a Lead source counts as a lead (not only files marked as a
lead vendor). Each backfilled lead event is dated by the file's own date — the application date, else the closed /
funded date, else another date column the import mapped for that person — and only a vendor-marked file with no
date uses the import date. Lead-source values that mean "Referral", "Past client" or "Sphere" (and similar) go to the
"Past clients & sphere" row through the source-key helper, not to a vendor row. This replaces D82's interim rule
(only files marked lead vendor count); D83 updates `lib/leads/mode.ts` and the backfill to match.
