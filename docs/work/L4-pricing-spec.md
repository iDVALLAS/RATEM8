# L4 pricing spec: weekly pull + "Freddie Mac minus 0.25%" posted rate

Status: **SPEC, not built.** Owner direction 2026-10-30. Builds as L4
after L1–L3 sign-off. Counsel items are marked ⚖ and are also listed in
`ATTORNEY_REVIEW_LIST.md`.

## 0. Lender display (done now, v32)

- Every lender shows as **"Lender 1", "Lender 2", …**: in the demo, and in
  anonymized pricing (which used to say "Lender A").
- Switch: `CONFIG.demo.namedLenders` in `lib/config.ts`. `false` today.
  Set it to `true` in a future build to bring back lender names and the
  approved logos. Nothing else changes.

## 1. The weekly pull

### Cadence
- **Once a week, Thursday afternoon (Pacific)**, after Freddie Mac posts
  its weekly average at noon Eastern. One sitting covers both the grid and
  the posted-rate check in §2. (Earlier draft said Monday; Thursday lines
  the two up. Owner to confirm.)
- Pricing older than **7 days** (`PRICING_MANUAL_STALE_HOURS=168`) hides
  itself. The page then says "This week's pricing isn't posted yet." No
  two-week-old rate ever shows.
- The page states the schedule plainly: "Pricing is refreshed every
  Thursday afternoon, Pacific time." No countdowns, no urgency.

### Scenarios (all at $400,000 price, ZIP 98033, primary residence, single-family, 30-day lock)

| # | Program | Down / LTV | Credit |
|---|---|---|---|
| 1 | Conventional 30-yr purchase | 25% / 75% | 780 |
| 2 | Conventional 30-yr purchase | 20% / 80% | 740 |
| 3 | Conventional 30-yr purchase | 10% / 90% | 700 |
| 4 | Conventional 30-yr purchase | 5% / 95% | 680 |
| 5 | Conventional 15-yr purchase | 25% / 75% | 780 |
| 6 | FHA 30-yr purchase | 3.5% | 680 |
| 7 | VA 30-yr purchase | 0% | 720 |
| 8 | Conventional 30-yr rate-and-term refi | 70% LTV | 760 |

Owner may cut or swap rows. Row 2 doubles as the posted-rate check (§2).

### What is entered per scenario (`/mlo/pricing`, existing form)
- For each lender priced (at least 3 publishable lenders; PRMG and the
  three HELOC-only programs excluded automatically): note rate, discount
  points or lender credit, lender fees.
- **One screenshot per scenario** (required; the form refuses to publish
  without it). Stored privately in **Vercel Blob** with the snapshot,
  never shown publicly.
- The site computes APR (`lib/pricing/apr.ts`), payment, and total cost,
  numbers the lenders, and picks the three neutral options: lowest rate,
  lowest total cost, lowest rate without risky features.

### What a borrower sees
- They pick the closest scenario (purpose, down payment, credit range,
  program). They see that scenario **exactly as priced**. Nothing is
  adjusted or estimated to their numbers. Differences are spelled out:
  "Priced at 740. Your range: 720–739. Your loan officer prices your
  exact numbers."
- Each card: rate, **APR (same size, beside the rate)**, points, and
  "Priced Thursday, Oct 30, 2:10 PM PT · rates change daily."
- "Rate assumptions" toggle (closed by default, labelled, keyboard and
  screen-reader accessible): price, down payment, loan amount, LTV,
  credit score, program and term, occupancy, property type, lock period,
  "priced for ZIP 98033; pricing in other states may differ", "priced by
  a licensed loan officer in the sponsoring brokerage's pricing engine."
- No broker compensation anywhere on the public display.

## 2. The posted rate: Freddie Mac's weekly average minus 0.25%

### The offer, in one sentence
For a borrower who matches the qualifying profile and locks during the
posted week, LoanM8 offers a 30-year fixed rate **at least 0.25% below
Freddie Mac's weekly average 30-year fixed rate, with no discount
points**, plus LoanM8's standard fees (shown in the APR).

