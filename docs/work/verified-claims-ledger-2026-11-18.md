# Verified claims ledger (Command Center, 2026-11-18)

This combines the seven research topics with the reviewer notes. Each claim appears once, and where two sources disagreed the stronger reading is kept. Pure product-feature claims about competitors are left out; their terms, disclosure policies and litigation are included.

**Status key**
- **verified**: primary text read this session.
- **contradicted**: the primary text says otherwise than the plan or a finding.
- **partly**: part of it was read, or the application to Command Center is inference.
- **unverified**: from memory, or the host was blocked.

**Code checked this session:** I re-grepped three items myself.
- `lib/contacts/service.ts:25-28`: every non-`lo` role sees all contacts.
- `lib/today/rank.ts:58,78`: the reply and rate_gap card reasons.
- `lib/concierge/agent.ts:52,103,124,126,261`: the "ignore it" line, the reason sitting in the trusted header, `fallbacks: "default"`, `cache_control` and the skip rule for stopped contacts.

## A. TCPA and FCC

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| FCC 26-67 exists, was published at 91 FR 67214 on 2026-10-26, and takes effect 2026-11-25 | verified | Adopted 9/30/2026, released 10/1/2026, effective 11/25/2026. It replaces the delayed revoke-all date of 2027-01-31 and the FCC refused a 12-month delay. The full order (FCC-26-67A1.pdf) was not opened (403). | https://www.govinfo.gov/content/pkg/FR-2026-10-26/pdf/2026-21821.pdf | Change "unverified single source" to verified in docs/work/command-center-final-form-2026-11-18.md (~l.143) and command-center-ideas-overnight-2026-11-18.md (~l.1020), and log it in PATCHLOG. |
| A caller that names an exclusive revocation method must still honor "any reasonable means" (current wording in the plan docs) | contradicted | New (a)(10): a caller that names an exclusive method "is not required to process revocation requests made by any other means". Only callers that name no method must honor any reasonable means ((a)(11)). | same | Fix the doc wording. Do **not** name an exclusive method. Keep any-reasonable-means as a deliberate rule and log `revocation_basis: any_reasonable_means` on every opt-out. |
| A revocation in reply to marketing ends all marketing; one in reply to an informational message can be limited to that category | verified | Rule text as summarised. One-way texting still has to say it is one-way and give other ways to opt out. | same | Keep D4/D3's rule that a STOP ends service and marketing (gate.ts ~l.108). Don't adopt category scoping. |
| New (a)(12): the opt-out confirmation text | verified | "One-time" and the permission to ask a clarifying question are both gone. The text must "merely confirm" with no marketing. The 5-minute presumption stays. | same; https://www.ecfr.gov/api/versioner/v1/full/2026-11-16/title-47.xml?part=64&section=64.1200 | Confirmation template: no question, no "reply START", no marketing. Test that any second outbound to that phone is BLOCKED. |
| Revocations must be honored within 10 business days | verified | Kept in both (a)(10) and (a)(11). | same | Make the deadline a setting that can drop below 10 (we act at once). |
| FNPRM 91 FR 67239: shorter honor window, two-way texting, one-step revoke-all, affiliates | verified | Comments due 2026-11-25, replies 2026-12-28. | https://www.govinfo.gov/content/pkg/FR-2026-10-26/pdf/2026-21820.pdf | Optional co-op reply comment, after antitrust counsel. Plan for mandatory revoke-all and two-way texting. |
| Until 11/24 the rule says callers "may not designate an exclusive means" | verified | eCFR 2026-11-16, (a)(10)-(11). Voicemail or email to the caller creates a presumption of revocation. | eCFR URL above | None. It confirms the current gate is lawful. |
| Federal quiet hours are 8 a.m.–9 p.m. at the called party's location, and they cover texts | verified | 64.1200(c)(1) and (e). The "telephone solicitation" definition excludes permission and EBR calls. | eCFR URL above | Gate default 9–20 already covers it. |
| EBR lasts 18 months after a transaction or 3 months after an inquiry, exempts only from DNC rules, and a seller-specific DNC request ends it | verified | 64.1200(f)(5). Autodialed or AI-voice marketing still needs prior express written consent (PEWC) under (a)(2). | eCFR URL above | Make EBR its own consent tier that unlocks only live, hand-dialed calls. Never in CT, never for WA texts. |
| The one-to-one consent rule is gone | verified | Vacated; mandate issued 2025-04-30 and text removed 2025-08-29 (90 FR 42137). The current PEWC definition has no one-to-one language. | https://www.federalregister.gov/documents/2025/08/29/2025-16641/ | Remove any doc wording that calls it a federal requirement. Keep single-seller consent naming the MLO and the sponsor (needed for CT, FTSA and Twilio). |
| FCC rulings do not bind district courts (McLaughlin v. McKesson, 606 U.S. 146) | partly | The holding is verified. Its effect on 26-67 designations is inference. | https://www.supremecourt.gov/opinions/24pdf/606us1r55_3d9g.pdf | Another reason not to name an exclusive method. |
| AI-generated voice counts as "artificial or prerecorded voice" | verified | FCC 24-17 says the restriction covers "current AI technologies that generate human voices". | https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf | No AI voice calls to clients without PEWC. Client-facing AI voice stays out of the seat. |
| FCC 24-84 NPRM on disclosing AI-generated calls | unverified | From memory; docket status not checked. | — | Any AI-voice consent names "AI-generated voice" separately, and calls disclose AI first. Check the docket before any voice tier ships. |
| Reassigned Numbers Database safe harbor, 64.1200(m) | unverified | From memory; the eCFR fetch was blocked. | — | Query the database before the first contact on any number whose consent or last two-way contact is more than 90 days old, and log the result. |
| After Facebook v. Duguid, texting platforms may fall outside the federal ATDS definition | unverified | From memory. FTSA, WA CEMA and Twilio PEWC rules don't depend on it. | — | Add "not relying on non-ATDS status" to the never-list. |

