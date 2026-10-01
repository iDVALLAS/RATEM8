# Pricing integration findings (Phase 0 discovery)

Researched 2026-10-01 for the pricing connector, MLO lender wizard,
state routing and rate sheet engine work (Patches A, B, C). No code was
written. This document informs the provider choice; the owner makes it.

## 0. How to read this document

**Evidence limit.** The build environment's network policy blocked direct
page fetches from every vendor, lender and regulator site we needed
(including `arive.com`, `support.arive.com`, `optimalblue.com`,
`polly.io`, `lenderprice.com`, `documenter.lenderprice.com`, `uwm.com`,
`pennymac.com`, `plazahomemortgage.com`, `ecfr.gov`,
`consumerfinance.gov`, `web.archive.org`). Only web search worked. Every
finding below is therefore based on **search-engine excerpts of the cited
pages, not on full pages read end to end.** Quoted wording is the search
index's rendering.

Tags used throughout:

| Tag | Meaning |
| --- | --- |
| **V\*** | Primary source (the vendor's or lender's own site, docs, licence, press release; eCFR; CFPB; a state code), seen only through a search excerpt. Re-read the full page before relying on it, especially legal clauses. |
| **R** | Reported by a secondary source (trade press, reseller, review site, third-party blog). |
| **U** | Unknown. No evidence found. Not filled in from general knowledge. |

All sources were accessed 2026-10-01. A page's own date is given where the
excerpt showed one.

**Lenders covered.** The owner's twelve lenders (see §0b). Rocket Pro
TPO and Angel Oak from the first pass are kept in §6b for reference only.

---

## 0b. Owner decisions recorded 2026-10-01

1. **Ryder Fasse** is currently under the same sponsoring entity as the
   principal MLO. **Sponsorship changes often**, so Patch B must treat it
   as data, not code:
   - Sponsorship is stored **per MLO, per state, with an effective date**
     (today the repo stores it per state only: Home Trust Loans for WA,
     CA and TX; Home Financial for AZ; see `lib/config.ts`).
   - It is editable from an **admin-only backend setting** (no deploy
     needed), with `lib/config.ts` as the seed and fallback. A one-line
     config edit also works for a session agent.
   - Every change is versioned and written to the audit log with who
     changed it and when.
   - `assign` vs `choose` routing per state is **derived** from those
     records at request time, never hand-set: if every MLO serving a
     state shares the platform operator's sponsor in that state, the state
     may `assign`; the moment one does not, it flips to `choose`.
   - The footer disclosure, MLO card and state license line read from the
     same resolved record, so a sponsor change updates every surface at
     once.
2. **Lenders in use (12):** UWM, The Loan Store, PRMG, Pennymac,
   Freedom Mortgage, REMN, Provident, Rise, HomeXpress, Newrez, Kind
   Lending, Plaza. §6, §8 and §12 cover these.

---

## 1. Bottom line

1. **No wholesale lender we checked offers a broker pricing API.** UWM,
   Rocket Pro TPO and Pennymac TPO price in their own portals and reach
   third-party software only through a product and pricing engine (PPE).
   The expectation in the brief is **confirmed**, with the caveat that
   only Provident, Newrez and Plaza publish a broker agreement.
2. **ARIVE has no pricing API.** Its only external interface is a
   private Zapier app for loan and lead data. Its terms prohibit
   automated access, scraping and framing, and bar giving its APIs to a
   "software vendor or technology provider" to build technology. A
   multi-LO platform (the v22 direction) sits close to that clause.
   ARIVE remains the PPE where UWM, Rocket and Pennymac are verifiably
   integrated.
3. **Two engines have a broker-usable pricing API:**
   - **Optimal Blue's Loansifter** (built for brokers, 120+ wholesale
     investors, broker pricing API "to be displayed to any users in any
     format desired", consumer Quick Quote widget). Optimal Blue sells
     anonymized broker search data, which conflicts with LoanM8's data
     promise unless an opt-out exists.
   - **Lender Price** (public OpenAPI docs, documented flags that return
     disqualified products with reasons, free broker Marketplace,
     consumer pricer widgets). Which wholesale lenders it carries is
     unconfirmed.
4. **For the owner's twelve lenders, ARIVE covers 11** (all but
   Provident). Lender Price has evidence for at most 6 and Loansifter for
   1 (REMN), all old or unconfirmed. Whether UWM, Pennymac, Freedom, The
   Loan Store and Kind are in Loansifter or Lender Price today is the fact
   that decides whether an API-first engine can carry the lenders in use.
5. **Rate sheets reach an inbox for only three of the twelve** (PRMG,
   Plaza, REMN), and **PRMG and Plaza state in writing that their sheets
   are not for consumers.** HomeXpress marks its sheets "broker use only."
   Provident's public broker agreement bars using its name in ads without
   consent and requires uniform broker compensation. UWM, Pennymac,
   Freedom, The Loan Store and Kind showed no distribution outside their
   portals. **Patch C cannot reach most of the twelve without written
   consent and distribution from each lender** (see §8).
6. **No vendor or lender publishes terms that clearly allow a broker's
   consumer site to show multi-lender pricing.** Every path needs written
   display rights.

---

## 2. ARIVE

### 2a. Zapier / API-key data export

