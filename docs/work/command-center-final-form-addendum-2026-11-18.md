# Final form addendum, 2026-11-18

*This addendum goes with `docs/work/command-center-final-form-2026-11-18.md`. It is a plan, not legal advice. **[COUNSEL]** marks a point that needs a lawyer's sign-off, and **[OWNER]** marks a decision for the founder. Status labels: **verified** means a primary source was opened, **partly** means a secondary or partial read, **unverified** means from knowledge or blocked.*

**How this was checked.** Seven research passes and three adversarial reviews ran on 2026-11-18. Primary sources were opened with curl through the session proxy, including leg.colorado.gov, le.utah.gov, cppa.ca.gov, ecfr.gov, govinfo.gov, federalregister.gov, app.leg.wa.gov, tcss.legis.texas.gov, azleg.gov, oregonlegislature.gov and the vendor terms pages. Some hosts were blocked: leginfo.legislature.ca.gov, law.justia.com, docs.fcc.gov, www.mmi.io, nmlsconsumeraccess.org, the Twilio help center and Meta's help pages. Any California statute point therefore rests on a public.law mirror or on knowledge. In this pass I also opened RCW 19.190.020, .040, .060 and .070 live. Code claims were checked against `lib/concierge/*`, `lib/send-gate/gate.ts`, `lib/today/rank.ts`, `lib/contacts/service.ts` and the sweep route.

**The short version.**
1. The final plan never mentions the Concierge, which D8 built and D9 reused. This addendum adds it and places it in the roadmap.
2. D8 has real defects:
   - Rates leak into the model.
   - A raw client text reaches the brief's trusted header.
   - Memory can be poisoned.
   - Admin roles can read across companies.
   - A double click sends a text twice.
   - The daily sweep cannot get past about two loan officers.

   These get fixed before anyone uses it daily.
3. Several legal facts in the plan are out of date: Colorado, Utah, FCC 26-67, the HPPA wording, the state comp rules and the PMI-solicitation premise.
4. Washington, the home state, has a text-message law (CEMA) that no earlier pass mapped.
5. Carrier rules may leave broker mortgage marketing without any 10DLC campaign to send on. Proactive Concierge outreach should therefore go by email first.

---

## 1. What this research changes in the final plan

### §1 Thesis

