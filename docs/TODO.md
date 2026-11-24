# LoanM8 to-do list

Owner-approved work that is waiting. Newest first. When an item is built, move it
to its PATCHLOG entry and delete it here.

## Daily pricing scenarios (owner, 2026-11-24)

**The owner's rule for every scenario:**
- Conforming (conventional) loans only, purchase or refinance, for credit **680 and over**.
- **FHA** for credit **580 to 679**.
- No other programs are added. The existing non-QM bank-statement scenario stays until the owner says otherwise.

**Why tiers work:** a conforming price is one base price moved by credit and LTV (Fannie Mae and
Freddie Mac price both in steps). So each scenario prices one loan size (about $450,000 conventional,
$400,000 FHA, 30-year fixed, primary single-family home, Washington). Only the credit tier and the LTV
band change. `matchDaily` (`lib/pricing/daily.ts`) takes the first scenario whose credit floor the
borrower meets, so list the higher tiers first in `dailyScenarios()`.

### Now: the core 11 (next pricing patch, not yet built)

The 6 scenarios already saved stay. These 11 make sure nobody at 580+ falls through.

| # | Program | Purpose | Credit | LTV band |
|---|---|---|---|---|
| 1 | Conventional | Purchase | 680–699 | 75.01–80% |
| 2 | Conventional | Purchase | 680–699 | 90.01–95% |
| 3 | Conventional | Purchase | 680–699 | up to 75% |
| 4 | Conventional | Purchase | 680–699 | 80.01–90% |
| 5 | Conventional | Rate-and-term refinance | 680–699 | up to 75% |
| 6 | Conventional | Rate-and-term refinance | 680–699 | 75.01–90% |
| 7 | Conventional | Cash-out refinance | 680–699 | up to 75% |
| 8 | Conventional | Cash-out refinance | 680–699 | 75.01–80% |
| 9 | FHA | Purchase | 580–619 | 96.5% |
| 10 | FHA | Purchase | 620–679 | 96.5% |
| 11 | FHA | Rate-and-term refinance | 580–679 | up to 97.75% |

### Later: the full grid (add when the owner has time to price more each day)

Higher credit tiers for each conventional band, so a strong borrower sees their own tier's price
instead of the 680 floor:
- **Purchase:** 780+, 740–759 and 700–719 in each LTV band (up to 75%, 75.01–80%, 80.01–90%, 90.01–95%),
  and 95.01–97% for first-time buyers.
- **Rate-and-term:** 760+ and 720–739 at up to 75% and 75.01–90%.
- **Cash-out:** 740–759 at up to 75%, and 720–739 at 75.01–80%.
- **FHA:** cash-out refinance at up to 80% (580–679).

### Needs the matching to learn new rules (bigger patch; owner to pick order)

VA, condos, second homes, investment properties, high-balance and jumbo loans, and the other four
licensed states (OR, AZ, CA, TX).