## B. State telemarketing and commercial messages

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| CT: sales calls and texts only 9 a.m.–8 p.m., and **any** telephonic sales call needs prior express written consent | verified | CGS 42-288a(c) and (l). Applies to a CT resident or a CT area code. PEWC must name the means and the number. Exclusions: the consumer's own request, an existing customer, an open debt or contract. There is no 3-month inquiry window. 10-second identity and stop rules. Up to $20k per violation. | https://prdext3.cga.ct.gov/2025/pub/chap_743m.htm | Hard CT rule in lib/send-gate: marketing on any channel needs signed PEWC naming means and number. Put the 10-second steps into the call-flow state machine. Replace "(reported; counsel to confirm)" with the citations. |
| VA: 8 a.m.–9 p.m.; texts to VA numbers or residents count; opt-outs last 10 years | verified | 59.1-510, -511, -512, -514, -515. Consent needs a signed agreement naming the party and the number. EBR doesn't survive an earlier stop. Damages $500, $1,000, then $5,000. | https://law.lis.virginia.gov/vacode/title59.1/chapter44/section59.1-514/ | Add a VA row (first and last name plus seller name on calls). The effective date of 2025 c. 626 is unverified. |
| TX SB 140 brings texts into "telephone solicitation" and adds DTPA remedies | verified | Effective 2025-09-01. | https://capitol.texas.gov/tlodocs/89R/billtext/html/SB00140F.htm | Keep the Texas gate fail-closed. |
| TX ch. 302 registration applies to brokers; exemptions are unclear | partly | Statute verified: a certificate per location, $10k bond, scripts filed. Exemptions (302.053(4), 302.058(2), 302.061) carry the burden of proof (302.051). 302.203 bars telling consumers about compliance with the chapter. | https://tcss.legis.texas.gov/resources/BC/htm/BC.302.htm | Per-sponsor "TX ch. 302 status" switch, OFF by default, turned on by a certificate upload or a counsel memo. check:copy bans "registered/compliant" claims to TX consumers. |
| TX hours 9–9 Mon–Sat and noon–9 Sunday; TX no-call list | verified | Bus. & Com. 301.051, 304.052 (60 days after listing; includes TX numbers on the national registry). | https://tcss.legis.texas.gov/resources/BC/htm/BC.304.htm | Add a TX no-call scrub. Hours are already covered. |
| FL: the 8–8 window and 3-per-24h cap are in the FTSA | contradicted | They are in the Telemarketing Act, 501.616(6), counted "regardless of the phone number used". Whether they reach exempt sellers and texts is unclear (501.603/.604). | https://www.flsenate.gov/Laws/Statutes/2026/501.616 | Fix the citation. Count per consumer across every number and every MLO of the seller. Treat it as applying until counsel says otherwise. |
| FL FTSA: PEWC for automated or recorded marketing; a STOP-before-suit rule | verified | 501.059(8)(a); a checkbox counts as a signature; FL area code creates a presumption of FL residence; 15-day cure. | https://www.flsenate.gov/Laws/Statutes/2026/501.059 | Act on STOP immediately. The 15-day cure window is not an operating allowance. |
| WA CEMA: commercial texts to WA residents need clear advance affirmative consent, with no EBR exception | verified (statute); damages unverified | RCW 19.190.060 and .070. The reviewers disagree on damages ($500 vs $100 under 2026 c 135, suits from 2026-06-11). It is a CPA violation. It turns on residence, not area code. | https://app.leg.wa.gov/RCW/default.aspx?cite=19.190.060 | Add a WA row: marketing texts need affirmative written marketing consent, and EBR never counts. Add WA to the union of states. |
| WA RCW 80.36.390: calls 8–8, stop within 10 seconds, no solicitation for 1 year, no selling the contact | verified | As stated. | https://app.leg.wa.gov/RCW/default.aspx?cite=80.36.390 | Add to the call-flow state machine and set a 1-year call suppression after a "no". |
| WA CEMA email: a false or misleading subject line violates the Act (Brown v. Old Navy) | partly | RCW 19.190.020(1)(b) is cited by the reviewer. The case and the 2026 amendment's wording come from memory. | https://app.leg.wa.gov/RCW/default.aspx?cite=19.190.020 | Subject-line linter in check:copy and in the Concierge guard: no "Approved", "Your rate", fake Re:/Fwd:, or urgency, and the subject must match the body. Keep every subject line sent. |
| AZ A.R.S. 44-1271 et seq. (texts, registration, hours) and CA PUC 2871–2876 (ADAD) | unverified | Fetch failed or host blocked. | — | AZ marketing switch OFF until counsel clears it. Block AI-voice calls to CA numbers even with TCPA consent until ADAD is cleared. |
| Repo gate: 9–20, 3 calls a day, 1 text a day, 3 a week, TX Sunday from noon; the state is resolved from a single value | verified (code) | lib/send-gate/rules.ts DEFAULT_RULE; `ruleFor(state)`. | /home/user/RATEM8/lib/send-gate/rules.ts | Change to `ruleFor(states[])`, taking the strictest rule across area-code, residence, property and MLO states, and log every state considered. |

## C. Recording and transcription

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| Live transcription by a vendor is interception under Cal. Penal 631/632 and RCW 9.73.030, and needs all-party consent (Ambriz v. Google) | unverified | From memory; not opened. Dropping the audio does not remove the consent duty. | — | No live transcription of client calls. Use the MLO's own post-call dictation (STT V2 dynamic batch, data logging off). Any future live transcript needs an all-party notice and an affirmative yes, applied across the union of states. |

