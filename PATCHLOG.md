# PATCHLOG — production launch series (L1–L8)

Index only. The full entry for every patch (files, verification, known
issues, decisions) is in `LoanM8_Project_Handoff_README.md`, the repo's
continuity log. L-patches continue its numbering (L1 = v31).

| Patch | Log entry | Status |
| --- | --- | --- |
| L1 — Licensing single source of truth | v31 | Preview, awaiting owner sign-off |
| v32 — Lenders numbered ("Lender 1, 2, 3"); L4 pricing spec | v32 | Preview, awaiting owner sign-off |
| v33 — M8 chat redesign + voice (ElevenLabs, browser fallback) — part of L6 | v33 | Preview, awaiting owner sign-off |
| L2 — Site-wide disclaimer rewrite, `/licensing`, TX notice | v34 | Preview, awaiting owner sign-off; Texas notice text needed |
| L3 — Remove example mode, go live | — | Not started |
| L4 — Pricing: weekly ARIVE pull + screenshot, Freddie Mac −0.25% posted rate | — | Specced in `docs/work/L4-pricing-spec.md`; 6 owner decisions open |
| L5 — Accounts, data, security | — | Not started (provider choice needs owner OK) |
| L6 — M8 chat redesign + browser voice | — | Not started |
| L7 — M8 security and compliance sweep, red-team suite | — | Not started |
| L8 — Launch checklist | — | Not started; promote only on the owner's "promote" |

## Owner decisions for L4 (2026-10-30)

- **Source:** manual pull in ARIVE with a source screenshot, entered in
  `/mlo/pricing` (the Patch A path). The ARIVE API comes later. ARIVE's
  Zapier integration covers loans and leads, not pricing, so it is not a
  pricing path.
- **Storage:** Vercel Blob (private) for snapshots and screenshots
  (approved). The file store stays for local development.
- **The one daily scenario** (not state-specific; shown in every state
  as a reference, never as the visitor's quote):
  - Purchase, price $400,000, 25% down ($100,000), loan $300,000, 75% LTV
  - Conventional conforming, 30-year fixed
  - Primary residence, single-family
  - Credit score 780
  - 30-day lock
  - Priced for ZIP 98033 (Kirkland, WA); the assumptions say pricing
    in other states may differ
- **Display:** rate, APR (same prominence), points and the as-of date
  and time stay visible. Everything else sits behind a closed, clearly
  labelled "Rate assumptions" toggle (keyboard and screen-reader
  accessible). Counsel to confirm (ATTORNEY_REVIEW_LIST.md).
