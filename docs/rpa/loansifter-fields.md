# LoanSifter search form — field inventory (L4b Phase 0, part 1)

Source: the owner's screenshot of `loansifternow.optimalblue.com/search`
(New Search), 2026-11-01.

- **Owner's setup:** pricing runs on the owner's logged-in **Windows**
  computer in **LoanSifter** (Optimal Blue). This replaces the brief's
  ARIVE + macOS assumption. The provider id becomes `loansifter_local`,
  replacing `arive_local`.
- **No code until the owner approves the full flow doc.** Still needed:
  - the results page, including ineligible lenders and their reasons
  - a lender's detail view
  - any login, timeout or session-expired screen
  - a saved scenario, if one is used

Required fields are marked ★ in the table below (red-edged on screen).
`(default)` is the value shown on a blank search.

| Panel | Field | Control | Default | From the borrower's scenario? |
| --- | --- | --- | --- | --- |
| Loan Information | Lien Position | select | First | fixed: First (HELOCs are a separate path) |
| | Loan Type | select | Conventional | yes (conventional / FHA / VA / jumbo) |
| | Product Type | select | Standard | fixed: Standard |
| | Term | select | 30 Years | yes |
| | Amortization Type | select | Fixed | yes |
| | Loan Purpose | select | Purchase | yes (purchase / rate-term / cash-out) |
| | Construction to Perm | checkbox | off | fixed: off |
| | ★ Purchase Price | currency | — | yes (purchase) |
| | ★ Appraised Value | currency | — | yes (value) |
| | ★ Base Loan Amount | currency | — | yes |
| | ★ LTV | percent | — | computed |
| | Subordinate Financing | checkbox | off | **not collected today** |
| | Duty to Serve | select | Not Evaluated | fixed |
| | Mission Score | select | Not Evaluated | fixed |
| Borrower Information | Credit Score Model | select | Classic FICO | fixed |
| | ★ Representative Credit Score | number | — | yes, from the FICO band (use the band's floor) |
| | DTI Ratio | percent | 30.00% | **not collected today** |
| | Reserves (Months) | number | 24 | **not collected today** |
| | Monthly Qualifying Income | currency | — | **not collected today** |
| | Properties Financed | number | 1 | **not collected today** |
| | Citizenship | select | U.S. Citizen | **not collected today** |
| | First Time Home Buyer, Self Employed, Non-Occupant Co-Borrower, Corporate Relocation, ITIN | checkboxes | off | first-time buyer partly; the rest **not collected** |
| Property Information | Occupancy | select | Primary Residence | yes |
| | Legal Structure | select | Single Family | yes (property type) |
| | Number of Units | select | 1 Unit | **not collected today** |
| | Type | select | Detached | yes (property type) |
| | Manufactured | select | No | fixed: No |
| | Property Zip | text | — | yes |
| | State | select | (from ZIP) | from ZIP |
| | County | select | (from ZIP) | from ZIP |
| Product Characteristics | Search By | select | Price | fixed: Price |
| | Desired Price | number | 100.000 | fixed: par (100.000); points come from the results |
| | Interest Only | select | No | fixed: No (a risky feature) |
| | Buydown | select | None | fixed: None |
| | Desired Lock Period | number | 30 | yes (default 30) |
| | Fees In | checkbox | off | owner to decide |
| | Borrower Paid Compensation | checkbox | off | **owner to decide. Comp never shows on public results (TRID).** |
| | Waive Escrows | select | No | fixed: No |
| | Prepayment Penalty | select | None | fixed: None (a risky feature) |
| | Automated U/W System | select | Not Specified | fixed |
| | Investors | select | All | fixed: All |

Buttons: **Save Scenario** and **Submit**. Left nav: New Search, Contacts,
Scenarios, Market Trends, My Settings.

## Open questions for the owner
1. DTI, reserves, income, properties financed and citizenship are not
   collected by M8 today. Should the robot use LoanSifter's defaults
   (30% DTI, 24 months reserves) and label results as assuming them, or
   should M8 ask?
2. Fees In and Borrower Paid Compensation: which settings match how you
   quote?
3. Does Submit create anything in your pipeline, or is a search
   stateless? (The brief forbids creating leads or loans.)
4. Optimal Blue sells a pricing API. Ask them about it, and get written OK
   for automated use of your LoanSifter session before public use.