## D. Fair lending and protected classes

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| New Reg B final rule (91 FR 21620, effective 2026-07-21): no effects test, discouragement narrowed, special purpose credit programs restricted | verified | 1002.4(b) covers statements, including images and video, that a creditor "knows or should know" would discourage a reasonable person. | https://www.govinfo.gov/content/pkg/FR-2026-04-22/html/2026-07804.htm | Update the plan docs. Do not relax the firewall: state law and FHA disparate treatment remain. |
| HUD has only proposed changes to Fair Housing Act disparate impact | verified (no final in FR search) | Proposals of 2026-01-14 and 2026-08-10. | https://www.federalregister.gov/documents/2026/08/10/2026-16228/ | FHA disparate-impact exposure continues, including for triage ranking. |
| Brokers are "creditors" for 1002.4(a)-(b); no questions about childbearing (1002.5(d)(3)); no inquiry into race, sex and similar (1002.5(b)) | verified | As stated. | https://www.ecfr.gov/api/versioner/v1/full/2026-11-01/title-12.xml?part=1002&section=1002.5 | Never draft "growing family?" prompts. Add a red-team case. |
| Reg B 1002.6(b)(5) bars discounting retirement, public-assistance, alimony or child-support income | unverified (not opened) | Cited by the reviewer from memory. | — | The guard gets a responsive mode: a client who asks "can I count my SS / child support / voucher income?" is routed to the MLO with a neutral holding reply, never dropped. |
| Fair Housing Act 3605 and 3604(c) | verified | Brokering is covered, and so are statements showing a familial-status preference. | https://www.govinfo.gov/content/pkg/USCODE-2024-title42/html/USCODE-2024-title42-chap45-subchapI-sec3604.htm | Bar selective outreach on any familial signal. |
| State classes beyond the federal list | verified (WA, OR); partly (CA) | WA 49.60.222: creed, citizenship or immigration status, veteran or military status, service animal, families with children. OR 659A.421: source of income, gender identity, sexual orientation. CA 12955 (mirror only): source of income, veteran status, genetic information, ancestry, gender expression, medical condition. | https://app.leg.wa.gov/RCW/default.aspx?cite=49.60.222 ; https://oregon.public.law/statutes/ors_659A.421 | guard.ts checks the property state. VA status is a program fact from the LOS only, applied the same way to every VA loan [COUNSEL]. |
| WA My Health My Data: health inferred from non-health data is covered; the GLBA exemption is limited | verified | RCW 19.373.010 and .100. | https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.010 | Drop accessibility-permit descriptions before matching. Never store the reason behind a housing feature. |
| CFPB withdrew 67 guidance documents, including Circulars 2022-03, 2023-03 and 2022-04 | verified | 90 FR 20084. The regulations (1002.9, UDAAP) stand. The 2023 chatbot report is still published. | https://www.govinfo.gov/content/pkg/FR-2025-05-12/html/2025-08286.htm | Stop citing the withdrawn circulars as current CFPB expectations. Answer the chatbot report's "doom loop" warning with a visible SLA for handing rate questions to a human. |
| The 2023 RESPA comparison-shopping advisory opinion is still in force | partly | It is not on the May 2025 list. Later status is unchecked (FR rate-limited). | https://www.federalregister.gov/documents/2023/02/13/2023-02910/ | Data charter and check:copy: no pay to any AI assistant per lead, referral or ranked placement. |
| A Concierge product recommendation (HELOC vs cash-out, a named lender) engages Reg Z 1026.36(e) anti-steering | partly (analysis) | 36(e) is in the comp rule. The application is reviewer inference. | https://www.consumerfinance.gov/rules-policy/regulations/1026/interp-36/ | The Concierge surfaces need codes only. Product options appear only in the antiSteering.ts presentation by the MLO. Add guard patterns and red-team cases for "you should get a HELOC". |
| Texas TRAIGA: intent-only discrimination standard; consumer AI disclosure binds only government (and health care); 36-month sandbox | verified | HB 149, effective 2026-01-01. DIR has no private-sector portal yet (secondary source). | https://capitol.texas.gov/tlodocs/89R/billtext/html/HB00149F.htm | Texas AI disclosure rests on the house rule. Defer the sandbox until a portal opens. |