- **HPPA (now verified).** Replace "restricted (MED-HIGH)" with the statute's words. A credit bureau may furnish a mortgage-trigger report only to support a firm offer of credit, and only to a recipient in one of four groups:
  - it has the consumer's certified authorization;
  - it "has originated a current residential mortgage loan" of the consumer;
  - it services that loan;
  - it is a bank or credit union holding a current account.

  The Act took effect 2026-03-04 (https://www.govinfo.gov/content/pkg/PLAW-119publ36/html/PLAW-119publ36.htm). Whether a brokering sponsor "originated" the loan is [COUNSEL]. Keep the refusal anyway: the lawful path is narrow and tied to an offer, so it gives no basis for relationship outreach.
- **UWM Mia (verified, sponsored source).** About 50,000 broker loan officers use it, and UWM claims about 3 million calls. It "will not quote rates". It launched switched on by default, and UWM's CTO reported "a decent amount of immediate opt-outs" (https://www.housingwire.com/articles/uwm-mia-borrower-engagement/). The conflict point stands: one wholesaler holds the broker's past-client conversations. *Warne v. UWM* (D. Colo. 1:26-cv-00424) is a TCPA class action, but it is **not** attributed to Mia (partly).
- **Add a fifth pillar: the loan officer's own agent, lender-neutral, off by default.** The Concierge is switched on per loan officer and then per client. Its memory belongs to the sponsor's tenant under the GLBA rules (see §19 below), not to a wholesaler or a data vendor.

### §2 Market

Add a table of AI relationship agents. It is for internal use; none of it is public copy until substantiated.

| Product | What it actually does | What to take, and what to refuse |
|---|---|---|
| Meta Muse (US launch 2026-09-08) | Runs in its own VM. A separate **Sentinel** agent must approve anything that reaches the internet. Muse never sees credentials. Full audit trail of done and planned actions. Read-only or send access per connector (verified, https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/). A widely reported failure: it accepted a lowball offer, gave out a home address and claimed the user was home (https://thenextweb.com/news/meta-muse-facebook-marketplace-address-buyer-robb) | Take the split between the agent and its egress guard. Make commitments impossible, not merely approved |
| Instinct (Spear Street Technology) | Consumer agent. "Personal use only", $100 liability cap, trains on user data by default with an opt-out, no published DPA (https://www.instinct.com/terms, https://www.instinct.com/privacy). Fell for an email prompt injection that asked it to send back the user's to-dos (partly) | Every inbound message is data. Consumer agents are not a GLBA service provider |
| Total Expert AI Sales Assistant | Autonomous outbound and inbound voice. Discloses AI "when required by law or if prompted". Captures "helping their child buy a house" and "downsizing for retirement" (https://www.totalexpert.com/features/ai-sales-assistant, https://www.totalexpert.com/blog/building-context-engine-ai-lending) | Refuse both: disclosure is always structural, and there is no family or age capture |
| Lofty | Sales and Homeowner agents with segments such as "Pre-Foreclosure" and "Absentee Owner"; a 50/50 lender-agent cost split; an MCP server scoped to the user's permissions (https://lofty.com/ai/homeowner-agent, https://lofty.com/solutions-lenders) | Refuse distress segments and fixed cost splits. Take user-scoped tools |
| Shape, 21X (Structurely) | Voice agents that call new leads at any hour. 21X lists $0.07 per voice minute and $0.02 per message (https://www.structurely.com/pricing) | Neither publishes a consent method |
| Salesforce Agentic Advisor | A "strict human-in-the-loop" design with household mapping (https://www.salesforce.com/blog/agentic-advisor-agentforce-financial-services/) | Take the approval framing. Refuse household graphs |
| Jump, Zocks | Find needs from the advisor's own meetings. Zocks: "never records" (https://www.zocks.io/) | Take "needs come from conversations, not bought data". Their transcription pattern does not survive WA and CA wiretap law (see §4.7) |
| Superhuman | Drafts "in your voice" and shows read statuses (https://superhuman.com/mail) | Refuse open tracking. Opens never become an intent signal |

Two findings change how we talk about the category:
- No vendor publishes outcomes with a denominator, consent method, opt-out rate or error rate (verified, absence of evidence).
- Salesforce's own CRM-agent benchmark found about 58% single-turn and 35% multi-turn success, with "near-zero inherent confidentiality awareness" (https://arxiv.org/abs/2505.18878). Unattended multi-turn client conversation is not ready.

**Line 143, FCC 26-67 (now verified).**
- Adopted 2026-09-30, published at 91 FR 67214 on 2026-10-26, effective **2026-11-25**.
- A caller that *designates* an exclusive revocation method (key press, one of the seven reply words, or a named website or number) does **not** have to process other methods. Only callers that don't designate must honor any reasonable means.
- A revocation in reply to a marketing message revokes all of that caller's marketing. A revocation in reply to an informational message may be limited to that category.
- The new (a)(12) drops "one-time" and "the only additional message". A confirmation text must only confirm.
- Source: https://www.govinfo.gov/content/pkg/FR-2026-10-26/pdf/2026-21821.pdf.
- A companion FNPRM (91 FR 67239) takes comments until 2026-11-25 and replies until **2026-12-28**.
- Correction to the research: the final plan's line 143 never said designating callers must honor any means. The overnight ideas doc (line ~1020) is the doc that needs a wording fix.
- **Decision to record:** we deliberately do not designate an exclusive method. Reasons:
  - state law keeps other routes open (CGS 42-288a, Fla. Stat. 501.059(5), Va. Code 59.1-514);
  - *McLaughlin v. McKesson* (606 U.S. 146, 2025) frees district courts from the FCC's reading;
  - it is the owner's binding rule.

**Line 143 area, the one-to-one rule.** It was vacated (mandate 2025-04-30) and its text removed effective 2025-08-29 (https://www.federalregister.gov/documents/2025/08/29/2025-16641/...). Keep consent per seller anyway. Connecticut, Florida and Twilio all require it. Remove any wording that calls it a federal rule.

**Data providers paragraph.**
- **RETR (verified, terms of 2026-09-17).** Section 8.1 bars *displaying* or reproducing anything obtained from RETR without prior written permission. Section 6 bans AI use, rules engines and "derivative datasets". "Display only", which D6 built, therefore also needs permission. **[OWNER]**:
  - email api@retr.app now;
  - prefer the approved iFrame or Level 2 partner path;
  - drop the buyer-name and MMCT/LMI columns at the parser.
- **Model Match (terms of 2024-08).**
  - Section 3.2(i) bars "marketing or solicitation purposes".
  - Section 3.5 bars use in "any employment decision", which covers recruiting.
  - Section 3.2(iii) and (vi) bar pooling across tenants (service-bureau use).
  - It does offer MCP and API under the user's own account.
- **MMI Lead Store.** "No TCPA consent or DNC validation included", and appended contacts may not be transferred (https://store.mmi.io/terms-and-conditions). Treat these contacts as consent = none.
- **ATTOM self-serve API.** Evaluation only. No database, and no cache longer than 24 hours (https://api.developer.attomdata.com/legal). A negotiated licence is needed before any production use.
- **NMLS Consumer Access.** Use is limited to deciding whether to do business with the licensee. Solicitation, display, databases and bulk monitoring are banned. **NMLS B2B ACCESS** is the sanctioned channel for compliance verification, and it also bans solicitation (https://mortgage.nationwidelicensingsystem.org/knowledge/Products/b2b/Shared%20Documents/NMLS%20B2B%20ACCESS%20AGREEMENTv4_20.pdf).

### §3 Ownership: state "paid only by sponsor" rules (lines 162–165)

None of the five states' statutes or rules that were read has a general sponsor-only payment rule. Replace the three examples with these:
- **Arizona.** 6-909(B) and 6-947(B) bar licensees from *paying unlicensed people*. They say nothing about value reaching a licensed loan officer. The real Arizona issue is the one-employer rule, 6-991.02(E) and (M).
- **Texas.** SML's published exam point (Mortgage Industry Day, 2025-11-03) is: "Commissions must be paid directly to the sponsored MLO", not through the MLO's unlicensed entities (https://www.sml.texas.gov/wp-content/uploads/2025/11/Exam-Common-Violations-2025-11.03.2025.pdf). Separately, 7 TAC 55.107(b)(7) allows several disclosed sponsors.
- **California.** B&P 10137 binds only DRE salespersons, and only for licensed activity. LoanM8's California loan officers hold DFPI CFL licences (`config/licensing.ts`), so it does not reach them.
- **Oregon.** One mortgage lender at a time (ORS 86A.178(2)).

The binding limit is federal: Reg Z comment 36(a)-5 ignores labels, and 36(a)-5.vi protects only bona fide equity returns allocated by capital (https://www.consumerfinance.gov/rules-policy/regulations/1026/interp-36/). Two changes follow:
- Patronage pools draw only from subscription net earnings, which keeps them outside "mortgage-related business" under comment 36(d)(1)-3.v.B.
- Close every *services-pay-to-loan-officer* lane (contributor bounties, ambassador grants) in AZ and OR until counsel rules.

Add `lib/compliance/state-comp-matrix.ts`. The patronage engine refuses any state not marked `counsel_approved`.

### §4.1 State laws block (lines 355–364)

- **Colorado.** SB24-205 was repealed and re-enacted as **SB26-189**, signed 2026-05-14 and effective 2027-01-01. It covers only "covered ADMT" in consequential decisions, which include lending. It has no AI-interaction disclosure, no impact assessment and AG-only enforcement (https://leg.colorado.gov/bill_files/116489/download). A draft-for-human-review tool is excluded under 6-1-1701(2)(b)(II), and so is marketing under (3)(b). Colorado is not a live state, so it ranks below WA, OR, AZ, CA and TX.
- **Utah.** Now Utah Code **13-77-103**. Disclosure is required in "high-risk" interactions, including financial data and services. The safe harbor is disclosure at the outset and throughout, and the penalty is $2,500 per violation (https://le.utah.gov/xcode/Title13/Chapter77/13-77-S103.html). LoanM8 has no Utah licence. What still applies is "answer truthfully if asked whether it's AI". The research cites the safe-harbor section inconsistently (13-77-104 in one place, 13-75-102 in another), so confirm the number before anyone quotes it.
- **California CCPA ADMT.** Compliance is due 2027-01-01. Real human involvement takes a tool outside ADMT (§7001(e)), and advertising is excluded (§7001(ddd)(6)) (https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf). The CCPA exempts GLBA *data*, not GLBA entities. Concierge memory about pre-application contacts and agents is therefore California personal information, with deletion rights.
- **Texas TRAIGA** (effective 2026-01-01). It bans *intentional* discrimination. Its AI-disclosure duty binds government agencies and health care, not brokers (https://capitol.texas.gov/tlodocs/89R/billtext/html/HB00149F.htm). Our Texas AI disclosure rests on our own rule.
- **Reg B final rule** (91 FR 21620, effective 2026-07-21). It says ECOA has no effects test and narrows discouragement to a reasonable-person standard, with images and video counting as statements. HUD's Fair Housing Act disparate-impact changes are only proposed (https://www.govinfo.gov/content/pkg/FR-2026-04-22/html/2026-07804.htm). The firewall stays, because state law and FHA disparate treatment still apply.
- **CFPB withdrew** Circulars 2022-03, 2023-03 and 2022-04 on 2025-05-12. Stop citing them. Reg B 1002.9 still stands.
- **Washington CEMA, RCW 19.190 (new and verified this pass; missing from every earlier pass):**
  - A commercial text to a Washington resident's phone is lawful only if the person "clearly and affirmatively consented in advance" (19.190.070(1)(b)). There is no EBR exception. A violation is a Consumer Protection Act violation (19.190.060(2)).
  - Damages are "$100, or actual damages, whichever is greater" (19.190.040, amended by 2026 c 135). This applies to suits filed on or after 2026-06-11, whenever the cause arose.
  - Commercial email to a Washington resident may not use a subject line that, on actual or fairly implied knowledge, "contains false or misleading information" (19.190.020(1)(b)).
  - Sources: https://app.leg.wa.gov/RCW/default.aspx?cite=19.190.060, …=19.190.070, …=19.190.040, …=19.190.020.
  - The gate already requires *written* permission for marketing texts (`gate.ts`, `WRITTEN`), which likely satisfies 19.190.070. Whether an imported "written" flag is enough is [COUNSEL]. Email subject lines have no guard today.
- **Washington calls, RCW 80.36.390 (verified by a reviewer).** Calls run 8 AM–8 PM. After a "no": end within 10 seconds, no further solicitation at any of the person's numbers for one year, and never sell or give away their information. These become required steps in the call flow.

### §4.3 Conversations

- **Make email the default channel for proactive Concierge touches.** Twilio's published US guidelines list "Third Party Mortgage Loan", "Lead Generation" and "Shared Phone Numbers" as restricted. Error 30897 rejections of loan marketing are "ineligible for resubmission", and 30443 allows first-party loan content only when it is not promotional (https://www.twilio.com/en-us/guidelines/us/sms, https://www.twilio.com/docs/api/errors/30897). Whether a broker sponsor counts as "first party" is unverified, so get Twilio's answer in writing. Until then, SMS carries replies, customer care and loan status.
- **Code finding that blocks email-first.** `gate.ts` step 3 skips the licensing check for email (`if (marketing && i.channel !== "email")`), so a marketing email to an unlicensed state passes. Fix this before email becomes the proactive lane.

### §4.6 Partners

- **Buyer-agent status updates during an active loan** require the borrower's authorization in the consent passport. The Reg P 1016.14 processing exception may apply [COUNSEL].
- **Telling an agent that a past client "may sell" is an NPI disclosure and looks like a lead transfer.** It is allowed only on the client's written direction (6802(e)(2), 1016.15(a)(1)), and never in the reverse direction.

### §4.7 AI voice

- **Prices (verified):**
  - Twilio outbound is $0.0140 a minute, not $0.013 (https://www.twilio.com/en-us/voice/pricing/us).
  - Google Speech-to-Text V1, which `/api/m8-listen` calls, is $0.024 a minute. V2 is $0.016, and V2 dynamic batch is $0.003.
  - Text-to-Speech Chirp 3 HD is $30 per million characters, and Studio is $160. Studio-O and Studio-Q are in the voice picker today.
  - Sources: https://cloud.google.com/speech-to-text/pricing, https://cloud.google.com/text-to-speech/pricing.
- **Transcribing a client call live is interception, even if the audio is thrown away.** It falls under WA RCW 9.73.030 and Cal. Penal Code 631 (*Ambriz*; from knowledge). Use the loan officer's own post-call dictation instead: no client audio is processed, and it works in all five states.
- **California Pub. Util. Code 2871–2876 (unverified).** Keep AI-voice calls to California numbers blocked until counsel clears it, even with TCPA consent.
- **FCC 24-84** (AI-call disclosure NPRM; status unverified). Name "AI-generated voice" separately in the consent passport.

### §4.8 Past clients

- **PMI Exit.** Fannie Mae LL-2026-07 (2026-09-16) lets servicers proactively solicit MI termination. That is partly verified, via Orrick (https://infobytes.orrick.com/2026-09-25/fannie-mae-announces-servicers-may-proactively-solicit-borrowers-for-mortgage-insurance-termination/); the live Guide text is unchanged. The "servicers can't solicit" premise is gone, and our edge becomes being first and thorough. Add:
  - the HPA midpoint final-termination date;
  - a warning that a subordinate lien blocks a borrower-requested cancellation (12 U.S.C. 4902(a)(4)(B)), wherever a HELOC is discussed;
  - the improvement path: seasoning is waived at 80% LTV or lower when improvements raised the value.
- **FHA MIP** lasts 11 years at a base LTV of 90% or less, otherwise for the full term (ML 2023-05, https://www.hud.gov/sites/dfiles/OCHCO/documents/2023-05hsgml.pdf).
- **Texas home equity** (Tex. Const. art. XVI §50(a)(6); from knowledge). Each project-cash play needs a Texas override that never implies availability.

### §4.11 Agents and standards

PACT (https://decagon.ai/blog/introducing-the-personal-agent-consent-trust-protocol-pact), Meta's Poppy, A2A v1.0, AP2 mandates, IETF Web Bot Auth, SD-JWT (RFC 9901) and OpenID4VP 1.0 all exist. All are weeks to months old. **Defer every one for launch.** When the gateway is built:
- use PACT-shaped scopes (`loan_status:read`, `docs:upload`, `appointment:book`);
- never a scope for consent, an application, an SSN or DOB, or a rate;
- in v1, answer from code templates only; no LLM reads text sent by an agent.

The **Licensed Agent Registry** may publish only the loan officer's self-reported NMLS data from `config/licensing.ts`. It must not use Consumer Access (its terms forbid it).

### §6 Integrations

- **Twilio (verified).**
  - Use ISV architecture #1: a subaccount, Secondary Customer Profile and brand per sponsor EIN.
  - The limit is 5 brands per tax ID. Never create a brand per loan officer.
  - Moving to subaccounts **resets Twilio's account-level opt-outs**, so replay `cc_optouts_v2` before cutover.
  - The T&C page must be on the sponsor's own domain.
  - Fees: $4.50 brand plus $41.50 vetting (https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv, https://www.twilio.com/docs/trust-hub/registrations/a2p-10dlc-brand).
- **Anthropic.**
  - Enable ZDR for the Concierge organization or workspace.
  - Message Batches and the message-threads beta are **not** ZDR-eligible, and Batch keeps data 29 days (https://platform.claude.com/docs/en/manage-claude/api-and-data-retention). Opus, Sonnet and Haiku 5.5 are not Covered Models.
  - Use a separate workspace, key and spend limit from the public `/chat`.

### §7 Business model

- **AI line.** D8 as built costs about $0.036 per client reviewed on Opus 5.5, or about $13 per loan officer per month for 12 reviews a day. That is partly verified: the prices are verified (https://platform.claude.com/docs/en/about-claude/pricing) and the token counts are assumed.
- With one call per client, code pre-filtering and a fixed cache point, full-book coverage is about **$2–5 per seat per month**. The $5–15 planning line holds only after those fixes.
- Include the Concierge in the seat. Publish a fair-use allowance, charge overage at cost, and show a per-seat spend meter with a hard cap that falls back to template mode.
- **Never** price per reply, per retained client or per loan.
- **Texting.** One curly apostrophe turns a 300-character text from 2 segments into 5 (UCS-2), roughly 2.5 times the cost (https://www.twilio.com/docs/glossary/what-sms-character-limit). Add an encoding guard.

### §9 Risks

Add these rows:
- prompt injection into memory and tasks;
- AI commitments (price, approval odds, dates, availability);
- protected-trait inference through memory;
- discouragement by silence (see idea 6);
- cross-tenant reads by admin roles;
- disclosing NPI to whoever now holds a reassigned number;
- silent model fallback;
- WA CEMA;
- a borrower's AI being injected by our own drafts (invisible characters).

### §10 Roadmap

Built so far is D1–D9, and its numbering differs from the plan. The revised order is in §4 below.

---

## 2. Defects in the built Concierge (D8) and scripts (D9)

All were checked in code. Severity runs from 1, the most serious.

1. **Cross-tenant reads.** `canSee` lets every non-`lo` role see every contact (`lib/contacts/service.ts:26`), and `scopeOf` returns `undefined`. Owner, team lead and assistant roles therefore see every loan officer's Concierge memory, and `ask()` sends every loan officer's card reasons, including raw client excerpts, to the model. Script building inherits this ("admins can, as in `canSee`"). Once there is a second sponsor, this crosses financial institutions (GLBA, Safeguards 314.4(c)(1)). The memory query also filters on `contact_id` only (`lib/concierge/store.ts:185`).
2. **A raw client text in the trusted header.** The `reply` card reason is the client's last 80 characters (`lib/today/rank.ts:58`). It lands on the "Why they're in today's list" line (`agent.ts:103`), outside `<client_message>` and unescaped. `firstName` from CSV, memory `fact` and `kind` are also unescaped.
3. **The rate leaks.** The `rate_gap` reason ("Their note rate is X%… priced example … Y%", `rank.ts:78`) goes into the brief. PATCHLOG's "never its rate" is false, and the test misses it.
4. **Memory poisoning.** A model-written paraphrase rides on a 4-character quote match (`guard.ts:51`), takes effect immediately, is fed back as trusted text, and skips `guardReply`. `relationship` is an allowed kind (`store.ts:50`), which invites household graphs.
5. **Unreviewed state changes.** Tasks and memory need no approval, and nothing stops a task such as "Call 555-0100 to verify your NMLS". The proposal `why` field is never checked by `protectedTopic`.
6. **A STOP still triggers a model run** (`agent.ts:261`), which can write memory about a person who revoked.
7. **Double send.** `approve()` checks `pending`, sends, then writes (`desk.ts:17-31`), so two clicks send twice. Unedited bodies are not re-checked at approval, and drafts are not marked stale when new inbound messages or a revocation arrive.
8. **Discouragement by silence.** The prompt says "If a client mentions one, ignore it" (`agent.ts:52`). The guard refuses "social security", "child support" and "section 8". "Can you count my Social Security income?" therefore gets no draft and no task, which is unequal service on exactly the grounds Reg B 1002.6(b)(5) protects (from knowledge). The language ban sits in the prompt; the regex catches only "speak(s) Spanish…".
9. **False refusals.** The whole draft, greeting included, is scanned. "Hi Christian", "Temple, TX", "White Salmon WA", "Black Diamond WA", "visa" and "retire my HELOC" are all refused.
10. **Silent fallback.** `fallbacks: "default"` (`agent.ts:124`) can answer an attacker-shaped refusal with a model the red-team gate never tested. The audit records the configured model, not the one that actually served the request. `fallbacks` is also invalid in Batch (https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback).
11. **The sweep cannot finish.** One serial loop over 200 owners runs inside `maxDuration = 300`, and `.catch(() => null)` swallows failures (`app/api/cc/concierge/sweep/route.ts:11,19,22`). After roughly the first one or two loan officers, everyone else is silently left unswept.
12. **The cache point is in the wrong place.** Top-level `cache_control` caches the unique per-client brief, so the shared prefix is never read back.
13. **Smaller items:**
    - Expired memory is never purged (Safeguards 314.4(c)(6) requires disposal).
    - Drafts have no URL or phone allow-list.
    - Invisible characters (`Cf`, U+E0000–E007F, bidi controls) are not stripped, so our drafts could inject a borrower's own AI.
    - `ask()` has no protected-topic check.

---

## 3. The best new ideas

Each idea says how it works, its compliance design, and why it is new. Ideas already in the plan docs, such as Delegation Envelopes, Reviewer Proof, Accommodation Memory, Hardship Lifeline, Time Capsule, Day Shape and Instruction Receipts, are only extended here, not restated.

### 1. Steward: the Concierge holds no keys

- **How it works.**
  - The Concierge process has no network egress and no Twilio, Resend, ARIVE or calendar credentials.
  - It emits typed intents only: `draft`, `send_request`, `task`, `calendar_hold`, `memory_candidate`.
  - A separate non-LLM **Steward** holds the credentials. It runs the D3 gate, the delegation limits, the consent tier, quiet hours and a **per-recipient egress rule**: output may go only to the contact the brief was built for, or to the loan officer. Any third party (realtor, co-borrower, portal) needs a Partner Room or direction record naming that recipient.
  - Every A2A reply, MCP reply, email reply and portal submission is its own channel type in the Steward, so "every outbound passes the gate" covers machines too.
- **Compliance.**
  - It meets Meta's Agents Rule of Two (https://ai.meta.com/blog/practical-ai-agent-security/). The model combines untrusted input with private data but cannot act externally on its own.
  - It covers Safeguards 314.4(c)(3) encryption of the vault.
  - Portal NPI goes out only under 1016.14 for an in-process loan.
- **Why new.** Delegation Envelopes define *limits*. This removes the *ability*: credentials and egress sit outside the model process, and the egress rule is per recipient.

### 2. Reader and Planner split, with templates that have no free-text slots

- **How it works.**
  - The **Reader** is the only model that sees raw client text. It has no tools. It returns zod-validated enums (intent: revocation, complaint, lock request, need stated, question, sensitive, other), need codes, and quote spans as message id plus offsets.
  - The **Planner** sees only that output plus trusted LOS and CRM fields, and picks a template id plus typed slot values.
  - Tier 2 messages are rendered by code from templates whose slots are only enums, dates or numbers from trusted fields.
  - Tier 1 free-text drafts keep a human gate.
- **Compliance.** It is the CaMeL and action-selector pattern (https://arxiv.org/abs/2503.18813, https://arxiv.org/abs/2506.08837). Injected text can change at most a slot value, never the action or the recipient.
- **Why new.** No plan doc separates reading from planning. The "no free-text slot" rule closes the gap in the research's own CaMeL proposal.

### 3. Commitment Lock

- **How it works.** Some statements can never be granted "Allow for this play" or "Always allow". Each needs per-message approval, and some are refused outright:
  - price, rate, fees or payment;
  - approval status or approval odds ("should be fine", "won't be a problem");
  - a closing date;
  - a third party's timeline (appraiser, title, servicer);
  - the loan officer's availability or whereabouts;
  - any dollar figure, date or number taken from the brief, unless the client said it first;
  - any PII going to a third party.

  Appointment offers may quote only live free slots from the calendar. The Concierge never accepts terms on anyone's behalf.
- **Compliance.**
  - Reg Z rate rules.
  - Reg H and Reg Z: "offering or negotiating terms" is licensed activity, so the AI and LoanM8 LLC must never do it.
  - It blocks NPI echoes to reassigned numbers and ex-spouses.
- **Why new.** It comes from Muse's Marketplace failure. The plan's Quote Ledger covers rates only, and D8's `checkDraft` catches only "approved", "guarantee" and "lock".

### 4. Need Codec with a fixed pipeline order

- **How it works.**
  1. Redact protected-class spans from inbound text before any brief exists ("[personal detail removed]"). The original stays in the thread the loan officer sees.
  2. The Reader extracts a closed need code: `more_space`, `less_space`, `relocate_work`, `sell_and_buy`, `keep_and_rent`, `second_home`, `investment_purchase`, `project_cash`, `consolidate_debt`, `lower_payment`, `pay_off_faster`, `drop_mi`, `ownership_change`, `add_or_remove_owner`, `escrow_question`, `insurance_change`, `tax_change`, `rate_question`.
  3. Timing comes **only from a date the client stated**, never from a gestation or life-stage calculation.

  Memory stores the code, the timing and a pointer (message id plus span hash). The model sees codes only. Quotes are visible to the loan officer only. Every code starts **pending** until the loan officer taps Keep. CI invariance test: the same sentence with and without its protected clause must give an identical code and timing.
- **Compliance.**
  - Reg B 1002.5(d)(3): never ask about childbearing intentions.
  - FHA 3604(c) and 3605.
  - WA MHMDA RCW 19.373.010, because a health status inferred from non-health data counts as health data.
  - The memory-poisoning path closes because model paraphrase never re-enters a prompt.
- **Why new.** Relationship Memory said "family cues become timing only". This makes it testable, and it removes the reason the model ever reads the cue.

### 5. Need Signal Registry and admissibility test

- **How it works.** `lib/concierge/signals.ts`, effective-dated like `rules.ts`. Each signal row records:
  - its source class: client stated, own-loan math, borrower-forwarded document, public record matched to the loan officer's own client, or platform event;
  - its citation;
  - its purpose (service or marketing, under Reg Z comment 2(a)(2) and CAN-SPAM 7702(17));
  - allowed outreach, expiry and per-state overrides;
  - its counsel status.

  A signal is admitted only if all of these hold:
  - the client said it, or code computed it from their own loan or a document they supplied;
  - it is not consumer-report data (credit-report fields are tagged `fcra:true` and code bars them from every brief, since 15 U.S.C. 1681b(f) means the original tri-merge cannot be reused for marketing);
  - it is not a protected class or proxy under the federal list or the property state's list;
  - it was not bought from a life-event or data-broker list;
  - it does not come from a per-person NCOA lookup (USPS bans single queries, https://postalpro.usps.com/NL_Sole_Purpose_Reminder);
  - it has a service-first message and a "do nothing" outcome.

  `consolidate_debt` is accepted only when the client states it. A test fails when the sweep uses an unregistered signal.
- **Why new.** It is the first written test of "lawful signal" in the plan.

### 6. No silence on sensitive inbound messages, and a guard with two modes

- **How it works.** A protected-topic hit in an *inbound* message never means drop. Instead:
  - Code sends a neutral holding reply through the gate: "I've passed this to [first name], who will answer you directly." It names no time.
  - The thread is routed to the loan officer as a high-priority "reply personally" task with a visible timer.
  - Concierge drafts pause for that contact.
  - Hardship and life-event messages ("my husband passed", "we're divorcing", "I lost my job") add a marketing pause and point to the Ownership Change Desk or the servicer's successor-in-interest process. Cash-out and consolidation pitches are never made there (UDAAP).

  The guard runs in **origination mode** when the model raises a topic (block) and in **responsive mode** when the client raised it and the loan officer answers by hand (allow, logged).
- **Compliance.** Reg B 1002.6(b)(5) income treatment and 1002.4(b) discouragement (from knowledge). It also answers the CFPB chatbot report's "doom loop" warning (https://www.consumerfinance.gov/data-research/research-reports/chatbots-in-consumer-finance/chatbots-in-consumer-finance/).
- **Why new.** Every plan doc treats the firewall as "don't infer". None notices that refusing to answer is itself the fair-lending harm.

### 7. Revocation-first, with zero model calls after a STOP

- **How it works.**
  - On every inbound message, a code parser runs before anything else, with the model as a fallback for casual phrasing ("lose my number", "I'm good, no more").
  - A revocation produces no model call, no memory and no task.
  - Pending drafts for that phone go stale.
  - One confirmation goes out within 5 minutes. It only confirms: no question, no "reply START", no marketing (new 64.1200(a)(12)).
  - An agent-relayed or third-party stop is honored without identity checks, because over-blocking is the safe failure. Delete and correct requests do get verified, on the 11 CCR 7063 pattern.
  - House rule: a phone revocation also suppresses marketing email.
  - Every revocation records the words used, the scope applied and `revocation_basis: any_reasonable_means`.
- **Why new.** It extends Guard Commons' revocation lexicon with the rule that a revoked person never re-enters the model, and it updates for FCC 26-67.

### 8. Real-time reply lane with phone approval

- **How it works.**
  - An inbound text, or an ARIVE milestone change, triggers a single Concierge call within about 60 seconds.
  - The real-time lane uses ZDR, one tool turn, and an explicit cache point at the end of the system prompt.
  - A push notification goes to the loan officer's installable app: approve, edit or dismiss.
  - Templated, code-rendered service messages (status notes, document reminders) can be approved several at once with one tap. Free-text drafts are always approved one by one.
- **Compliance.** Approval re-runs `checkDraft` with its rule version and the gate, using compare-and-swap (`status='sending'`) plus a Twilio idempotency key.
- **Why new.** The research shows response time, not cost, drives weekly use. The plan has no real-time Concierge lane.

### 9. A touch budget per client

- **How it works.** These defaults are engineering judgment, to be tuned on opt-out and reply rates:
  - at most 1 proactive touch per 30 days and 6 a year, across all channels;
  - nothing proactive for 45 days after closing;
  - only status messages during an active loan;
  - 90 days of silence after "no thanks" or a complaint;
  - nothing proactive while a client's message is unanswered.

  The sweep checks the budget *before* calling the model.
- **Why new.** The gate's caps are legal ceilings, and the Throughput Governor caps the loan officer's capacity. Neither is a per-person relationship cadence.

### 10. "Promises I made" ledger, pre-call brief and end-of-day lane

- **How it works.**
  - The Concierge reads only the loan officer's *own* outbound texts, emails and dictation for commitments ("I'll send numbers Tuesday"). Each becomes a dated task and a nudge.
  - Ten minutes before a booked appointment: the last three interactions, loan facts, need codes, opt-out scope (for example "no texts, email OK") and what not to bring up.
  - At end of day: what it did, what is waiting, and tomorrow's planned touches. This is Muse's "what it did and plans to do", in a form loan officers will read.
- **Compliance.** It never makes promises itself, so the Commitment Lock still holds. It reads no client words.
- **Why new.** No doc has a commitment tracker for the loan officer's own promises.

### 11. Annual Review Desk and Ownership Change Desk

- **Annual Review Desk.**
  - The client books it themselves.
  - Invitations carry no rate, payment or term. An organized solicitation is an advertisement under Reg Z comment 2(a)(2); the individual report shown after booking is a direct personal contact.
  - The agenda comes only from the client's own loan:
    - HPA request, automatic and midpoint dates;
    - the FHA 11-year date;
    - ARM and buydown dates;
    - the last escrow analysis;
    - an equity *range* labelled as an estimate, never used for a decision (AVM rule 1026.42(i));
    - one neutral question, "Anything changed that affects your home plans?";
    - a "do nothing" baseline.
  - A soft pull happens only on a fresh written instruction (1681b(a)(2)), or the client pulls their own report at AnnualCreditReport.com.
  - Booking counts as an inquiry, which gives a 3-month EBR for DNC purposes only. In Washington, a text invitation needs prior affirmative consent.
- **Ownership Change Desk.**
  - Triggered only when the client says so or uploads a document: a trust transfer, a death, a divorce decree, or adding or removing someone on title.
  - It explains that 12 U.S.C. 1701j-3(d) may mean no refinance is needed, and links to the servicer's successor-in-interest process (Reg X 1024.38(b)(1)(vi), requests under 1024.36(i)).
  - Only the code `ownership_change` is stored, never the event. Churn Guard marks any refinance in this context "only if the client asks". Loan status then goes only to people still on the loan.
  - Sources: https://www.govinfo.gov/content/pkg/USCODE-2024-title12/html/USCODE-2024-title12-chap13-sec1701j-3.htm, https://www.ecfr.gov/current/title-12/chapter-X/part-1024/section-1024.38.
- **Why new.** Time Capsule books check-ins but has no agenda rules. No doc covers ownership changes.

### 12. Forward-a-letter inbox and a January 1098 note

- **How it works.**
  - Clients forward the servicer letters that already reveal needs: ARM notices (1026.20(c) and (d)), escrow statements (1024.17), insurance renewals, MI replies and Form 1098s. Each becomes a `borrower_forwarded_doc` signal, and the raw file is deleted after extraction.
  - In January, a service-only email explains the client's own 1098 boxes (interest, box 5 MI, box 6 points). It notes that a servicing transfer can mean two 1098s, says "ask your tax preparer", and contains no refinance line.
- **Why new.** The Lender Mail Room handles the loan officer's lender emails. This makes the *borrower* the source of the signal.

### 13. "What my loan officer's assistant remembers" page, with legal holds

- **How it works.**
  - The page sits off the consent passport, behind OTP or passkey step-up, with opaque ids and a check on owner, tenant and contact. It never shows a co-borrower's facts.
  - The client can delete individual facts. Deletion hides the fact from the Concierge immediately. Hard deletion follows the row's `legal_hold_until`, computed from the longest rule that applies:
    - Reg B 1002.12(b): 25 months;
    - TRID: 3 years;
    - TSR 310.5: 5 years for unique messages;
    - Reg N: 24 months.
  - The page says so in plain words.
  - A nightly purge hard-deletes expired rows, including copies in proposals, tasks and audit details, and leaves hash-only tombstones. Memory is capped at 24 months after last use (Safeguards 314.4(c)(6)).
  - The Concierge acceptable use policy ("never used to evaluate an application") is documented, because it decides whether 1002.12 applies at all.
- **Why new.** Sunlight Receipts shows the consent that was used. Nothing yet shows memory to the client.

### 14. Concierge acceptable use policy and decision firewall

- **How it works.**
  - Sponsor and loan officer terms prohibit using Concierge output in eligibility, underwriting, pricing, terms or choose-state routing.
  - CI enforces it: no import path from `lib/concierge` or `lib/scripts` into `lib/pricing`, `lib/routing` or the gate's rules.
  - The guard refuses qualification predictions and product or lender recommendations ("you should get a HELOC", any lender name). Product options appear only through `lib/pricing/antiSteering.ts`, presented by the loan officer.
  - Hard never-list: no gifts, credits or rewards tied to a referral, to anyone (RESPA 8 reaches consumers); no cost-split proposals; no reciprocity suggestions; no birthday touches from a DOB; no religious holidays chosen per client. Use book-wide home anniversaries and secular notes instead.
- **Compliance.**
  - It keeps the Concierge outside Colorado SB26-189 6-1-1701(2)(b)(II)/(III) and California §7001(e).
  - It respects Reg Z 1026.36(e) anti-steering.
  - Keep a developer documentation pack (model and prompt version IDs, a changelog, 3-year retention) in case a sponsor ever configures it into a decision.
- **Why new.** It is the first explicit AUP plus code firewall for an AI tool in the plan.

### 15. Concierge Scorecard with denominators

- **How it works.** Per member and across the network, real counts only:
  - drafts approved unedited, edited and dismissed;
  - guard refusals, split into true protected hits and false positives;
  - opt-outs within 7 days of an AI-drafted touch versus a hand-written one;
  - complaints per 1,000 touches;
  - the 95th-percentile time to honor a revocation;
  - median time from inbound message to approved reply;
  - time from a rate question to a human answer;
  - promises kept on time;
  - Commitment Lock catches.

  Starting benchmarks from comparable deployments: about 20% draft use in Stanford Health Care's study, which also found no time saved (https://doi.org/10.1001/jamanetworkopen.2024.3201), and about 30% acceptance for Copilot. Copy promises neither time saved nor results.
- **Why new.** No competitor publishes any of this.

### 16. One deadline worth meeting: the FNPRM reply comment

- **What it is.** The owner, or the founding sponsors (the co-op doesn't exist yet), file a short reply comment by **2026-12-28** (91 FR 67239). It would support two-way texting and a one-step revoke-all, with aggregate gate evidence: median time to honor a revocation, and the share of revocations in non-standard words.
- Antitrust counsel should confirm Noerr-Pennington cover for any joint filing (unverified).
- It costs little and has a hard date.

---

## 4. Updated build roadmap

D1–D9 are built. Each patch stops for the owner's sign-off. Texting registration per sponsor moves from D10 to D12, because two Concierge patches carry live data-leak and injection risk.

1. **D10 Concierge containment** (before anyone uses D8 daily).
   - Build briefs from an allow-list of card fields per kind; `reply` cards pass only the kind and age.
   - Nonce-delimited data blocks for every untrusted field. NFKC normalization, then strip `Cf`, tag and bidi characters, and escape `<`, `>` and their fullwidth forms.
   - No model call after a revocation.
   - Compare-and-swap approval plus an idempotency key. Re-check at approval with the guard version. Pending drafts go stale on new inbound messages or a STOP.
   - URL and phone allow-list (only the configured booking and application URLs).
   - Strip invisible characters in `checkDraft` and `sendText`.
   - `protectedTopic` and the URL check on `why`, task titles, Ask answers and the loan officer's voice notes (owner-only edit).
   - Remove the `relationship` memory kind.
   - Pin or disable fallback, and log the served model and system-prompt hash.
   - Prompt canaries.
   - A new `tests/concierge-redteam-cases.ts`, separate from the public-chat suite, run through a signed `handleInbound`: multi-sweep poisoning, a `rate_gap` leak, fake tags, Unicode smuggling, cross-contact requests, rate-baiting and Spanish versions.
   - Pass bar: zero cross-contact actions, zero rate or promise drafts, zero protected memories, at least 99% revocation recall. False refusals tracked separately.
   - *Test:* a `rate_gap` sweep sends no `%` to the model; double approve sends once; a STOP produces no model call.
2. **D11 Tenant walls.**
   - `tenantId` on user, contact, memory, proposal, task and script. Every query filters by tenant and owner.
   - A `(owner_user_id, contact_id, expires_at)` index.
   - `canSee` and `scopeOf` scoped by sponsor tenant and team.
   - *Test:* MLO A's assistant gets 404 or empty for B's contact, B's memory by id, and Ask.
3. **D12 Texting registration per sponsor.**
   - ISV architecture #1, brand per sponsor EIN, campaigns for care, notifications and conversational replies only.
   - Get Twilio's written answer on "first party". Pages on the sponsor's domain.
   - Replay `cc_optouts_v2` before cutover. Stable number per loan officer per sponsor, with a vCard at opt-in.
   - Consent does not follow the loan officer to a new sponsor.
   - *Test:* a STOP from before cutover still blocks after it.
4. **D13 State rows and revocation policy.**
   - WA CEMA: marketing texts need affirmative advance consent, no EBR. WA call flow (80.36.390).
   - CT: prior express written consent for all marketing, naming the means and number; scripts give identity within 10 seconds.
   - VA row. FL 501.616(6): 3 per 24 hours, counted per consumer across every number.
   - TX ch. 302 switch (default off) plus the TX no-call list. Ban copy claiming ch. 302 compliance (302.203).
   - AZ switch off. AI-voice calls to CA numbers blocked.
   - `ruleFor(states[])`: the strictest rule across the area-code state, residence, property state and the loan officer's state, with every state considered logged.
   - Licensing check applies to marketing email.
   - New opt-out confirmation text. Recording and transcription follow the union-of-states rule.
   - Dated public changelog with FCC 26-67 verified.
   - *Test:* a WA marketing text without written consent is blocked; a STOP in reply to a PMI service text blocks marketing.
5. **D14 Memory, needs and the sensitive lane.**
   - Need Codec with redaction first, pending until kept, invariance test.
   - Signal Registry with the `fcra` tag.
   - Nightly purge plus `legal_hold_until`.
   - Protected list widened and made state-aware: veteran or military, creed, citizenship, service animal, source of income, genetic, ancestry, gender expression, and euphemisms (hubby, twins, grandkids, nursery, maternity, empty nest, pension, fixed income, "en español").
   - Names and addresses stripped before the check, with a fixture of benign names and places that must pass.
   - Origination and responsive guard modes. The sensitive-inbound lane (idea 6).
   - Language as a client-stated preference (prompt fixed). A Cal. Civ. Code 1632 "negotiated in [language]" flag (from knowledge) [COUNSEL].
   - *Test:* the 200-case euphemism suite in both directions; "can you count my Social Security" reaches the loan officer within the reply timer.
6. **D15 Concierge operations.**
   - The cron only queues one job per loan officer; a collector cron files the results; a run row per officer with an error class; alert on spikes in refusals.
   - Real-time reply lane with push from an installable app.
   - One call per client; cache point at the end of the system prompt; a code pre-filter (pending draft, no new event, everything blocked).
   - Touch budget. Spend cap with template fallback. SMS encoding guard with a segment count on the card.
   - Promises ledger, pre-call brief, end-of-day lane, Scorecard v1.
   - Triage runs **in code, not Batch**. That avoids the 29-day retention question and the Reg P re-identification question about pseudonymous keys. Haiku triage may come later, ZDR real-time only.
   - *Test:* 50 enabled loan officers are all swept; a failure shows as "not swept".
7. **D16 DNC and reassigned numbers** (the old D10; the gate already has a 31-day DNC field). Before any touch to a number whose consent or last two-way contact is more than 90 days old, query the FCC Reassigned Numbers Database and log the result as the safe-harbor record (64.1200(m), from knowledge). Required before any proactive outreach to an old book.
8. **D17 Consent passport** (the old D11). Possession-proven consent, plus the first-contact line "[Name] uses an AI assistant to prepare messages". After that line, approved drafts carry no footer. Auto-sent and live AI messages always do. A separate "AI-generated voice" consent.
9. **D18 Clean Sender email lane** (the old D12). Proactive Concierge touches land here: CAN-SPAM footer, a WA CEMA subject-line linter ("Approved", "Your rate", fake "Re:", urgency, mismatch with the body), every subject line sent archived.
10. **D19 Gate safety rules** (the old D9), wired to the Concierge sensitive lane. Instruction Receipts. Complaint cases with a legal hold.
11. **D20 Tier 2: auto service templates** (after counsel).
    - Allowed: a reply acknowledgment with no time promise, neutral milestone notes ("documents received", "appraisal ordered"; never "approved", "clear to close" or a date unless the LOS milestone is final, plus the not-a-commitment line), and document reminders.
    - All rendered by the Planner, each with an AI footer.
    - Allowance levels "Allow once" or "Allow for this play" only. "Always allow" only for internal actions.
12. **D21 Annual Review Desk, Ownership Change Desk, forward-a-letter inbox, January 1098 note.**
13. **D22 onward.** The old D13–D33 in their order, with these changes:
    - The service desks get LL-2026-07, the HPA midpoint, FHA 11 years and the Texas override. Reg N 1014.3 wording ("you may be able to ask your servicer"; no government names).
    - Partner Room gets buyer-agent status by borrower direction and the client-direction rule for any introduction.
    - Agent Intel: RETR stays hidden or iFrame-only until written permission arrives. Model Match only as each loan officer's own account, never for recruiting.
    - Recruiting uses no NMLS or Model Match data, only opt-in lists.
    - Licence checks go through an NMLS B2B ACCESS application, done by hand one record at a time until then.
    - Member ledger: `state-comp-matrix.ts`; credits only to the payer of record; no lender or settlement-service revenue while loan officers hold patronage rights, or else ring-fenced [COUNSEL].
    - The "What my assistant remembers" page ships with the consent passport.
14. **Later.** A2A/PACT gateway (code-templated answers, DPoP-bound tokens, a passkey mandate per scope, enumeration alarms), SD-JWT relationship credential with a "not for credit, insurance or employment eligibility" restriction, Licensed Agent Registry, Mortgage Agent Profile, certification mark (with a 16 CFR 255.5 disclosure), MISMO MCD export, OSCAL, the Texas sandbox once DIR opens a private-sector portal.

**This week, outside code:**
- enable ZDR on a separate Concierge workspace;
- email RETR for permission;
- ask Twilio about first-party status;
- start the NMLS B2B application;
- open ATTOM licence talks;
- calendar the FNPRM dates (comments 2026-11-25, replies 2026-12-28).

---

## 5. New counsel and owner questions

1. Is AI drafting with a first-contact AI notice, plus approval of each draft, enough under the owner's "AI disclosure before AI interaction" rule? Utah and the California bot law both turn on whether a human reviews each message, and on whether SMS counts as "online".
2. Does an imported "written" consent satisfy WA RCW 19.190.070's "clearly and affirmatively consented in advance"?
3. Is a broker sponsor a "first party" for Twilio and CTIA mortgage campaigns?
4. Does a sponsor that brokered a loan "originate" it under the HPPA? (We refuse trigger leads regardless.)
5. **[OWNER]** Should a counsel-held Reg B 1002.15 self-test of triage outcomes be allowed? Any race inference conflicts with the binding "never infer" rule.
6. Is VA status, used as a program fact, a problem under WA RCW 49.60.222?
7. Under Reg P 1016.11, does Concierge memory stay with Sponsor A when a loan officer moves, unless the client re-directs it?
8. Is a patronage refund on the loan officer's own subscription "compensation" or a "thing of value" in each state (the matrix questions)?
9. Does California Pub. Util. Code 2871 reach AI voice calls?
10. Do Civ. Code 1632 and 1632.5 translation duties attach?
11. Do Arizona's 44-1271 telemarketing rules cover texts?

## 6. Key sources

All URLs are cited inline. Opened this pass: https://app.leg.wa.gov/RCW/default.aspx?cite=19.190.020, …=19.190.040, …=19.190.060, …=19.190.070.

Code reviewed:
- `/home/user/RATEM8/lib/concierge/agent.ts`
- `/home/user/RATEM8/lib/concierge/guard.ts`
- `/home/user/RATEM8/lib/concierge/store.ts`
- `/home/user/RATEM8/lib/concierge/desk.ts`
- `/home/user/RATEM8/app/api/cc/concierge/sweep/route.ts`
- `/home/user/RATEM8/lib/today/rank.ts`
- `/home/user/RATEM8/lib/contacts/service.ts`
- `/home/user/RATEM8/lib/send-gate/gate.ts`
- `/home/user/RATEM8/lib/send-gate/rules.ts`
- `/home/user/RATEM8/lib/messaging/service.ts`
- `/home/user/RATEM8/PATCHLOG.md` (D6–D9)
- `/home/user/RATEM8/docs/work/command-center-final-form-2026-11-18.md`
- `/home/user/RATEM8/docs/work/command-center-ideas-overnight-2026-11-18.md`