- Private Zapier app, invite link only, not listed in Zapier's directory.
  Requires the **Broker Pro** or **Non-Del** plan. V\*
  ([support article 61000306081](https://support.arive.com/support/solutions/articles/61000306081-integrate-arive-with-your-zapier-account-crm-integration-))
- ARIVE support: "currently, the only way to connect a CRM or other
  third-party platform is via Zapier" and "currently, we do not offer
  open/direct API integration." V\* (same article)
- Admins click Generate to get a Client ID, Secret Key and API Key that
  "authenticate REST API calls from third-party systems to the ARIVE API
  gateway." Introduced in release v4.6. V\*
  ([v4.6 release notes](https://support.arive.com/support/solutions/articles/61000301317-arive-release-notes-v4-6))
- **Triggers:** New Loan, Loan Application Submitted in POS, Loan Status
  Updated, Loan Trackers Updated, Loan Archived, Loan Date Updated, New
  Lead, Lead Updated. V\*
  ([article 61000312645](https://support.arive.com/support/solutions/articles/61000312645-how-does-zapier-integration-work-))
- **Actions:** Create New Loan, Search All Loans, Get Loan Details,
  Update Loan Status, Adverse Loan. None prices a loan. V\*
- Get Loan Details returns status, key dates, financed fees, HCLTV,
  borrower contact fields and deep links; later releases added branch
  name (v2025.1.0.0) and LOA name plus tracker history (v2026.1.0.0). V\*
  ([article 61000273608](https://support.arive.com/support/solutions/articles/61000273608-what-data-can-be-communicated-through-zapier-),
  [v2026.1.0.0](https://support.arive.com/support/solutions/articles/61000317533-arive-release-notes-v2026-1-0-0))
- No public developer portal, OpenAPI spec or rate-limit documentation. U

### 2b. Pricing / quote API callable from a third-party server

- **Not found.** No pricing endpoint appears in any documented action or
  release note through v2026.3.0.0. U (treat as **no**)

### 2c. Consumer POS and embeddability

- POS lives at `https://[COMPANYNMLS].my1003app.com`; the URL can be
  changed in POS App Config, and ARIVE suggests linking it from your
  website. V\*
  ([article 61000272010](https://support.arive.com/support/solutions/articles/61000272010-customizing-your-los-pos-real-estate-agent-portal-login-urls))
- POS Themes and LOS white-label come with Broker Pro and Non-Del. V\*
  ([article 61000304131](https://support.arive.com/support/solutions/articles/61000304131-broker-pro-plan-features))
- After a lock, the LO can choose whether rate and lock details show in
  the borrower portal. V\*
  ([article 61000301615](https://support.arive.com/support/solutions/articles/61000301615-pos-application-configuration))
- No iframe, widget, embeddable pricing view or borrower self-serve
  pricing engine found. U
- Terms of Use prohibit framing the platform. V\* (see 2f)

### 2d. "Pricing Quotes" and "Realtor Pricing" share features

No features with those exact names were found. Closest documented
features:

- **Generate Comparisons & Quotes.** The LO prices against selected
  lenders, picks up to three products, then downloads a PDF or sends an
  email draft. Saved to the loan's Loan Quotes tab. A static PDF or
  email of the selected results only, not all lenders and not live. V\*
  ([article 61000301581](https://support.arive.com/support/solutions/articles/61000301581-generate-comparisons-quotes))
- **Real Estate Agent portal.** Co-branded, invite-only. With "Pipeline &
  Pre-Approval" access the agent can edit and send the pre-approval
  letter within LO-set limits; ARIVE says it will "instantly rerun
  pricing and eligibility scenarios." V\*
  ([article 61000302395](https://support.arive.com/support/solutions/articles/61000302395-using-the-realtor-real-estate-agent-portal))
  Whether the agent sees rates or only the letter: U
- **Rate alerts** go to the LO only, not the borrower. V\*
  ([article 61000306837](https://support.arive.com/support/solutions/articles/61000306837-set-rate-alerts))

### 2e. Can a broker's server price an arbitrary scenario?

- **No documented way.** Closest: create a loan through the Zapier/API
  action, then price it by hand in the PPE. V\*
- Plan, fee, approval and rate limits for any pricing API: U

### 2f. Terms relevant to this build (re-read in full before relying on them)

- **Terms of Use** ([arive.com/legal/terms-of-use](https://www.arive.com/legal/terms-of-use)) V\*
  - Prohibits "unauthorized automated means to access the Platform or
    collect any information… (including robots, spiders, scripts…)",
    "screen scraping," "database scraping," and framing.
  - Users represent they "will not use, any data provided by ARIVE to
    compete with the Service or any products or services offered by
    ARIVE."
  - No mirroring of ARIVE content beyond individual records; no
    sublicensing or disclosing the APIs to any third party.
- **Platform Subscription Agreement** ([arive.com/legal/platform-subscription-agreement](https://www.arive.com/legal/platform-subscription-agreement)) V\*
  - Contracting party ARIVE, LLC, a subsidiary of WIZNI, INC.
  - Licence is non-exclusive, personal, non-transferable,
    non-sublicensable, revocable; limited to "mortgage loan transactions
    with Consumers."
  - The Authorized User represents it is **not a software vendor or
    technology provider**, and will not use or provide the APIs to one
    "to build any technology or services, whether or not competitive."
  - Defines "Resultant Data" (de-identified derived data) and
    "Materials," which include data from ARIVE's monitoring of use.
- Effective dates seen: "May 1, 2022" and "February 21, 2023"; which
  date belongs to which document is unclear. U
- Display of ARIVE-sourced pricing on a broker's own consumer site,
  redistribution, retention: no specific clause found. U

### 2g. Cost and lender coverage

- Every plan includes LOS, POS and PPE with "unlimited pricing requests"
  and the Realtor Portal; Pro adds Zapier APIs, e-Sign, white-label and
  POS Themes. V\* ([arive.com/pricing](https://www.arive.com/pricing))
- Per-seat prices conflict between excerpts (Core Originator $49.99
  yearly / $59.99 or $79.99 monthly; Pro $69.99 / $79.99; Non-Del
  $99.99). Treat as unconfirmed.
- Integrated lenders include UWM, Rocket Pro (since 2025-04-22), Pennymac
  TPO (since 2023-06-28), Plaza, Kind Lending (17th, 2024-07-24),
  Freedom Wholesale, Newrez, and others; at least seven more announced in
  2026 (latest MLB Wholesale, 2026-09-23). V\*
  ([integrated lenders](https://support.arive.com/support/solutions/articles/61000271226-which-wholesale-lenders-are-integrated-with-arive-),
  [arive.com/press](https://www.arive.com/press/))
- **Manual lenders:** you get the price from the lender's portal and type
  it into ARIVE; "live pricing and electronic loan registration is not
  supported." No rate sheet upload found. V\*
  ([article 61000315421](https://support.arive.com/support/solutions/articles/61000315421-lenders-ppe-management))
- Whether the PPE returns ineligible products with reasons, or exports a
  full result set: U. Excerpts mention only "a list of eligible products."

---

## 3. Optimal Blue and Loansifter

- **Ownership correction.** Constellation Software's Perseus Group bought
  Optimal Blue from Black Knight in **2023** (announced 2023-07-17,
  closed 2023-09-15, US$700M), not 2025. V\*
  ([Optimal Blue, 2023-09-15](https://www2.optimalblue.com/optimal-blue-acquired-by-constellation-softwares-perseus-group))
- **Loansifter** is Optimal Blue's broker PPE: 6,000+ users, 120+
  wholesale investors, self-service sign-up, NMLS licence required. V\*
  ([www2.optimalblue.com/loansifter](https://www2.optimalblue.com/loansifter/))
- **API.** "Broker Product & Pricing APIs enable Loansifter Brokers to
  generate and display eligible products and pricing in any format." V\*
  ([www2.optimalblue.com/api](https://www2.optimalblue.com/api)). Developer
  portal on Azure API Management with Swagger docs, sign-up then approval,
  OAuth 2.0 client credentials. V\*
  ([api-developer-portal-and-documentation](https://www2.optimalblue.com/iq/api-developer-portal-and-documentation/)).
  Loansifter API launched 2022-10-05. V\*
- **Ineligible results.** The Loansifter UI has Eligible, Eligible with
  Other Prices and Ineligible tabs, with reasons. V\* The enterprise Best
  Execution API "returns all eligible and ineligible product." V\*
  Whether the **broker** API returns per-product reason codes: U.
  Results cover only investors the broker has access to, plus
  promotional investors. V\*
- **Rate sheets.** A Loansifter rate sheet generator exists. V\* (URL
  only). Machine-readable export through the API: U. Optimal Blue imports
  "over 45,000 investor rate sheets daily." V\*
- **Consumer display.** Quick Quote is a consumer widget "easily
  displayed on your broker website," $200/month add-on. V\*
  ([engage.optimalblue.com quick quote](https://engage.optimalblue.com/digital-hub-loansifter-quick-quote))
- **Licence** ([Loansifter Licensing & Use Agreement](https://www2.optimalblue.com/loansifter-licensing-use-agreement)) V\*
  - Mutual confidentiality ("shall not disclose... without prior written
    consent"). Whether investor pricing is Confidential Information: U.
  - Grants Optimal Blue a "perpetual, royalty free... license to use...
    any data and information provided to Optimal Blue by Customer."
  - Price may change at any time; annual increase of the greater of 3%
    or core CPI.
- **Data resale.** Optimal Blue sells a "Broker Search Data License"
  (about 1M rows a month of anonymized Loansifter search activity),
  announced 2025-10-16. V\* Scenarios LoanM8 sends through Loansifter
  would likely feed it. Opt-out: U.
- **Cost.** Loansifter about $79/user/month (R), Quick Quote $200/month
  (V\*), API about $100/month (R).
- Whether the owner's lenders (other than REMN) are among the 120+
  investors: **U**.

## 4. Polly

- PPE API exists ("lenders can programmatically run scenarios… a powerful
  tool for retail marketing sites"), announced 2022-08-25. V\*
  ([polly.io](https://polly.io/media/polly-extends-api-portfolio-to-empower-lenders-in-new-era-of-loan-delivery/))
  No public developer docs. U
- Built for banks, credit unions and lenders. **No direct broker
  subscription found;** brokers touch Polly only through a wholesale
  lender's portal that runs it (ResiCentral, New American Funding). V\*
- Ineligible products explained in the UI by an AI agent; API behaviour U.
- Cost: contact sales. V\*
- **Not a fit** for a broker unless a wholesale lender exposes its Polly
  instance to brokers.

## 5. Lender Price

- **Public API docs** at [documenter.lenderprice.com](https://documenter.lenderprice.com/):
  OpenAPI reference, pricing endpoint `/rest/v1/lp-ppe-api/pricing/`,
  server-to-server key and secret, IP allowlisting, UAT environment,
  200+ request fields. V\*
- **Disqualified products with reasons** via `showDisqualify=true` and
  `showDisqualifyRules=true`. V\*
  ([pricing options](https://documenter.lenderprice.com/guides/pricing-options-and-configuration))
- Consumer Pricers, Mini Pricers, Rate Tickers for websites. V\*
- **Broker Marketplace "100% free to the wholesale broker community."**
  Brokers can add their own lenders' comp and rate sheets and compare
  with Marketplace lenders. V\* ([Marketplace 2.0](https://lenderprice.com/lender-price-launches-marketplace-2-0-providing-wholesale-brokers-and-lenders-with-enhanced-pricing-capabilities-and-deal-intelligence/))
- Bulk Price API (2024-05-17) for servicers and lenders; broker access U.
- Cost: Marketplace free (V\*), API about $99/month with an account
  manager (R).
- Current Marketplace lender list and whether UWM, Rocket or Pennymac are
  on it: **U**. Licence terms on consumer or aggregator display: **U**.

## 5b. Others (one line each)

- **Mortech (Zillow):** public 3rd-party integration API under a
  Partner/MSA; serves bankers, credit unions, correspondents and wholesale
  lenders, brokers not listed; Online Quoting from $400/month. V\*
- **LoanPASS:** public Swagger API and iframe Quick Pricer;
  lender-configured; broker availability U.
- **Lodasoft:** workflow platform on top of Optimal Blue, not an engine. V\*

---

## 6. The owner's twelve lenders

Second research pass, 2026-10-01, same evidence limits as §0 (search
excerpts only; several searches hit the per-session limit, noted as U).

### 6a. Coverage at a glance

| Lender | ARIVE | Lender Price | Loansifter | Other engines | Direct broker API |
| --- | --- | --- | --- | --- | --- |
| UWM | Yes (V\*) | Named in a Lender Price lender list (R) | U | LendingPad: registration and conditions only, April 2026 (V\*) | **No.** The "UWM Portal" (2023-05-04) is a two-way loan-data link to EASE, not a rate feed (V\*) |
| The Loan Store | Yes, pricing and submission (V\*) | Named in a Lender Price lender list (R) | U | Own portal on ICE Encompass TPO Connect (V\*) | None found |
| PRMG | Yes, with loan sync (V\*); 2019 partnership (title only) | Named in a Lender Price lender list (R) | U | ReadyPrice lender page (title only); own "LEO" portal | None found |
| Pennymac TPO | Yes since 2023-06-28 (V\*) | Joined 2019-12-16 as "Pennymac Broker Direct"; current status U | U | POWER+ portal | None found |
| Freedom Wholesale | Yes since 2025-01-21; "prospect pricing" visible before approval (V\*) | U | U | Calyx Point (R) | None found |
| REMN (division of Homebridge) | Yes since 2022-03-21 (V\*); current status unconfirmed | **Yes, per REMN's own page (undated)** (V\*) | **Yes, per REMN's own page (undated)** (V\*) | "The Hub" portal | None found |
| Provident Funding | **No evidence** | **Joined 2021-04-08** (V\*); current status U | U | Own broker app with pricing matrix (V\*) | None found; public HTML rate pages exist (see 6b) |
| RISE TPO (OCMBC, dba) | Yes since 2026-03-11 (V\*) | U | U | Sister brand LoanStream: "The Lounge" portal | None found |
| HomeXpress | Yes since 2026-02-26 (V\*) | U | U | Own X-CONNECT engine; "Xpress Quick Pricer" for professionals (V\* / R) | None found |
| Newrez Wholesale | Yes (V\*) | U | U | Own "Blueprint" portal with product and pricing (V\*) | None found |
| Kind Lending | Yes since 2024-07-24 (V\*) | Indirect at best: LendingPad (which runs Lender Price) says "real-time pricing" in a 2025-08-13 release but "registration only" in its help article (V\*, conflicting) | U | "Kwikie" portal | None found |
| Plaza | Yes (V\*) | U | U | Calyx Wholesaler MarketPlace, lock confirmations (R); own BREEZE system | None found; agreement limits tool use |

**Read-out**

- **ARIVE covers 11 of the 12.** Only Provident has no ARIVE evidence.
- **Lender Price has evidence for at most 6** (Provident, Pennymac, REMN
  directly; UWM, The Loan Store, PRMG only in an unattributed list), and
  every one is old or unconfirmed today.
- **Loansifter has evidence for 1** (REMN, undated). Its investor list is
  not public, so absence is not proof.
- **No lender of the twelve publishes a broker pricing API.** Confirmed
  again.

### 6b. Rate sheets and terms, lender by lender

**UWM**
- Channel: EASE portal with the EQ engine; app "Morning Rates" and "Daily
  Rates" alerts (V\*). No public sheet, email list or file format found. U
- Cadence: "two, three, or even four different rate sheets in a day" (R).
- Terms: broker agreement and the 2021 "All-In" addendum are not public.
  Press reports penalties of "$5,000 per loan or $50,000, whichever…
  greater" for sending loans to certain competitors (R,
  [HousingWire](https://www.housingwire.com/articles/uwm-sues-broker-shop-for-sending-loans-to-rocket-fairway/)).
  Brand 360 / Brand Builder co-marketing reportedly allows "custom pricing
  scenarios" on broker materials (R).

**The Loan Store** (The Loan Store, Inc., Tucson, AZ)
- Channel: TLS portal (ICE Encompass TPO Connect); lock desk
  lockdesk@tlstpo.com (V\*). No public rate sheet sign-up found. U
- Terms: no public broker agreement or site terms found. U
- Licensing page shows AZ and CA licence numbers and references WA and TX
  (V\*).

**PRMG** (Paramount Residential Mortgage Group, Corona, CA)
- Channel: **free email subscription** for the Daily Rate Sheet at
  [tpo.prmg.net/rate-sheet-form/](https://tpo.prmg.net/rate-sheet-form/),
  with "price alerts to get notified of sudden market changes" (V\*).
- **Terms on the sign-up page: the service "is intended for use by real
  estate and mortgage lending professionals only and not for distribution
  to consumers as defined by Section 226.2 of Regulation Z"** (V\*).
- Co-branding marketing portal (R). Broker agreement not public. U

**Pennymac TPO**
- Channel: POWER+ portal. A "Ratesheet View Only" email role is documented
  for **correspondent** clients; whether brokers get it is U.
- Portal locks 7:00 AM to 11:59 PM PT daily; lock desk 7 to 5 PT (V\*).
- Site terms: "for informational purposes only," copyright reserved (V\*,
  [tpo.pennymac.com/terms-of-use](https://tpo.pennymac.com/terms-of-use)).
  Broker agreement not public. U

**Freedom Mortgage Wholesale**
- Channel: freedomwholesale.com portal; ARIVE "prospect pricing" (V\*).
  Rate sheet distribution, format and terms: U.

**REMN Wholesale** (a division of Homebridge Financial Services, NMLS 6521)
- Channel: **daily rate sheet subscription**; broker-portal rate sheet page;
  access through remnlock@remn.com (V\*). A 2012 public PDF shows PDF format;
  current format U.
- Pricing "on daily rate sheets or via Loansifter & Lender Price" (V\*,
  undated).
- Terms: none public. U

**Provident Funding** (Provident Funding Associates, L.P., NMLS 3821)
- Channel: **search-indexed HTML rate pages**, e.g. "Wholesale Daily Rate
  Snapshot (California)" posted "08/10/2026 7:22:47 AM PT" on
  clp.provident.com, and "Live Wholesale Mortgage Rates" on
  pfloans.provident.com (V\*). Whether they need a login is U.
- Rates post "at approximately 8:00 AM PST each business day"; intraday
  changes possible (V\* / R,
  [Rate Lock Policy](https://www.provident.com/RateLockPolicy)).
- **Loan Origination Agreement, Rev 1-07-19** (public PDF, V\*):
  non-exclusive; the broker shall not "use Provident Funding's name in any
  advertising without Provident Funding's express prior written consent";
  **broker fees "may not exceed the uniform compensation level"** set on
  Provident's broker website, and the broker "shall not charge or collect
  different amounts of fees from different borrowers on a loan-by-loan
  basis."
- Name confusion: provwholesale.com and myprovident.com are different
  Provident banks.

**RISE TPO** (a dba of OCMBC, Inc., Irvine, CA; sister brand of LoanStream)
- Channel: [risetpo.com/rates/](https://risetpo.com/rates/) lists downloads
  for Prime & Jumbo, HELOC, Non-QM and Closed-End Seconds (V\*); login U.
- Sister brand LoanStream posts public, time-stamped PDFs such as
  "Wholesale-Ratesheets-08.18.2026_07.58am.pdf" and "…-REPRICE.pdf" (V\*).
  Whether RISE does the same: U.
- Terms: none public. U

**HomeXpress Mortgage Corp** (non-QM; acquired by Chimera 2025-10-01, R)
- Channel: public PDFs under homexmortgage.com/wp-content/uploads; newest
  indexed April 2024 (V\*). Current 2026 sheets U.
- Sheets read "FOR WHOLESALE AND LOAN BROKER USE ONLY" and "does not
  constitute a commitment to lend" (V\*).
- **Broker Package:** agreement terms "shall be kept confidential"; no
  licence to use the HomeXpress name or logo "unless specifically granted
  in writing" (V\*). Offers white-label marketing materials (V\*, source
  unclear).

**Newrez Wholesale**
- Channel: Blueprint portal (user guide v8, 07/31/2026) (V\*); lock desk to
  8 pm ET; Pricing Dept wholesale.pricing@newrez.com (V\*).
- **Broker Agreement** (public PDF, revision U): non-exclusive; "Pricing
  Sheet… subject to change without notice" (V\*). No confidentiality or
  name-use clause seen in the excerpts. The **correspondent** guide does
  require written consent to use Newrez's name; whether brokers are bound
  the same way is U.

**Kind Lending**
- Channel: Kwikie portal; locks until midnight PST (V\*). No public rate
  sheets, agreement or terms found. U

**Plaza Home Mortgage**
- Channel: **email sign-up** at plazahomemortgage.com/RateSheetSignup/
  (cited in Plaza's lock policy, V\*); a **public PDF at a fixed URL**,
  Plaza_SLC_Rates.pdf, apparently overwritten in place (recent copy shows
  May 2026 index values) (V\*).
- **The public PDF says it is "for the use of approved mortgage lenders only
  and is not intended for distribution to consumers"** (V\*).
- Intraday: "When Plaza is re-pricing or preparing new rate sheets, website
  transactions will be disabled" (V\*, Wholesale Broker Guide, itself marked
  "confidential, proprietary").
- **Master Wholesale Broker Agreement WH-AG-001 rev. 15:** no use of Plaza's
  name in advertising without written consent; pricing tools only for bona
  fide quotes, locks and registrations for loans the broker intends to
  deliver to Plaza; mutual confidentiality (V\*).
- Private Label marketing materials available after login (V\*).

### 6c. Reference only (first pass, not on the owner's list)

- **Rocket Pro TPO:** ARIVE since 2025-04-22; portal calculator; app use only
  "as a bona fide client" (V\*).
- **Angel Oak:** public web QuickPricer, no API (V\*).

**Verdict:** almost always through a pricing engine. **Confirmed** for all
twelve.

**Industry cadence:** one sheet around 10am ET, intraday reprices when bonds
move (R, [mortgagenewsdaily.com](https://www.mortgagenewsdaily.com/mortgage-rates)).
Provident posts about 8am PT; LoanStream's file names show about 8am.

---

## 7. Capability matrix

| Provider | Programmatic pricing | All lenders incl. ineligible (with reasons) | Rate sheet export | Consumer display allowed per ToS | Broker availability | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| **ARIVE** | **No** (Zapier loan/lead data only; scraping banned) | U (only "eligible products" documented) | No (manual lenders typed in) | **U, leaning no** (framing banned; "technology provider" clause) | **Yes** (broker LOS/POS/PPE; 11 of the owner's 12 lenders integrated) | $49.99 to $99.99/seat/month (unconfirmed) |
| **Loansifter (Optimal Blue)** | **Yes** (broker API) | Partial (UI yes with reasons; API reasons U; broker's investors only) | Partial (rate sheet generator; API export U) | **Partial** (Quick Quote widget allowed; third-party aggregator use U; confidentiality clause) | **Yes** (120+ wholesale investors; NMLS required) | ~$79/user (R) + API ~$100 (R) + Quick Quote $200 (V\*) |
| **Lender Price** | **Yes** (public OpenAPI) | **Yes** (`showDisqualify`, `showDisqualifyRules`) | Partial (Bulk Price API; broker access U) | Partial (widgets exist; ToS U) | **Yes** (free Marketplace; lender list U) | Marketplace free (V\*); API ~$99 (R) |
| **Polly** | Yes for lenders (no public docs) | Partial (UI/AI; API U) | Lender's own sheets only | Partial (retail-site use; ToS U) | **No** direct broker access | Contact sales |
| **Optimal Blue enterprise PPE** | Yes | Yes (ineligible returned) | Historical Pricing API only | Partial (Lead-Quoting API) | U (lender product) | Contact sales |
| **Mortech** | Yes (Partner/MSA) | U | Yes (R) | Yes for quoting partners | U (brokers not listed) | From $400/month |
| **Direct lender API** (all twelve lenders) | **No** (none found for any) | n/a | Email for PRMG, Plaza, REMN; public pages for Provident, HomeXpress, RISE; portal only for the rest | Restricted in writing by PRMG, Plaza, HomeXpress; rest U | n/a | n/a |
| **Rate sheets (Patch C)** | Yes, in our own code | Yes, by our own rules | Only where a lender emails or posts sheets | **Needs written consent per lender** | Depends on each lender's distribution | Engineering cost |

---

## 8. Rate sheets: what the twelve mean for Patch C

| Lender | How a sheet could reach `ratesheets@` | Consumer-display language found |
| --- | --- | --- |
| PRMG | **Email subscription exists** | **"not for distribution to consumers"** |
| Plaza | **Email sign-up exists**; public PDF | **"not intended for distribution to consumers"**; confidential guide; agreement limits tool use |
| REMN | **Subscription exists** | None found |
| Provident | Public HTML snapshot pages | None found on display; **uniform comp** and **name-consent** clauses |
| HomeXpress | Public PDFs (stale in index) | **"broker use only"**; confidential agreement; name/logo consent |
| RISE TPO | /rates/ downloads | None found |
| Newrez | "Pricing Sheet" issued periodically | None found for brokers |
| UWM, Pennymac, Freedom, The Loan Store, Kind | Portal only as far as public evidence shows | Agreements not public |

**What this means**

1. **Technically reachable by email today: PRMG, Plaza, REMN.** Two of those
   three (PRMG and Plaza) say in writing that their sheets are not for
   consumers. Computing a consumer-facing price from those sheets needs each
   lender's written consent first.
2. **Provident's sheet is easiest to read but has a pricing rule:** its
   uniform-compensation clause means any displayed Provident price must
   carry the same broker compensation for every borrower. That fits a
   flat-comp display, but the build must not vary comp by borrower for
   Provident.
3. **The five biggest by likely volume (UWM, Pennymac, Freedom, TLS, Kind)
   showed no rate sheet distribution outside their portals.** Patch C cannot
   cover them without the lender adding `ratesheets@` to a list, and no
   portal automation is allowed (brief rule, and every visible portal term
   restricts it).
4. **Anti-steering safe harbor needs at least three creditors per loan
   type.** For agency conforming 30- and 15-year fixed (Patch C's v1 scope),
   the rate sheet path could realistically reach PRMG, Plaza, REMN and
   Provident, and only with written consent from each. That is enough for
   the safe harbor only if at least three say yes.
5. Portal scraping stays out of scope.

---

## 9. Regulatory notes that shape the build (for counsel)

- **Reg Z 1026.24(b):** an ad may state only terms that "actually are or
  will be arranged or offered." Relevant to the "example pricing" demo:
  counsel approved it, but the approval should cover this section
  explicitly. V\* ([eCFR 1026.24](https://www.ecfr.gov/current/title-12/chapter-X/part-1026/subpart-C/section-1026.24))
- **1026.24(c):** a stated rate must be accompanied by the APR, using that
  term. **1026.24(d):** payment, term or down-payment figures trigger
  further disclosures. **1026.24(i):** no misleading "fixed" or
  short-period rate comparisons. V\*
- **Anti-steering safe harbor, 1026.36(e)(3):** options from a significant
  number of creditors the originator regularly does business with (three
  or more, or all if fewer), presented for each type of loan the consumer
  is interested in: (A) the lowest interest rate; (B) the lowest interest
  rate without negative amortization, a prepayment penalty, interest-only
  payments, a balloon payment in the first 7 years, a demand feature,
  shared equity or shared appreciation; (C) the lowest total dollar amount
  of discount points, origination points or origination fees. The
  originator must believe in good faith the consumer likely qualifies for
  each. V\* ([eCFR 1026.36](https://www.ecfr.gov/current/title-12/chapter-X/part-1026/subpart-E/section-1026.36))
  *Check on eCFR:* the search excerpt listed fewer risky features and put
  points second; the list and order above follow the regulation text as
  commonly cited and match the brief's three cards.
- **Reg N 1014.3:** no misrepresenting rates or APR. **1014.5:** keep for
  24 months the materials describing all products available when each ad
  ran. V\* This supports storing every pricing snapshot immutably.
- **Washington, WAC 208-660-440:** APR at least as prominent as any rate;
  when a specific rate is advertised, keep the supporting rate information
  and the APR calculation. V\*
  ([leg.wa.gov](https://lawfilesext.leg.wa.gov/Law/WAC/WAC%20208%20%20TITLE/WAC%20208%20-660%20%20CHAPTER/WAC%20208%20-660%20-440.htm))
- **Arizona, A.R.S. § 6-909:** no false or misleading statements about
  rates; rates set out to "prevent misunderstanding." R (third-party copy
  of the statute; confirm numbering on azleg.gov).
- **California, 10 CCR § 2848 (DRE):** a payment amount requires equally
  prominent principal, rate, APR, term and balloon; ads filed on RE 884.
  V\* Rules for DFPI (CFL/CRMLA) licensees: U.
- **Texas:** 7 TAC § 81.200 was repealed 2024-11-23; rules now in 7 TAC
  chapters 55 and 56 (§ 56.203). Ads must show company name and NMLS ID
  and the sponsored originator's name and NMLS ID, and only available
  terms. V\* / R. This matters for Patch B: every page that shows a rate
  in Texas needs the MLO identity resolved correctly.

---

## 10. Questions to email ARIVE

Subject: Display rights, full results and programmatic access for a broker-owned consumer site

1. Is there any API or partner programme that lets a broker's own server
   request PPE pricing for an arbitrary scenario? If so: endpoint, plan
   tier, fee, approval process, rate limits and terms.
2. We are a licensed broker building our own consumer website with an AI
   assistant. Do the Platform Subscription Agreement's "software vendor or
   technology provider" clause and the Terms of Use "compete" clause apply
   to us? Will you give written authorization for this use?
3. May we show ARIVE-sourced rates and prices to consumers on our own
   site, with lender names anonymized? Under what conditions (disclaimers,
   refresh frequency, lender consent, attribution)?
4. If other licensed loan officers subscribe to our software and connect
   their own ARIVE accounts, is that permitted, and under what agreement?
5. Does the PPE return ineligible products and lenders with reasons? Can
   the full result set (eligible and ineligible) be exported as CSV or
   JSON, or retrieved through the API?
6. Is there a rate sheet upload for manual lenders, or only manual entry?
7. Can the POS or any pricing view be embedded (iframe or widget) on an
   external domain?
8. Can a Pricing Quote be shared as a live link rather than a PDF? What
   can a Realtor-portal user see: rates and prices, or only the letter?
9. How long does ARIVE retain scenario and pricing data, and how is it
   used (Resultant Data, analytics, any resale)? Can a broker opt out?
10. Current plan prices, and which plan includes the API keys?
11. Authoritative list of integrated lenders today.
12. Zapier and API call limits, and the full field lists for Get Loan
    Details and Create Loan.
13. Which versions and dates of the Terms of Use and Platform Subscription
    Agreement are in force?

## 11. Questions for Loansifter and Lender Price

**Optimal Blue / Loansifter**
1. May a broker's Loansifter API results appear on the broker's own
   consumer site with an AI assistant, showing all of that broker's
   investors side by side (anonymized)?
2. Is investor pricing "Confidential Information" under the licence?
3. Does the broker API return ineligible products with machine-readable
   reason codes? Please send the response schema.
4. Are UWM, Rocket Pro TPO and Pennymac TPO available to a small broker?
5. Are a broker's searches included in the Broker Search Data License,
   and can a broker opt out?
6. Current API fee and rate limits.

**Lender Price**
1. Do free Marketplace brokers get API access, or only paid customers? Is
   it still about $99/month?
2. Which wholesale lenders are on the Marketplace today? Are UWM, Rocket
   Pro TPO and Pennymac TPO among them?
3. Are lenders a broker adds through its own rate sheets returned through
   the API?
4. Do the licence terms allow consumer display of multi-lender results on
   a broker's own site, anonymized?

## 12. Draft per-lender display-rights email

Send from the sponsoring brokerage to each lender's account executive.
Fill the bracketed fields.

> Subject: Rate sheet distribution and consumer display permission —
> [Brokerage legal name], NMLS #[entity NMLS]
>
> Hi [AE name],
>
> We're an approved broker with [Lender] and are building a consumer
> website where borrowers can compare example and, later, live pricing
> from several of our wholesale lenders. Before we build anything that
> touches your pricing, we want your written position on the following.
>
> 1. **Distribution.** How are your broker rate sheets delivered (email
>    list, portal download, SFTP)? In what format (PDF, Excel, CSV)? Can
>    we add a dedicated address, `ratesheets@[domain]`, to your daily and
>    intraday distribution?
> 2. **Reprices.** When is your first daily sheet, how are intraday
>    reprices announced, and does a reprice invalidate quotes already in
>    progress?
> 3. **Consumer display.** May we show consumers rates and prices that our
>    software computes from your rate sheets? Each one would show the APR,
>    points, fees, lock period, the scenario assumptions, and the sheet's
>    effective time, and be labelled as a dated snapshot, not a quote or
>    commitment to lend.
> 4. **Naming.** We plan to show lenders anonymized ("Lender A"), not by
>    name. Does that change your answer? If we ever named you, what
>    consent and review would you require?
> 5. **Confidentiality.** Does our broker agreement treat your rate sheets
>    as confidential? If so, does consumer display under (3) and (4) fall
>    within what's permitted?
> 6. **Automated processing.** Is automated parsing of rate sheets you send
>    us permitted? We will not log in to your portal with automated tools.
> 7. **Comparison.** Do our agreement or any addendum limit showing your
>    pricing next to other lenders' pricing?
> 8. **APIs.** Do you offer brokers any pricing API or data feed, and
>    through which pricing engines is your pricing available (ARIVE,
>    Loansifter, Lender Price, Polly, other)?
> 9. **Agreement.** Could you send a current copy of our broker agreement
>    and any advertising or co-marketing guidelines?
>
> We'd appreciate a written reply we can keep on file. Thank you.
>
> [Name], [title]
> [Brokerage legal name], NMLS #[entity NMLS]

### 12b. Lender-specific additions to the email

Add the matching line to each lender's copy of the email above.

- **UWM:** Does the current broker agreement or All-In addendum limit how we
  show UWM pricing next to other lenders? Can UWM Portal API keys return
  pricing? Can Brand Builder pricing scenarios appear on our site? Is UWM
  priced in Loansifter, Lender Price or LendingPad?
- **The Loan Store:** Which engine powers your TPO Connect pricer? Are you
  still live in Lender Price? Is there a rate sheet email list?
- **PRMG:** Your rate sheet sign-up says the sheet is "not for distribution to
  consumers." Would computing an anonymized, dated example or live price from
  it, shown with APR, fall under that restriction? Does it also apply to
  pricing pulled through ARIVE or LEO? What triggers a price alert?
- **Pennymac:** Is the Lender Price listing still live under Pennymac TPO? Do
  brokers on POWER+ get the "Ratesheet View Only" email role? Please send the
  TPO broker agreement and lock policy.
- **Freedom:** What does the Calyx Point integration cover? May ARIVE
  "prospect pricing" be shown publicly? Is there a rate sheet subscription?
- **REMN:** Are you still integrated with ARIVE, Loansifter and Lender Price
  today? Is "Platinum" pricing tiered by broker, and may tiered pricing be
  displayed? Do Homebridge group policies govern REMN's advertising terms?
- **Provident:** Are the clp.provident.com and pfloans.provident.com rate
  pages meant to be public, and may a broker read them automatically? How does
  the uniform-compensation rule apply to a site showing example pricing? Is
  the Lender Price listing active, and is there an ARIVE integration? Please
  confirm WA, AZ and TX licensing.
- **RISE TPO:** Is RISE replacing LoanStream's wholesale channel, and does the
  LoanStream broker agreement carry over? Does /rates/ need a login? Do you
  publish REPRICE files the way LoanStream does?
- **HomeXpress:** Are the public rate sheet PDFs current? Is there a 2026 email
  list? Did anything change after the Chimera acquisition? Please send the
  current broker agreement and the full trademark clause.
- **Newrez:** Is the posted Broker Agreement PDF current, and what is its
  revision date? Does a name-use or confidentiality clause like the
  correspondent guide's apply to brokers? Is there a rate sheet email list?
- **Kind:** Does the LendingPad integration return pricing or registration
  only? Are rate sheets distributed outside Kwikie, and in what format?
- **Plaza:** Is Plaza_SLC_Rates.pdf meant to be public, and how often is it
  overwritten? Does an anonymized example or live price on our site count as a
  "bona fide request for price quotes" under WH-AG-001 rev. 15, or does it need
  written consent? Can Private Label materials name Plaza?


---

## 13. Decision inputs for choosing the provider path

These are inputs, not a decision.

| Path | Strengths | Blockers to clear first |
| --- | --- | --- |
| **ARIVE as source** | Already the brokers' PPE; carries 11 of the owner's 12 lenders | No pricing API; scraping and framing banned; "technology provider" clause; needs written authorization (§10 Q1–4) |
| **Loansifter API** | Broker-focused, 120+ investors, display "in any format," consumer widget precedent | Only REMN of the 12 has evidence; investor list U; confidentiality clause; search-data resale vs LoanM8's data promise; written OK for consumer AI display (§11) |
| **Lender Price API** | Public docs; ineligible results with reasons built in; free Marketplace; broker rate sheets supported | At most 6 of the 12 with evidence, none confirmed current; licence display terms U; API access for free tier U (§11) |
| **Native rate sheets (Patch C)** | Full control; no vendor terms | Only PRMG, Plaza, REMN reach an inbox, and two of them bar consumer distribution; needs written consent per lender (§12); heaviest engineering |
| **Mock only (A0)** | Ships now, no third-party terms | Counsel sign-off should cover Reg Z 1026.24(b) for example rates |

A path that works with the evidence so far: ship A0 on the mock
provider; send §10, §11 and §12 in parallel; pick the live source from
whichever replies first grant written display rights covering the lenders
you actually use. The adapter layer in A1 is the same either way.

---

## 14. Re-verification checklist

Because pages were read through search excerpts only, open these in a
browser before anyone relies on them:

- [ ] ARIVE Terms of Use and Platform Subscription Agreement (full text, dates)
- [ ] ARIVE Zapier support articles 61000306081 and 61000312645
- [ ] Loansifter Licensing & Use Agreement (confidentiality, data licence)
- [ ] Optimal Blue Broker Search Data License announcement (2025-10-16)
- [ ] Lender Price pricing-options guide (`showDisqualify`, `showDisqualifyRules`)
- [ ] Plaza Master Wholesale Broker Agreement WH-AG-001 rev. 15, Wholesale Broker Guide, Plaza_SLC_Rates.pdf
- [ ] PRMG rate sheet sign-up page (consumer-distribution wording)
- [ ] Provident Loan Origination Agreement Rev 1-07-19 and Rate Lock Policy
- [ ] HomeXpress Broker Package (confidentiality and trademark clauses)
- [ ] Newrez Broker Agreement (full text, revision date)
- [ ] REMN page stating pricing "via Loansifter & Lender Price" (date)
- [ ] eCFR 1026.24, 1026.36, 1014.3, 1014.5
- [ ] WAC 208-660-440; A.R.S. § 6-909 on azleg.gov; 10 CCR § 2848; 7 TAC § 56.203