## E. State AI and privacy laws

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| Colorado AI Act "delayed to 2026-06-30" (plan) | contradicted | SB26-189 repealed and re-enacted 6-1-1701 et seq. Signed 2026-05-14, effective 2027-01-01. No general AI-interaction disclosure, no impact assessment. AG-only enforcement with a 60-day cure. Topic 6's "partly" is superseded by Topic 2's read. | https://leg.colorado.gov/bill_files/116489/download | Update the docs. Colorado is not a live state, so rank it below WA, OR, AZ, CA and TX. |
| SB26-189 exclusions cover drafting tools for human review and marketing | verified (text); application [COUNSEL] | 6-1-1701(2)(b)(II)-(III) and (3)(b). (III) requires an acceptable-use policy (AUP) banning use in consequential decisions. | same | Add a Concierge AUP to the MLO and sponsor terms. CI test: no import path from lib/concierge into pricing, routing, loan or eligibility. The guard refuses "you'd qualify" and "likely denied". |
| SB26-189 deployer duties and "meaningful human review" | verified | 6-1-1701(15), 1703 (3-year records), 1704, 1705, 1707(7) (a clause indemnifying one's own discrimination is void). | same | Keep a developer documentation pack. Counsel reviews sponsor indemnities. One-by-one approval cards for free-text drafts. Bulk approve allowed only for code-rendered service templates (Colorado is not a live gate). |
| Utah AI disclosure is now 13-77-103: prominent disclosure in "high-risk" financial interactions, $2,500 per violation | verified | Covers generative AI working "with limited or no human oversight". The safe-harbor section number is inconsistent across topics (13-77-104 vs 13-77-102). | https://le.utah.gov/xcode/Title13/Chapter77/13-77-S103.html | Fix the citation before quoting it. LoanM8 is not Utah-licensed. The Concierge must truthfully answer "are you AI?" |
| CCPA ADMT rules: comply by 2027-01-01; "human involvement" test; advertising excluded; risk assessments | verified | 11 CCR 7001(e), (ddd), 7150, 7200. | https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf | Approval cards show the primary evidence, and the reviewer has authority to change the outcome. |
| CCPA exempts GLBA data, not GLBA entities | unverified | From memory (Civ. 1798.145(e)). | — | Treat need codes for pre-application contacts and agents as CA personal information with deletion rights. |
| CA authorized-agent rule (11 CCR 7063) and opt-out preference signals (7025) | verified | Agent permission can be verified; the agent uses data only for the request. | https://www.law.cornell.edu/regulations/california/11-CCR-7063 | Agents may narrow (stop, delete, correct) and may never widen (consent, apply). Delete and correct need verification; stop does not. |
| CA bot law (B&P 17940-17943) | unverified | leginfo blocked. | — | Auto-sent and live AI replies carry the AI footer in every state. |
| CA DROP: data brokers process deletions at least every 45 days | partly | cppa.ca.gov verified; penalty figure unverified. | https://cppa.ca.gov/data_brokers | Never buy life-event or mover segments (registry blocklist). |
| CA Civ. Code 1632/1632.5 translation duty | unverified | From memory. | — | A client-stated language preference sets a "negotiated in [language]" flag on the loan plus a translation checklist [COUNSEL]. |
| CA FEHA automated-decision regulations (2025-10-01) cover recruiting AI | unverified | From memory. | — | Recruiting ranks only opt-in candidates [COUNSEL]. |

## F. FCRA and HPPA

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| HPPA: four narrow groups may receive a trigger report, and only for a firm offer of credit; effective 2026-03-04 | verified | Pub. L. 119-36. "Originated" is undefined, so a broker's status is [COUNSEL]. | https://www.govinfo.gov/content/pkg/PLAW-119publ36/html/PLAW-119publ36.htm | Keep the no-trigger-leads rule. Put trigger and prescreen lists on the registry blocklist. |
| An annual-review credit pull needs the client's written instruction; a broker lacks an account-review purpose | partly | 1681b(a)(2) verified; the (a)(3)(F)(ii) reading is inference. | https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap41-subchapIII-sec1681b.htm | Each review needs a fresh written instruction with E-SIGN, or the client pulls their own report. |
| Reusing the origination tri-merge for later marketing exceeds the permissible purpose (1681b(f)) | partly | Statute verified; application is reviewer inference. | same | Tag credit-report fields `fcra:true` and bar them from every Concierge brief. `consolidate_debt` only when the client states it. |
| Free weekly credit reports are permanent | partly | FTC page 404; secondary source only. | https://consumer.ftc.gov/consumer-alerts/2023/10/you-now-have-permanent-access-free-weekly-credit-reports | Don't state it in copy until confirmed. |

## G. Reg Z, Reg X, Reg N, servicing and retention

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| Book-wide review invitations are advertisements; a one-client follow-up is not | verified | Reg Z comment 2(a)(2). | https://www.consumerfinance.gov/rules-policy/regulations/1026/interp-2/ | Invitations carry no trigger terms or rates. |
| A TRID application exists once six items are submitted | verified | 1026.2(a)(3)(ii). | https://www.law.cornell.edu/cfr/text/12/1026.2 | Six-item tripwire on every agent and email channel. Refuse to store the SSN and route to the human application flow. |
| HPA MI clocks; a subordinate lien blocks a borrower's cancellation request | verified | 12 U.S.C. 4902(a)-(c). | https://www.govinfo.gov/content/pkg/USCODE-2024-title12/html/USCODE-2024-title12-chap49-sec4902.htm | Add the midpoint date. Warn about MI cancellation wherever a HELOC is discussed. |
| FHA annual MIP: 11 years at 90% LTV or less, else the full term (post 2023-03-20) | verified | ML 2023-05. | https://www.hud.gov/sites/dfiles/OCHCO/documents/2023-05hsgml.pdf | Use as a date-math service signal. |
| Fannie LL-2026-07 lets servicers solicit borrowers for MI termination | partly | Orrick summary verified; the LL page returned 403. Guide B-8.1-04 still says "must not solicit". | https://guide-servicing.fanniemae.com/svc/b-8.1-04/termination-conventional-mortgage-insurance | Drop the "servicers can't solicit" premise from PMI Exit. Add the improvement path. |
| ARM notices, escrow statements and Form 1098 | verified | 1026.20(c)-(d), 1024.17, IRS i1098. | https://www.ecfr.gov/api/versioner/v1/full/2026-11-01/title-12.xml?part=1024&section=1024.17 | Forward-a-letter inbox; delete the raw file after extraction. |
| Garn-St Germain due-on-sale exemptions; successor-in-interest duties | verified | 12 U.S.C. 1701j-3(d); Reg X 1024.38(b)(1)(vi), 1024.36(i). | https://www.govinfo.gov/content/pkg/USCODE-2024-title12/html/USCODE-2024-title12-chap13-sec1701j-3.htm | Ownership Change Desk, storing a neutral `ownership_change` code only. No refinance pitch. |
| The AVM quality-control rule applies to originators once an AVM value is used in a credit decision | verified | 1026.42(i). | https://www.ecfr.gov/api/versioner/v1/full/2026-11-01/title-12.xml?part=1026&section=1026.42 | Show equity only as a labelled range, never in a decision. |
| VA IRRRL seasoning and recoupment | verified | 38 U.S.C. 3709. | https://www.govinfo.gov/content/pkg/USCODE-2024-title38/html/USCODE-2024-title38-partIII-chap37-subchapI-sec3709.htm | State them as conditions only, never as eligibility. |
| Reg N 1014.3 misrepresentation (MI, government affiliation) | unverified | From memory; 1014.5 was verified. | — | Templates say "you may be able to ask your servicer". No agency names in senders or subjects. |
| Retention periods | verified | Reg B 1002.12(b) 25 months; Reg Z 1026.25 2, 3 or 5 years; Reg N 1014.5 24 months; TSR 310.5 5 years per unique message; CO 3 years; CCPA requests 24 months. | https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310/section-310.5 | Keep sent outbound text 5 years. Every memory row gets `legal_hold_until`. A client delete hides at once and hard-deletes after the hold. |
| Activity that counts as being a "loan originator" (offering or negotiating terms, taking applications) | unverified | Reg H 1008.103 and 1026.36(a)(1) from memory. | — | Neither auto-send nor the agent gateway may present terms, negotiate or take applications. These need a recorded human act by the MLO. |
| State ad rules require company name, NMLS ID and license numbers, with licensee approval | unverified | WAC 208-620-630, A.R.S. 6-909, CFL/CRMLA, 7 TAC from memory. | — | Sponsor approval of marketing templates. The gate adds identifiers per state from config/licensing.ts and the segment budget allows for them. |
| Texas home-equity rules (art. XVI §50(a)(6)) | unverified | From memory. | — | TX project_cash override; the review shows "Texas home equity rules apply". |
| CAN-SPAM "transactional or relationship" category | verified (statute); application partly | 15 U.S.C. 7702(17). | https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap103-sec7702.htm | Commercial emails automatically get a physical address and opt-out. A refinance line makes an email commercial. |

## H. RESPA, LO compensation and state compensation rules

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| RESPA 8 reaches any person, consumers included (gift cards for referrals) | partly | 12 U.S.C. 2607 read; Reg X 1024.14's reach to consumers is from memory. | https://www.law.cornell.edu/uscode/text/12/2607 | Never-list in tools, guard and check:copy: no reward, gift card, raffle or credit tied to a referral. Asking for referrals is fine. |
| A fixed 50/50 cost split (Lofty) raises RESPA co-marketing risk | partly | Lofty's statement verified; the RESPA analysis is MED. | https://lofty.com/solutions-lenders | The Concierge never proposes cost splits or deal-flow lunches. |
| Reg Z compensation covers prizes; labels don't matter; bona fide equity returns are excluded | verified | Comment 36(a)-5.i, iv.B, vi; 36(d)(1)-3.v.B defines "mortgage-related business". | https://www.consumerfinance.gov/rules-policy/regulations/1026/interp-36/ | Fund patronage only from subscription net earnings, with a ledger whitelist. No perks to individual MLOs. |
| No express rule in the five states says only the sponsor may pay an MLO | partly | No such rule in the texts read; AZ rules, OAR 441-870-0010 and the TX SML FAQ were not read. | see rows below | Fix the plan's "state paid-only-by-sponsor" wording. |
| Arizona "bars paying unlicensed people" (plan reading) | contradicted | 6-909(B) and 6-947(B) bar *licensees* from paying unlicensed people. 6-991.02(E) and (M) set a one-employer rule for originators. | https://www.azleg.gov/ars/6/00991-02.htm | Fix final-form §3. Close the "pay the MLO for services" lanes in AZ and OR. |
| OR 86A.178(2): an MLO originates for one lender at a time | verified | Its purpose is conflicts of interest. | https://www.oregonlegislature.gov/bills_laws/ors/ors086A.html | No bounties or grants paid to OR MLOs. |
| CA B&P 10137: only the employing broker may pay | verified (mirror) | Limited to DRE salespersons and activity that requires a real estate license. LoanM8's CA MLOs are DFPI/CFL licensees. | https://california.public.law/codes/business_and_professions_code_section_10137 | Scope it in the docs. CA-DRE row in the state comp matrix. |
| CA CFL/CRMLA: no payer-source rule | verified | Fin. Code 22100(b), 22161, 50002.5. | https://california.public.law/codes/financial_code_section_22161 | Matrix row. |
| WA: no payer-source rule; no borrower-paid LO compensation | verified | RCW 31.04.027; WAC 208-620-700(4), -550; RCW 19.146.070. Text certified 7/12/2024. | https://lawfilesext.leg.wa.gov/Law/WAC/WAC%20208%20%20TITLE/WAC%20208%20-620%20%20CHAPTER/WAC%20208%20-620%20-700.htm | Matrix row. Check later amendments. |
| TX "SML guidance on paying through the sponsor" (plan wording) | contradicted | SML exam slide of 2025-11-03: "Commissions must be paid directly to the sponsored MLO", not to the MLO's LLC. 7 TAC 55.107(b)(7), 55.2(3). | https://www.sml.texas.gov/wp-content/uploads/2025/11/Exam-Common-Violations-2025-11.03.2025.pdf | Fix the citation. Record the payer type on each invoice and flag LLC payers for counsel. |
| A patronage refund is a price reduction, not compensation | unverified | IRC 1388(a) verified; no regulator has addressed it. | https://www.law.cornell.edu/uscode/text/26/1388 | Payer-of-record enforced as a DB invariant with a CI test. Credits on the invoice by default. The engine refuses until counsel approves each state in the matrix. |
| Licensing regime per state comes from config/licensing.ts | verified (code) | WA CLC, OR MLL, AZ MB, CA CFL (DFPI), TX MC. | /home/user/RATEM8/config/licensing.ts | Add lib/compliance/state-comp-matrix.ts. |

## I. GLBA, Safeguards Rule and E-SIGN

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| Disclosure at the consumer's direction, if not revoked | verified | 15 U.S.C. 6802(e)(2); 12 CFR 1016.15(a)(1). | https://www.law.cornell.edu/cfr/text/12/1016.15 | Introductions to agents only after a written, revocable client direction. Agent mandates checked live on every request. |
| The fact that someone is a customer is NPI | verified | 1016.3(q)(2)(i)(C). The blind-data exclusion (q)(2)(ii) is unverified. | https://www.ecfr.gov/current/title-12/chapter-X/part-1016 | Any brief naming a past client is NPI. A pseudonymous batch needs at least 10 records per feature combination, or triage runs in code [COUNSEL]. |
| Safeguards Rule: dispose within 2 years of last use, log user activity, oversee vendors | verified | 314.4(c)(6), (c)(8), (f). | https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-314/section-314.4 | Nightly purge of expired memory, with copies in proposals and tasks. Log every MLO read of memory. Keep the vendor file. |
| Safeguards Rule: encryption (c)(3), MFA (c)(5), FTC breach notice within 30 days for 500+ consumers (j) | partly | Section opened; these paragraphs not quoted. | same | Encrypt memory and the vault. MFA on the MLO console. Add the Concierge store to the incident-response plan. |
| Portable memory vs Reg P reuse and redisclosure | unverified | 1016.11 from memory [COUNSEL]. | — | Memory from Sponsor A's loans stays with Sponsor A unless the client re-directs under the new sponsor. |
| E-SIGN: acts of an electronic agent count only if attributable to the person; consumer consent rules | verified | 7001(h), 7001(c)(1)(C)(ii), 7006(3). | https://www.law.cornell.edu/uscode/text/15/7001 | Consent and E-SIGN consent need a human step on the borrower's device. An agent channel is never the delivery channel of record. |
| CFPB 1033 is under reconsideration | partly | ANPR 2025-08-22. | https://www.federalregister.gov/documents/2025/08/22/2025-16139/ | No agent data pulls based on 1033. |

## J. Data licences and Twilio

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| RETR ToS (2026-09-17) bans AI, ML, rules engines and derivative datasets | verified | §6 Unauthorized Actions. | https://retr.app/terms | Tag RETR rows `ai:false, rules:false, derive:false`. No ranking, sorting or Warm Path joins. The Concierge never reads RETR. |
| RETR bars displaying RETR data outside RETR without written permission | verified | §8.1. Contradicts the plan's "display only" reading. | same | Ask api@retr.app in writing. Prefer the approved iFrame. Until then, owner-only display behind the tag. |
| RETR CRM-partner program (webhook, iFrame approval) | verified | Help-center content; it does not amend the ToS. | https://kb.retr.app/how-do-i-become-a-crm-partner | Apply for Level 2 and iFrame approval. |
| RETR payloads carry MMCT/LMI fields, buyer names and recruiting notes | verified | Spec pages. | https://kb.retr.app/data-specification-loan-officer | Parser drops buyer names and MMCT/LMI. Never take Refi Opportunities or skip tracing. |
| Model Match ToU: internal use only; no marketing or solicitation; no service bureau; no employment decisions | verified | 3.1, 3.2(i), (iii), (vi), 3.5. | https://modelmatch.com/terms-of-use | Bring-your-own-seat OAuth only, with nothing pooled. A written Order is needed before hosted-agent or recruiting use. No borrower NPI pushed to them. |
| MMI Lead Store: no consent; liability sits with the LO; appended contacts can't be transferred | verified | Terms 3.3, 3.5, 4.3. | https://store.mmi.io/terms-and-conditions | Contacts appended by MMI or Borrower Insights are `consent=none` and blocked for texts and AI voice. No MonitorBase without written HPPA confirmation. |
| MMI subscriber terms ban sharing, service-bureau use, merging and data mining | partly | AIME signup copy; mmi.io blocked. | https://signup.mmi.io/ssusuccess/tandc.php?co=aime | Close the gap before launch. |
| ATTOM self-serve API: evaluation only; no database; 24-hour cache limit | verified | §1.2-1.3; AVM is "not an appraisal" (6.6). | https://api.developer.attomdata.com/legal | No production use. Negotiate a licence naming AI use. Use county open data meanwhile. |
| NMLS Consumer Access: use only to decide whether to do business; no solicitation, display, database or bulk use | verified | ToU ¶4-7. | https://mortgage.nationwidelicensingsystem.org/about/policies/NMLS%20Document%20Library/Consumer%20Access%20Terms%20of%20Use.pdf | Recruiting never uses NMLS. The Licensed Agent Registry publishes only self-reported IDs from config. Manual one-at-a-time checks until B2B. |
| NMLS B2B ACCESS allows compliance verification and consumer display; bans solicitation; End-User terms flow down | verified | Agreement v4 (3/2026). Fees unverified. | https://mortgage.nationwidelicensingsystem.org/knowledge/Products/b2b/Shared%20Documents/NMLS%20B2B%20ACCESS%20AGREEMENTv4_20.pdf | Apply for B2B. Sponsors sign the flow-down. |
| Twilio ISV architecture #1; moving to subaccounts resets opt-outs; 5 brands per tax ID | verified | ISV onboarding doc. | https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv | D10: one subaccount and brand per sponsor EIN. Replay cc_optouts_v2 before cutover, with a test. |
| Campaign vetting: brand-named consent, a non-sharing privacy statement, T&C on the brand's own domain | verified | collect-business-info. | https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/collect-business-info | Per-sponsor consent artifacts checked by the gate. |
| Twilio Messaging Policy (2026-04-13): consent per recipient, sender and subject; no transferred consent; ISVs require PEWC; one confirmation after opt-out | verified | As stated. | https://www.twilio.com/en-us/legal/messaging-policy | New consent when an MLO changes sponsors. Never share numbers. |
| Carriers restrict "Third Party Mortgage Loan" and lead generation; rejections are final | partly | Guidelines and error 30897 verified. Whether a broker counts as first party is unverified. | https://www.twilio.com/docs/api/errors/30897 | Email first for proactive outreach. Register only customer-care and conversational campaigns. Get Twilio's first-party view in writing. |
| 10DLC fees | partly | $4.50 brand and $41.50 vetting verified; campaign fees from snippets. | https://www.twilio.com/docs/trust-hub/registrations/a2p-10dlc-brand | Budget only. |
| USPS NCOALink: lists of at least 100; single queries prohibited; no sharing | verified | 2020 announcement. | https://postalpro.usps.com/mnt/glusterfs/2020-11/SOLE_PURPOSE_OF_NL.pdf | Registry blocklist: no per-person NCOA. |
| Seattle permits data is public domain with no owner name | verified | Socrata 76t5-zqzr. | https://data.seattle.gov/api/views/76t5-zqzr.json | Allowed; the MLO's call names the source. |

## K. Vendor terms and market compliance claims

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| Instinct: the agent binds the user; personal use only; $100 liability cap; trains on data unless the user opts out | verified | Terms, AUP, privacy. | https://www.instinct.com/terms | Onboarding explains why a consumer agent is no substitute. Ship a GLBA service-provider agreement. |
| Instinct was hit by a prompt injection by email | partly | The X post was not read. | https://www.eesel.ai/blog/instinct-ai-for-sales | Concierge red-team release gate. |
| Muse Sentinel egress guard, credentials held away from the agent, audit trail | verified | Meta newsroom. | https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/ | A non-LLM Steward holds the credentials and runs the gate. |
| Muse approvals and terms ($250 cap, user solely responsible) | partly | Help pages render client-side. | https://www.eesel.ai/blog/meta-muse-for-sales | Offer no "Always allow" for client-facing actions. |
| Muse Marketplace failure (price, address, false availability) | verified (one user's account) | The Next Web. | https://thenextweb.com/news/meta-muse-facebook-marketplace-address-buyer-robb | Commitment Lock, including underwriting odds and third-party timelines. |
| PACT protocol; Poppy; Hertz pilot | verified (adoption unverified) | Decagon blog. | https://decagon.ai/blog/introducing-the-personal-agent-consent-trust-protocol-pact | Defer for launch. Code templates only in v1. |
| Total Expert discloses AI only "when required by law or if prompted" | verified | Vendor page. | https://www.totalexpert.com/features/ai-sales-assistant | Disclosure is structural: disclose at the passport and first contact, and footer every auto or live AI message. |
| Total Expert captures family and age life events | verified | Vendor blog. | https://www.totalexpert.com/blog/building-context-engine-ai-lending | Household and life-stage firewall, with a CI test of forbidden schema fields. |
| Warne v. UWM TCPA class action | partly | Not attributed to Mia. | https://www.mpamag.com/us/specialty/wholesale/united-wholesale-mortgage-faces-class-action-over-alleged-robocall/564560 | Don't cite it as a Mia case. Make no comparative claims without substantiation. |
| No vendor publishes outcomes with denominators | verified (absence) | Pages read. | https://lofty.com/ai/sales-agent | Scorecard built from real counts. |

## L. Model vendor, protocols and trademark

| Claim | Status | What the primary source says | Source URL | What Command Center must change |
|---|---|---|---|---|
| Anthropic: no training without permission; Covered Models (Fable and Mythos 5.x) need 30-day retention; ZDR per organization | verified | Retention doc. | https://platform.claude.com/docs/en/manage-claude/api-and-data-retention | Enable ZDR. No Covered Models. No Files API for client documents. File it in the 314.4(f) vendor record. |
| Message Batches: 29-day retention, not ZDR; message-threads beta not ZDR | verified (Batch); partly (threads) | Batch doc and retention doc. | https://platform.claude.com/docs/en/build-with-claude/batch-processing | Only non-identifying triage goes to Batch. No threads for client data. |
| `fallbacks: "default"` re-runs refusals on another model; not supported in Batch | verified | Refusals doc; agent.ts:124 (checked). | https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback.md | Name the fallback models or disable fallback. Red-team every fallback model. Log the model that served each request. |
| Model, Google speech and Twilio prices; repo STT uses V1 | verified | Pricing pages; curly quotes force UCS-2. | https://platform.claude.com/docs/en/about-claude/pricing ; https://cloud.google.com/speech-to-text/pricing ; https://www.twilio.com/docs/glossary/what-sms-character-limit | GSM-7 normalisation and a segment count on the approval card. Move to STT V2 with no data logging. |
| Certification marks: the owner may not market the services, must certify every vendor that passes, and can be cancelled otherwise | verified | 15 U.S.C. 1064(5), 1127. | https://www.law.cornell.edu/uscode/text/15/1064 | Defer. If built, use a separate nonprofit certifier plus a 16 CFR 255.5 material-connection disclosure (unverified). |
| Noerr-Pennington protects joint petitioning | unverified | From memory. | — | Antitrust counsel before any co-op filing. |
| A2A v1.0, AP2, Web Bot Auth, SD-JWT RFC 9901, OpenID4VP 1.0, FDTA standards (effective 2026-10-01), MISMO MCD and FRAME, OSCAL | verified (standards) | Spec pages. | https://a2a-protocol.org/latest/specification/ ; https://www.govinfo.gov/content/pkg/FR-2026-06-25/pdf/2026-12787.pdf ; https://www.mismo.org/mcd | Defer for launch, except the cheap MCD export later. |

## M. D8 code claims

| Claim | Status | What the code says | Source | What Command Center must change |
|---|---|---|---|---|
| Tools take no recipient parameter; schemas are strict; 3 rounds max; approval re-runs the gate | verified | agent.ts, desk.ts. | /home/user/RATEM8/lib/concierge/agent.ts | Keep. |
| "The loan's rate is withheld from the brief" | contradicted | The rate_gap card reason ("Their note rate is X%… priced example Y%", rank.ts:78) goes into the trusted header (agent.ts:103). | /home/user/RATEM8/lib/today/rank.ts | Build the brief from an allow-list of card fields with no numbers from `reason`. Test: no `%` reaches the ModelCall. |
| Reply card puts the client's raw text outside the data tags | verified | rank.ts:58 (80 characters) lands on the "Why they're in today's list" line unescaped. | same | For reply cards pass kind and age only. Put every non-constant field in nonce-delimited blocks. NFKC normalise, strip Cf, tag and bidi characters, escape `<` `>` `＜` `＞`. |
| Roles other than `lo` see every contact on the platform | verified | service.ts:26 `canSee`; `scopeOf` returns undefined. The contact page shows memory, and `ask()` uses `todayFor(actor)`. | /home/user/RATEM8/lib/contacts/service.ts | Add `tenantId` (sponsor and team) on user, contact, memory, proposal and task, and filter every query on it. Cross-tenant 404 test. |
| Memory query filters on contact_id only | verified | store.ts:112,185. | /home/user/RATEM8/lib/concierge/store.ts | Add owner and tenant filters plus an index on `(owner_user_id, contact_id, expires_at)`. |
| Memory quote check is a 4-character substring match, and the paraphrase is re-fed as trusted text | verified | guard.ts:51. | /home/user/RATEM8/lib/concierge/guard.ts | Use the Need Codec: enum plus message-id and span pointer checked by code, and the model sees codes only. Memory starts pending until the MLO keeps it. Remove `relationship` from MEMORY_KINDS. |
| Expired memory is never purged | verified | Filtered on read only. | store.ts | Nightly hard delete with tombstone hashes, covering copies in proposals and tasks. |
| Proposal `why` field is not checked by `protectedTopic` | verified | agent.ts:163. | agent.ts | Run protectedTopic plus the URL and phone check on why, task titles and `ask()` answers. |
| Guard refuses any draft mentioning Spanish or "language" | partly | The regex matches only "speak(s) Spanish…". The blanket ban is the prompt line at agent.ts:52 ("If a client mentions one, ignore it"). | agent.ts:52; guard.ts:20 | Change both. Language becomes a stated accommodation, and a protected hit routes to the MLO, never to silence. |
| Guard false positives | verified (review) | Whole-draft scan catches "Hi Christian/Faith", Temple TX, White Salmon, "visa", "retire my HELOC". | guard.ts | Strip name and address before scanning. Pass-fixture of names, cities and products. Track false-refusal rate. |
| A STOP still triggers a model run | verified | agent.ts:261 skips stopped contacts except for reply cards. | agent.ts | A revocation produces no model call, memory or task. |
| `approve()` has no concurrency guard; unedited body isn't re-checked; drafts don't go stale | verified (review) | desk.ts:17-31. | /home/user/RATEM8/lib/concierge/desk.ts | Compare-and-swap to `sending` plus a Twilio idempotency key. Re-run checkDraft at approval. Inbound or revocation marks pending drafts `stale`. |
| Sweep runs serially within a 300-second limit and swallows errors | verified (structure) | route.ts:11,19; `.catch(() => null)`. | /home/user/RATEM8/app/api/cc/concierge/sweep/route.ts | Queue one job per MLO, write per-MLO run rows with an error class, alert on refusal spikes. |
| Top-level `cache_control` caches the unique brief | verified | agent.ts:126. | agent.ts | Explicit cache point at the end of the system prompt. Separate Concierge workspace and key. |
| No Concierge red-team cases exist | verified | 0 matches in tests/m8-redteam-cases.ts. | /home/user/RATEM8/tests/m8-redteam-cases.ts | New tests/concierge-redteam-cases.ts as a separate gate. |
| No URL or phone allow-list on drafts; dollar figures and dates from the brief can be echoed | verified (review) | checkDraft is called with empty userStated and priced sets. | guard.ts | Allow only configured booking and application URLs. Refuse brief-sourced dollar figures and dates. |

---

## Changes required, most urgent first

1. **Cross-tenant leak (before any second sponsor or non-`lo` user is onboarded).**
   - Add `tenantId` scoping to contacts, memory, proposals, tasks and `ask()`.
   - Add `owner_user_id` and tenant filters at store.ts:112 and :185.
   - Test that MLO A's assistant gets 404 or empty on MLO B's contact, memory and Ask.
2. **Brief injection and NPI leaks in D8.**
   - Allow-list card fields per kind, with no `reason` numbers; this fixes the rate_gap leak at rank.ts:78 feeding agent.ts:103.
   - Reply cards carry kind and age only.
   - Nonce-delimited data blocks for every non-constant field (firstName, memory, voice notes).
   - NFKC normalise and strip Cf, tag and bidi characters on both inbound and outbound text.
   - URL and phone allow-list; refuse dollar figures and dates taken from the brief.
3. **Revocation path before 2026-11-25 (FCC 26-67 takes effect).**
   - Decide in writing not to name an exclusive method, and log `revocation_basis`.
   - A STOP gets no model call (agent.ts:261), no memory and no tasks.
   - Revocation detection runs first on every inbound, catching casual phrasings at 99% or better.
   - Confirmation template has no question and no START, with a test that a second outbound is BLOCKED.
   - Opt-outs block every MLO and sponsor platform-wide, and suppress email marketing as a house rule.
   - Fix the two plan docs that misstate the rule.
4. **Approval integrity.**
   - Compare-and-swap plus an idempotency key in desk.ts.
   - Always re-run checkDraft and record the guard version.
   - Inbound or revocation marks pending drafts `stale`.
5. **Memory poisoning and retention.**
   - Replace exact-quote memory with Need Codec enums plus code-checked span pointers, pending until the MLO keeps them.
   - Remove `relationship` from MEMORY_KINDS.
   - Nightly purge covering copies; `legal_hold_until`; a 24-month cap after last use.
   - Redact protected spans before extraction, and take timing only from dates the client stated, with a with/without-clause CI test.
6. **Guard semantics.**
   - Replace "If a client mentions one, ignore it" (agent.ts:52) with routing to the MLO plus a neutral holding reply.
   - Responsive mode for income-source and language questions the client raised.
   - Hardship and life-event lane: a reply-personally task and a marketing pause.
   - Run protectedTopic on `why`, tasks and `ask()`.
   - Strip names and addresses before scanning, and add the false-positive fixture.
   - Add state classes (WA, OR, CA) and euphemisms (twins, hubby, pension, veteran, Section 8 variants, creed, holidays).
   - Commitment Lock additions: underwriting odds and third-party timelines.
   - Never-list: referral rewards and product recommendations.
7. **Model routing and ZDR.**
   - Remove `fallbacks: "default"` or name the fallback models.
   - Log the served model, prompt hash, guard version, brief hash and inbound touch IDs in the audit record.
   - Enable ZDR; no Covered Models, Files API or threads for client data.
   - Separate Concierge workspace and key with a spend cap.
8. **State gate rows.**
   - WA CEMA: marketing texts need affirmative consent, with no EBR.
   - WA 80.36.390 call flow.
   - CT PEWC for all marketing, plus the 10-second steps.
   - VA row.
   - FL cap per consumer across numbers.
   - TX ch. 302 switch OFF by default and a TX no-call scrub.
   - AZ switch OFF; CA AI-voice blocked.
   - `ruleFor(states[])` across the union of states.
9. **Contact hygiene for old books.**
   - Reassigned Numbers Database check after 90+ days of silence.
   - National DNC scrub within 31 days.
   - EBR as a live-call-only tier, never in CT and never for WA texts.
   - Per-client touch budget checked before any model call.
10. **Data-licence tags.**
    - RETR `ai:false, derive:false, display:owner_only`, and drop buyer names and MMCT/LMI.
    - MMI and Borrower Insights appended contacts are `consent=none`.
    - ATTOM self-serve not used in production.
    - NMLS lookups are manual only, and recruiting never uses NMLS.
    - Write to RETR, Model Match and NMLS SRR for permissions.
    - Monthly terms-version watcher.
11. **Sweep reliability.**
    - One queued job per MLO with per-MLO run rows and an error class.
    - A real-time reply lane (about 60 seconds) ahead of batch work.
    - Single-call drafting and an explicit system cache point.
    - Skip-before-model rules.
12. **Wiretap.**
    - No live transcription of client calls.
    - MLO post-call dictation via STT V2, data logging off.
    - Move /api/m8-listen off V1.
13. **SMS cost and safety.** GSM-7 normalisation, a segment count on the card, and a cap of 306 characters.
14. **Channel strategy.**
    - Email first for proactive touches, with CAN-SPAM footers and the CEMA subject-line linter.
    - SMS for replies and status.
    - D10 registers only care and conversational campaigns.
    - Replay opt-outs before the subaccount cutover.
    - New consent on a sponsor move.
15. **Decision firewall and AUP.**
    - Concierge AUP in the MLO and sponsor terms.
    - CI test that nothing imports from lib/concierge into pricing, routing, loan or eligibility.
    - The guard refuses qualification predictions.
    - No offering or negotiating of terms without a recorded MLO act.
16. **Disclosure.**
    - The passport and first contact state that the MLO uses an AI assistant.
    - Auto-sent and live AI messages always carry the footer.
    - Never claim a message was personally written.
    - Answer "are you AI?" truthfully.
17. **Tier 2 auto-send.** Counsel-approved templates with no free-text slots, neutral milestones only, and the not-a-commitment line. No auto-send until counsel signs off.
18. **Plan-doc corrections.**
    - Colorado SB26-189; Utah 13-77-103 and the safe-harbor citation.
    - Withdrawn CFPB circulars; Reg B 2026 rule; FCC 26-67.
    - One-to-one vacatur; Fannie LL-2026-07.
    - Arizona and Texas comp wording; B&P 10137 scope.
    - FL 501.616 citation; TX TRAIGA disclosure scope.
19. **Co-op comp safeguards.**
    - Payer-of-record DB invariant and CI test; invoice credits only.
    - Patronage funded from subscription earnings only.
    - lib/compliance/state-comp-matrix.ts with `counsel_pending` defaults.
    - No lender or settlement-service revenue feeding dividends.
    - check:copy bans "earn", "bonus" and "pay you" near patronage.
20. **GLBA partner rules.**
    - Agent introductions only on a written, revocable client direction.
    - Memory doesn't follow an MLO across sponsors without client re-direction.
    - Co-borrowers kept separate and no group MMS.
    - Status after an ownership change goes only to people still on the loan.
21. **Safeguards controls.** Encryption of memory and the vault, MFA, logging of memory reads, and the Concierge in the incident-response plan.
22. **Red-team gate (tests/concierge-redteam-cases.ts).**
    - End-to-end injection through the signed `handleInbound`.
    - Multi-sweep memory poisoning.
    - Cross-tenant roles and the double-approve race.
    - Fallback-model coverage and canaries.
    - Six-item tripwire.
    - Rate-baiting, protected euphemisms in both directions, casual revocations, and Spanish versions.
23. **Signal registry (lib/concierge/signals.ts).**
    - Source classes, `fcra:true` exclusions and a blocklist (triggers, life-event lists, NCOA, accessibility permits).
    - A triage whitelist with no sub-state geography or loan-size bands.
    - Updated PMI Exit (LL-2026-07, improvement path, midpoint, HELOC warning).
    - Ownership Change Desk and Annual Review Desk.
24. **Deferred until after launch.** A2A Agent Cards, PACT gateway, Mortgage Agent Profile, certification mark, OSCAL and MCD companion dataset, Texas sandbox. Keep only the optional FNPRM reply comment (due 2026-12-28) after antitrust counsel.
25. **Close remaining unverified items before launch.**
    - CIPA and RCW 9.73, CA ADAD, AZ 44-1271, Civ. 1632.
    - 64.1200(m), FCC 24-84, Reg B 1002.6(b)(5), Reg N 1014.3, Reg H 1008.103.
    - State ad rules, TX §50(a)(6), Safeguards 314.4(c)(3)/(c)(5)/(j).
    - WA CEMA damages (2026 c 135), the full FCC-26-67A1 order.
    - MMI main terms, Twilio first-party status, NMLS B2B fees, ATTOM commercial terms.
    - Next session needs access to docs.fcc.gov, leginfo.legislature.ca.gov, law.justia.com, www.mmi.io, help.twilio.com and www.sml.texas.gov.