### Why "no discount points" is part of it
Freddie Mac's weekly average (PMMS) no longer reports points or fees
(Freddie Mac stopped in November 2022 when the survey moved to loan
application data). Without a points rule, "0.25% under" could be
reached by buying the rate down, which would make the comparison
misleading. Zero discount points makes it apples-to-apples and easy to
honor exactly. (Owner may choose a different cap, e.g. "no more than 0.5
points"; the cap is then printed on the card.)

### Benchmark
- Freddie Mac Primary Mortgage Market Survey (PMMS), 30-year fixed.
  Released Thursdays at noon ET. Basis per Freddie Mac: conventional,
  conforming, fully amortizing **home purchase** loans, **20% down**,
  **excellent credit**.
- There is no Fannie Mae equivalent: Fannie Mae does not publish a
  consumer rate average. "Fannie/Freddie" on the site means Freddie Mac's
  PMMS only, named as such.
- Entered by hand each Thursday in `/mlo/pricing` (rate, release date,
  link). Automating the download is possible later ⚖ (Freddie Mac's terms
  of use for commercial display).

### Qualifying profile (mirrors the benchmark so the comparison is fair)
| Field | Value |
|---|---|
| Purpose | Purchase |
| Program | Conventional conforming, 30-year fixed |
| Down payment | 20% or more (LTV ≤ 80%) |
| Credit score | **[owner: 740+? 760+? 780+?]** |
| Occupancy / property | Primary residence, single-family (1 unit) |
| Loan amount | Up to the conforming limit for the county |
| Lock | 30 days, locked within the posted week |
| States | **[owner: all five, including Oregon via Ryder Fasse, or the four marketed states]** |
| Approval | Subject to credit approval, underwriting and property eligibility |

### Posted week (the honor window)
- From Thursday's PMMS release to the next Wednesday, 11:59 PM PT.
- A borrower who matches the profile and **locks within the window**
  gets the posted rate or better. After Wednesday, the new week's rate
  applies.

### Safety check before it posts (protects you from posting what you can't honor)
- The posted rate only publishes when the **same Thursday's ARIVE pull**
  shows at least one publishable lender at or below the posted rate, at
  zero discount points, for the qualifying profile's **lowest** credit
  score at 80% LTV (row 2 of the grid, re-scored to the profile floor).
- If it doesn't, the card stays hidden that week and `/mlo` says why. The
  site never shows a posted rate without same-day ARIVE evidence on file.

### What it looks like

```
┌───────────────────────────────────────────────────────────────┐
│ THIS WEEK'S LOANM8 RATE · WEEK OF OCT 30 – NOV 5               │
│                                                               │
│   5.99%  rate          6.08%  APR          0 discount points  │
│   30-year fixed · purchase · 20%+ down · 760+ credit          │
│                                                               │
│   0.25% below Freddie Mac's weekly average (6.24%,            │
│   30-yr fixed, released Oct 30, 2026).                        │
│                                                               │
│   Lock by Wed, Nov 5, 11:59 PM PT to get this rate or better. │
│   Subject to credit approval, underwriting and property       │
│   eligibility.                                                │
│                                                               │
│   [ Rate assumptions ▾ ]      [ Talk to your loan officer → ] │
└───────────────────────────────────────────────────────────────┘
 Rate assumptions (when opened):
   $400,000 purchase · $80,000 down (20%) · $320,000 loan · 80% LTV
   760 credit score · primary residence · single-family · 30-day lock
   0 discount points · LoanM8 standard fees $[X] (included in the APR)
   Benchmark: Freddie Mac PMMS 30-year fixed, purchase loans with 20%
   down and excellent credit; Freddie Mac does not report points or fees.
   Priced and checked in ARIVE Thursday, Oct 30, 2:10 PM PT.
```
(Figures above are layout placeholders only, not rates.)

- The lock-by line is a factual deadline, not urgency copy: it is the
  window you honor. No "hurry", "limited", or countdown.
- Wording avoids "guarantee" (banned by `check:copy`) and "commitment"
  (it would collide with "This is not a commitment to lend").
- Where it shows: top of `/rates`, and one line on the homepage linking
  to it. M8 does not quote it or compare rates with any benchmark (v19
  rule stays); M8 links to the card.

### Honoring it
- Every posted week is stored with its evidence: PMMS rate and date,
  posted rate, APR, fee schedule, the ARIVE screenshot, who posted it.
- `/mlo` shows the current posted rate and window to the loan officer,
  so any borrower who asks gets it without negotiation.
- ⚖ The cost of honoring may not be paid by varying loan officer
  compensation loan to loan (Reg Z §1026.36(d)); confirm how the price is
  delivered (lender selection, lender credit, broker comp plan).

### Build pieces (for L4)
- `CONFIG.pricing.postedRate` (enabled only when `POSTED_RATE=true`;
  every bracketed value renders nothing, like the v19 benchmark).
- `lib/pricing/posted-rate.ts`: computes the posted rate (PMMS − 0.25,
  rounded **down** to the nearest 0.125%), APR from the fee schedule, the
  window, and the evidence check. Pure functions with tests.
- `components/pricing/PostedRateCard.tsx` + strings in
  `lib/content/posted-rate.ts` (added to the `check:copy` allowlist for
  the benchmark words, like `rate-vs-average.ts`).
- `/mlo/pricing`: a Thursday section for the PMMS figure and the check.
- The v19 `benchmarkComparison.feesAndPoints` field is retired: Freddie
  Mac no longer publishes it.

### ⚖ Counsel before the flag turns on
1. Reg Z §1026.24(a): only terms actually available may be advertised.
   The safety check plus the honor window are designed for this; confirm.
2. §1026.24(c)/(d): APR with equal prominence; trigger-term disclosures
   behind the "Rate assumptions" toggle.
3. The comparative claim "0.25% below Freddie Mac's weekly average",
   with source, date and basis printed. UDAAP review of the wording.
4. Freddie Mac's terms for naming PMMS and showing its figure.
5. §1026.36(d): how honoring is funded.
6. State advertising rules in all five states (some require the license
   number on rate ads: the card shows sponsor and MLO NMLS via L2).

## 3. Owner decisions needed

1. **Credit score floor** for the posted rate: 740, 760 or 780?
2. **Points rule**: zero discount points (recommended), or a cap?
3. **LoanM8's standard fees** for the APR (lender fees, any borrower-paid
   broker fee). Needed for any APR shown.
4. **States**: all five (Ryder honors it in Oregon), or the four
   marketed states?
5. **Pull day**: Thursday afternoon (recommended) instead of Monday?
6. **Scenario grid**: keep the 8 rows above, or cut/swap?
