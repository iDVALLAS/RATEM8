<!--
Research for LoanM8_MLO_Command_Center_Build_Prompt.md (owner, 2026-11-18:
"diving deeper with multi agent swarm ... ways to capitalize on current
LO's databases"). Six research lenses (existing databases, agents, voice,
network effects, recruiting, technology combinations) proposed 44 ideas;
a skeptical reviewer merged, compliance-tested and ranked them. Legal
points are research, not advice: every one needs counsel before it ships.
-->

# LoanM8 Command Center: new ideas after a skeptical review

The six research lenses produced 44 ideas. I merged the duplicates, which left 31. I tested each one against the binding rules in section 2 of the build plan: TCPA, the HPPA trigger-lead ban, RESPA Section 8, Reg Z loan officer pay, fair lending, GLBA, "no lead is ever sold" and "one originator per service area". I also checked whether the data really exists and whether a loan officer would use the idea every week. I dropped anything already in section 5 of the plan (orphaned agents, listing kit, consent passport, refi ripeness, milestone guardian, rate watch, voice stand-up, Second Look for agents, Recruit Radar, training loop). Several survivors only work if they feed one of those, and I say so where it applies.

I ranked the survivors by how many funded loans they produce from an onboarded loan officer's **existing** book first, then by agent growth, then by recruiting.

Three findings shaped the whole list:

1. **The real problem with an imported book is consent and provenance, not data.** A recruit's list mostly lands as "relationship only". M8 can't call or text those people. The ideas that win are the ones that turn that list into provable, borrower-given permission, plus the ones that work without M8 contacting anyone first.
2. **A recruit's loan data stays at the old company.** Refi ripeness (5.4), PMI and escrow plays need the real note rate, balance and PMI. So a way for the borrower to hand over their own loan facts is the key that unlocks several other ideas.
3. **A new legal risk for the reward package.** Some state licensing laws may only let a loan officer be paid by the company that sponsors their license. That would affect cash rewards from LoanM8, LLC. Counsel has to check WA, OR, AZ, CA and TX. Until then I've changed the reward design to **subscription credits and approved equity units, not cash** (idea 12).

Short searches I ran for this review found no product that does these four things: a 24/7 line where listing agents verify a buyer's approval, a CRM that helps the borrower write their own PMI-removal request to the servicer, a CRM-side warning before a tax-driven escrow shortage, or a CRM tool for whether a Homebot-style assessment alert exists. Servicers and property-data firms (Cotality) do work on escrow surprises, but for servicers, not for the loan officer's past clients.

---

## Top 12

### 1. Clean Carry-Over Import (merges "Clean-Room Book Rebuild" and "Clean Carry-Over")

**One line:** At the real import, every contact gets a tag for where it came from and what the loan officer may do with it. The loan officer's own past closings are rebuilt from public records. Prior-employer data and stale phone numbers are locked out until they're clean.

**How it works:**
- **Inputs:**
  - The loan officer's RETR "book of business" CSV: buyer names, address, sale date and price, loan amount, loan type, agents.
  - Their personal phone or email contacts.
  - Any export from their old CRM.
- **Before anything is stored:**
  - The parser drops RETR's census-tract minority and income columns, and logs that it did.
  - Records are matched by name, address and phone.
- **Every contact gets two things:**
  - A source: personal relationship, my own closing (public record), prior-employer system, agent partner, or unknown.
  - A lock state. If the loan officer attests to a non-solicit (end date and scope, with counsel-written wording), those contacts become "inbound only until [date]": the send gate blocks any outreach the loan officer starts. Prior-employer system files stay quarantined until the loan officer signs a per-file attestation.
- **Phone checks:**
  - Every number is checked for line type (Twilio Lookup), against do-not-call lists, and against the FCC Reassigned Numbers Database. Each query is saved as evidence.
  - Consent is voided on any number reassigned since consent was given. Consent from before 2021-11 is flagged "no safe harbor".
  - These checks repeat monthly.
- **What the loan officer sees:** "Your book: 412 closings since 2017, 288 reachable, 0 with provable text consent, 212 locked until 2027-03-01, 96 changed numbers removed, 37 agents you've closed with." There's a button that starts the Re-permission Sprint (idea 2), and the 37 agents go straight to Warm Path (idea 7).
- **The borrower** sees nothing until someone reaches out.

**Technologies:** RETR CSV, vCard and Google contact parsing, fuzzy matching, Twilio Lookup, the FCC Reassigned Numbers Database API, national and state do-not-call scrubs, Neon with row-level security, append-only consent and audit tables, a monthly QStash job.

**Why it's new:**
- Bonzo's and Total Expert's importers take whatever CSV they're given and don't track where records came from. BNTouch's switching guides cover field mapping, not data rights.
- The poaching suits (Griffin v. West Capital, Citizens v. SoFi, Stockton) turn on client lists taken from employers.
- A court in the Union Home case rejected a claim over a list it found publicly recreatable, which is why rebuilding from public records is a different, safer starting point.

**How I tested it:**
- *Refuted on practicality:* RETR's terms may not allow exporting its data into a third-party CRM. **Redesign:** confirm with RETR. If it's barred, the rebuild uses only the loan officer's own closings that they key in or export from their personal records.
- *Refuted on trade secrets:* the system must never tell the loan officer they may solicit anyone. It only records the source, the attestation and the lock. Counsel writes the attestation.
- TCPA: everything imports as relationship only. HPPA: no credit data is used. GLBA: the CSV is deleted after import and every read is audited.

**Effort:** 4 weeks. **Fits:** D2b, straight after D2. It extends the import and uses the D3 send gate.

---

### 2. Re-permission Sprint with a Checkup Line (merges "30-Day Consent Sprint" and "The Checkup Line")

**One line:** A guided 30-day campaign that turns relationship-only contacts into contacts who have **said yes themselves**. It uses only channels that need no prior consent, and it offers one real service: a free annual mortgage checkup on a line the borrower calls.

**How it works:**
- **Trigger:** the import (idea 1) finishes. Contacts are grouped by relationship type only (past client, sphere, stalled application). Locked contacts are skipped.
- **Channel ladder:**
  1. A personal email from the loan officer (CAN-SPAM, no prior consent needed), with one specific offer: "Once a year I'll check whether your PMI can come off, review your escrow and show your equity."
  2. A mailed postcard with a QR code for contacts with no email. The print vendor is still to be chosen.
  3. A Today card prompting a hand-dialled call.

  Everything points to the consent passport (5.3) and to the loan officer's own **checkup number**.
- **When the borrower calls the checkup number:**
  - M8 gives the AI disclosure, then the recording notice, before anything of substance.
  - It checks the property state against the loan officer's licenses.
  - It runs the checkup agenda (home plans, PMI, insurance renewal, questions). It quotes no rate unless `get_pricing` returns one.
  - At the end it asks one question per purpose: "May M8, an AI, call or text this number about your mortgage, including new loan options?"
- **Redesign:** a spoken yes is stored as consent for service calls only. It becomes full marketing consent (prior express written consent) only when the borrower taps the confirmation link M8 texts or emails them, an e-signature on the consent passport. This avoids relying on a recorded "yes" counting as a written signature, which is unsettled.
- **Sends:** emails go out in throttled batches of 50, so bounces and complaints show up early.
- **Dashboard:** "consent yield" by group and offer.
- **Day 30:** contacts who never responded drop to one email a year. The system never keeps nagging.

**Technologies:** Resend with List-Unsubscribe, a print-and-mail API (vendor still to be chosen), Twilio inbound voice and Media Streams, the M8 Google voice runtime, the consent passport, the send gate, Neon's append-only consents table with the call audio as proof.

**Why it's new:**
- Reactivation tools (Structurely, Shape, Total Expert's AI Sales Assistant, Flair for West Capital) dial or text the list, which assumes consent already exists.
- AI receptionists (Frontdesk, Shape's missed-call agent) book appointments.
- None of them uses calls the borrower places to rebuild provable, per-purpose consent for an imported book.

**How I tested it:**
- *TCPA:* answering a call the borrower placed is not an outbound robocall. Nothing is texted or AI-called before consent. Any revocation ends everything at once. The plan's state rules table sets the ladder per state.
- *Non-solicit:* locked contacts get nothing outbound.
- *RESPA:* there is no incentive for consenting.

**Effort:** 5 weeks: 2 for the email and postcard sprint, 3 for the checkup line. **Fits:** the sprint goes after D4. The checkup line goes after D9, because it needs the voice runtime.

---

### 3. Relationship Memory (merges "Relationship Memory Import" and "Book Dictation")

**One line:** Pulls the life events clients told the loan officer ("selling when the twins start school, fall 2026") out of years of imported notes. The loan officer can also add them by voice while driving. Each one becomes a dated, sourced reason to call.

**How it works:**
- **Two ways in:**
  - (a) The notes and message-history columns from the import.
  - (b) "Hey M8, let's go through my book": M8 reads a 10-second card per contact and asks two questions. The answer is captured with the existing listen route.
- **Processing:**
  - The existing redaction runs first.
  - A server-side AI extractor with a zod schema pulls out the event, its timing, the client's stated preferences, and a quote linking back to the original note.
  - A filter drops protected characteristics (race, religion, national origin, disability, sex, age, marital and familial status) before anything is stored. Family cues become timing only ("about 2027").
- **What the loan officer sees:** a "What M8 learned" review queue (keep, edit or discard). Approved facts with dates create Today cards: "Maria mentioned selling around now. Personal call suggested."
- **What the borrower sees:** nothing until a well-timed, consented touch.

**Technologies:** the server-side AI model with zod-validated output, lib/m8 redaction, Google Speech-to-Text and Text-to-Speech (already in the repo), QStash, a Neon `contact_facts` table that keeps the source.

**Why it's new:**
- Switching guides say notes and history are the data that breaks in a move.
- Call-summary tools (EDGE, BNTouch MAIA) work one call at a time, and scoring tools (Total Expert Customer IQ, Aidium) only use data already in the system.
- None turns imported history, or a guided spoken interview, into dated, sourced facts.

**How I tested it:**
- *Refuted on fair lending:* a pregnancy or kids mentioned in a note is familial-status data. **Redesign:** the filter runs before storage, the plan's automated fair-lending check covers the extractor, and facts are never ranking inputs beyond their timing.
- *GLBA:* notes are nonpublic personal information. They are processed only under no-training, zero-retention model terms, and raw notes and audio are deleted after extraction.
- *TCPA:* a stated preference ("text me after 5") is **never** treated as consent.

**Effort:** 4 weeks. **Fits:** after D5, because it feeds the Today ranking. The dictation mode can share D8's voice runtime.

---

### 4. Verified Loan Facts (merges "My Mortgage Vault" and "Bring Your Loan")

**One line:** A past client whose loan closed at the loan officer's old company uploads their Closing Disclosure or a mortgage statement, or later connects their servicer through Plaid. M8 gets the real rate, balance, PMI and escrow, which is the only reliable data for those loans.

**How it works:**
- **Trigger:** the checkup line, the sprint email ("Check my mortgage in 60 seconds"), or M8 chat ("Can you check my PMI?").
- **Upload path, first:**
  - The Second Look parser gets two new document types: the Closing Disclosure and the servicer statement.
  - It extracts note rate, original amount, term, first payment date, PMI or MIP, escrow items, lender and servicer.
  - The file is deleted after extraction.
- **Plaid path, phase two:** Plaid's mortgage data (rate, balance, PMI flag, escrow balance), refreshed daily, with a Disconnect button. The field list still has to be checked against Plaid's docs, which couldn't be opened from this session.
- **What the borrower sees:** a private "My Mortgage" page with PMI milestones, escrow trend and equity range. Rates appear only from a dated priced snapshot.
- **What the loan officer sees:** "Dana uploaded her CD: 6.875%, $142/mo PMI, can likely request removal in about 7 months." It unlocks 5.4 refi ripeness and ideas 5, 9 and 10 for contacts with no POS record.

**Technologies:** the Second Look parser, AI vision extraction with a zod schema, lib/pricing amortization and APR, Plaid Link and Liabilities (later), a property value estimate vendor (still to be chosen), Neon.

**Why it's new:**
- Homebot uses public-record estimates and takes no documents.
- Document-AI vendors (Sensible, UiPath) parse Closing Disclosures for lenders' back offices.
- Informative Research's portfolio alerts are for lenders watching their own serviced loans.
- No loan officer CRM lets the client supply their own loan facts.

**How I tested it:**
- *Refuted on Plaid:* the status of CFPB's open-banking rule (1033) and its limits on secondary use are uncertain, and Plaid charges per connection. **Redesign:** uploads ship first, Plaid only after counsel clears it.
- *GLBA:* encrypted upload, redaction, no file kept, every read audited, deletion from the page.
- *No rate outside a priced result.* The C20 neutrality rules apply: it never disparages the current lender. HPPA is not touched, because the borrower chooses to share.

**Effort:** 4 weeks for upload, plus 2 for Plaid later. **Fits:** after D6, as the data path for 5.4.

---

### 5. Keep-Your-Low-Rate Equity Planner (merges "Rate-Locked Equity Planner" and "Project Pulse")

**One line:** For past clients sitting on a low first-mortgage rate who need cash, a priced, honest side-by-side of a HELOC against a cash-out refinance. A building permit at their address is one possible trigger. The page may well say "keep your 3.1% loan".

**How it works:**
- **Triggers:**
  - (a) A stated need, from Relationship Memory or M8 chat ("$60k for a remodel?").
  - (b) A building permit worth $25k or more filed at a past client's own address, from city open data (Seattle, Portland, Phoenix, LA and San Diego publish it) or ATTOM or BuildZoom.
- **Inputs:** the first-lien rate and balance from idea 4 or the POS, and estimated equity.
- **What the system builds:**
  - Keep the first mortgage and add a HELOC, against a cash-out refinance.
  - Payment, interest over 5 and 10 years, and break-even, over the client's own time horizon.
- **What the loan officer does:** permit-triggered cards go to the loan officer **only**, as a personal call that says openly where the knowledge came from ("I saw the permit go up, congrats"). M8 never cold-calls on a permit.

**Technologies:** lib/pricing build, APR and anonymize for cash-out scenarios, the HELOC panel (Aven, HELIX, NFTYDoor), permit open data, a property value estimate vendor, a comparison page, M8 chat under the guard.

**Why it's new:**
- Homebot shows borrowing power but doesn't price a HELOC against a cash-out on the client's real first lien.
- ATTOM sells permits as cold prospect lists, and Kukun and BuildZoom feed ZIP-level indices to lenders.
- Nobody matches permits to the loan officer's own closed clients and turns them into a guarded, priced comparison.

**How I tested it:**
- *Refuted on rates:* none of the three HELOC programs is reviewed for display yet. **Redesign:** until a program has `displayConsent` or `termsReviewed`, the HELOC side shows a neutral explainer with no numbers. Never describe these programs with first-mortgage assumptions (no tri-merge credit, no W-2s).
- *Anti-steering and loan officer pay [COUNSEL]:* both options are always shown, and the loan officer's pay must not differ by product.
- *TCPA:* financing outreach is marketing, so M8 needs written marketing consent, or the loan officer dials by hand.
- *Fair lending:* the permit trigger never filters by neighborhood.
- *HPPA:* permits are public records, not consumer reports.

**Effort:** 6 weeks. **Fits:** after idea 4 and 5.4. New patch D16.

---

### 6. Time Capsule: borrowers book their own future check-ins

**One line:** At closing or in any M8 conversation, the borrower says when they want to hear from M8 and about what ("next June, before the HOA vote"). M8 calls then, opening with the borrower's own words.

**How it works:**
- **Capture:** M8 asks "Would a check-in later be useful? When, and about what?" It stores the topic, the date or condition (a date, an equity level or a life event), the channel and the quote. That record doubles as narrow, purpose-specific consent, confirmed through the consent passport link.
- **Firing:** a QStash job wakes on the date. The send gate re-checks revocation, quiet hours, do-not-call and the loan officer's **current** license at firing time.
- **The call:** "Last year you asked me to call around now about the pool. Is that still on?" It covers only that topic, plus the opt-out.
- **What the loan officer sees:** on Today, "3 capsules open this week", with the quotes.
- **What the borrower can do:** see or cancel their capsules from the M8 link.

**Technologies:** M8 chat and voice, QStash delayed jobs, Neon capsules and consents tables, the send gate, the property value estimate for equity conditions.

**Why it's new:**
- Homebot, Bonzo and BNTouch run schedules the lender picks.
- Total Expert fires on signals the lender infers.
- 5.6 is a price threshold only, and 5.3 controls channels.
- No CRM lets the borrower set both the agenda and the date.

**How I tested it:**
- *Refuted on staleness:* a year-old consent may no longer match the person's wishes. **Redesign:** if no capsule has fired within 18 months, it expires and the borrower is told.
- *If the loan officer leaves:* capsules follow the contact under the platform's exit terms, or are cancelled with notice.
- Rates only from a priced result. Recording notice in every state.

**Effort:** 4 weeks. **Fits:** after D9.

---

### 7. Warm Path: the loan officer's own book joined to RETR

**One line:** Match past clients' addresses against RETR transactions to find agents who already share client history with this loan officer, plus "sides you missed": past clients who later bought or sold using another lender.

**How it works:**
- **Inputs:** imported past-client addresses (idea 1), RETR transactions (buyer and listing agent, the buyer's loan officer, title office), and the loan officer's own closed loans.
- **Processing:** addresses are normalized and joined inside the loan officer's own tenant only. Agents are ranked by shared households × recency × current production.
- **The card:** "You and [agent] share 9 households: 3 closed with you, 6 with other lenders. She closes at [title office] where you've closed 14."
- **One tap** opens meeting prep (4.5) or a hand-dialled script that never names a client.

**Technologies:** RETR CSV, an address normalizer (libpostal or a CASS vendor), Neon graph tables with recursive CTEs, the Today and meeting-prep screens.

**Why it's new:** Highway Agent Intel, Homebot Partner Intel, Model Match and RETR all look at the market. None joins the loan officer's own imported book to agent transactions.

**How I tested it:**
- *GLBA:* client names never leave the tenant, and the guard checks scripts for client names.
- *Fair lending:* tract fields (LMI and majority-minority) are not inputs.
- *RESPA:* information only.
- *Practicality:* passes. A recruit with 5 or more years in the area will have dozens of shared-history agents, and it works on the RETR CSV alone.

**Effort:** 3 weeks. **Fits:** after D10, as the first new opportunity type.

---

### 8. Agent Line: approval verification and file status, around the clock (merges "Offer Desk" and "Agent Status Line")

**One line:** One Twilio number on every pre-approval letter and in every agent's phone. Listing agents verify a buyer's approval with a code at 9 PM. Partner agents hear the status of shared files the borrower allowed them to know. Each caller becomes a named agent opportunity for the loan officer.

**How it works:**
- **Inputs:** the approval record from ARIVE (date, what was verified, maximum price, expiry), the borrower's sharing authorization captured at pre-approval, and RETR for matching agents by phone.
- **The call:**
  - M8 gives the AI disclosure, then the recording notice.
  - **Verify mode:** the caller gives the 6-character code and the address. M8 answers only from a fixed list: valid or not, issue date, items verified, whether it covers the offer price, expiry.
  - **Status mode:** the agent is identified by caller ID plus a PIN. M8 reads milestones in plain language.
  - M8 never states income, credit, rate, terms or a closing date.
  - If the agent needs more, M8 warm-transfers with a short whisper brief inside the loan officer's hours, otherwise it books a call-back.
- **The Today card:** "Listing agent [name] verified your buyer at 9:14 PM: 38 sides in 12 months, none with you."
- **The borrower** sees every disclosure in their portal.

**Technologies:** Twilio Voice and Conference (whisper leg), 10DLC, the M8 voice runtime with a narrow tool set (`verify_letter`, `get_file_status`, `request_callback`, `live_transfer`), ARIVE webhooks, RETR CSV, the guard.

**Why it's new:**
- Letter tools (Pre Approve Me, LenderLogix QuickQual, Maxwell FlexLetters) make the letters, but verifying them still means "call the loan officer's cell".
- My search found AI intake bots and 24/7 listing chatbots, but no 24/7 lender verification line.
- Floify and loan-tracker apps push status updates. They don't answer an agent's call.

**How I tested it:**
- *GLBA:* approval and file status are nonpublic personal information. They're shared only under the borrower's revocable, logged authorization, limited to agents on that borrower's offers or file.
- *Wording:* "approval" follows the sponsor's own definitions, so a prequalification is never called an approval. The verify code also protects against forged letters.
- *TCPA:* inbound only.
- *RESPA:* offered to every agent on a file, never tiered by referral volume.
- *Licensing:* letters only in states where the loan officer is licensed.

**Effort:** 4 weeks. **Fits:** after D9 and D10 (it needs the voice runtime, ARIVE and RETR).

---

### 9. PMI Exit Concierge

**One line:** For past clients with PMI on a conventional loan, M8 works out the request date (80% of original value), the automatic end date (78%) and the current-value windows. When the borrower asks, it prepares their written request to the servicer and tracks the reply. There is no refinance pitch.

**How it works:**
- **Inputs:** verified facts (idea 4) or the RETR estimate labelled "estimate", the Homeowners Protection Act schedule, the investor rules table (Fannie B-8.1-04: 75% at 2–5 years, 80% after 5), and a value estimate.
- **Trigger:** a nightly job finds clients within 90 days of their 80% date.
- **What the loan officer sees:** a Today card, then a personal call, or an M8 call if the client has consented to service calls.
- **When the borrower says yes:** a pre-filled letter (servicer address from their statement), a checklist (payment history, no second liens, likely valuation cost) and follow-ups at 30 and 60 days.
- **FHA loans:** M8 neutrally explains that mortgage insurance lasts the life of the loan when less than 10% was put down. A conventional option is shown only as a priced example with break-even, APR and the not-a-commitment line, and only with marketing consent.

**Technologies:** lib/pricing amortization, an investor rules table in config, a property value estimate vendor, PDF letter generation, the send gate.

**Why it's new:**
- Informative Research's PMI alert notifies the lender. Homebot flags equity levels.
- My search found only consumer how-to guides and servicer pages, no CRM that writes and tracks the borrower's own request.

**How I tested it:**
- *Refuted on the investor rule:* Fannie Mae bars **servicers** from soliciting current-value cancellations. The loan officer isn't the servicer, but **redesign:** M8 offers "a PMI review" and acts on current value only when the borrower asks [COUNSEL].
- Eligibility is always worded "likely eligible to request", and the borrower is never charged.
- *TCPA:* PMI-only is a service message, subject to counsel's agreement. Any refinance mention counts as marketing.

**Effort:** 3 weeks, because idea 4 does the heavy lifting. **Fits:** after idea 4, as an extension of the D7 play "PMI removal check".

---

### 10. Escrow Shock Shield (merges the two versions)

**One line:** Warns past clients that a tax reassessment or insurance renewal is about to raise their payment, months before the escrow analysis lands, and points them to the county's appeal deadline.

**How it works:**
- **Inputs:** county assessor value notices (open data in King, Maricopa, Multnomah and others; ATTOM elsewhere), the recorded sale price, escrow figures from idea 4 or the POS, and a county appeal-deadline table in config with sources.
- **Trigger:** new assessed values are posted, or a policy anniversary is 45 days out.
- **What the loan officer sees:** "12 past clients in Maricopa reassessed. Appeal window closes March 3."
- **What the borrower gets:** a page with the estimated payment change, how escrow analysis works, the deadline and published exemptions (linked to the county), a few nearby public sales, and M8 chat. M8 can explain an uploaded insurance renewal line by line, but never recommends a carrier.

**Technologies:** assessor data vendor (still to be chosen), the deadline table, escrow projection math, Resend and Twilio through the send gate, the M8 document explainer.

**Why it's new:**
- Cotality projects 65% of escrow accounts face shortages in 2026, and its predictive-tax products are sold to **servicers**.
- Homebot reports equity, not escrow.
- I found no loan officer tool that warns past clients before the shortage.

**How I tested it:**
- *Practicality:* assessor feeds are uneven and cost money per county. **Redesign:** launch only in the counties where the loan officer has at least 10 past clients. The deadline table is reviewed each season.
- *Licensing:* no insurance or tax advice (no state insurance-producer issue), with a disclaimer.
- *TCPA:* the first touch is service only. A refinance or recast mention converts the message to marketing, so it's a separate play version.
- *Copy:* no "appeals usually win" statistics.
- *Fair lending:* the same treatment for every client in a county.

**Effort:** 5 weeks. **Fits:** after D7 and idea 4. New patch D17.

---

### 11. Relay: borrower-chosen handoff when a client moves out of the loan officer's states (merges "Relay" and "Relocation Relay")

**One line:** When a past client moves to a state where their loan officer isn't licensed, the client can choose an introduction to the LoanM8 loan officer licensed there. Nobody is paid, and the original loan officer stays their "home" contact.

**How it works:**
- **Triggers, allowed sources only:**
  - (a) The client says "we're moving to Phoenix" to M8 or the loan officer.
  - (b) Their own home appears as a new listing in RETR, or a deed transfer shows up in public records, which prompts a **personal** call.
  - Never USPS change-of-address data (NCOA), which is licensed for mail hygiene only.
- **Matching:** `lib/routing.ts` finds the destination loan officer. If there are several, they're shown in random order with nothing pre-selected.
- **The offer:** the loan officer approves the message. The client taps "Introduce me", writes their own short note, and sees exactly which fields are shared. A new consent record is created for the receiving loan officer.
- **No LoanM8 loan officer there yet:** the move is sent, anonymized, to Recruit Radar (5.9) as demand.

**Technologies:** lib/routing.ts, the consent passport with per-recipient consent, RETR listings, a deed-transfer vendor, M8 intent tags, a Twilio 3-way intro call.

**Why it's new:**
- Total Expert alerts the same loan officer when a client lists.
- Coast 2 Coast runs an in-house referral program with a 50/50 split.
- I found no borrower-chosen, license-checked, zero-payment handoff across companies.

**How I tested it:**
- *RESPA 8 and Reg Z:* nothing of value moves in any direction. There are no per-pair counts or reciprocity scores, because tracking who owes whom could itself be evidence of a referral agreement. The comp firewall (idea 12) has no field for introductions.
- *SAFE Act:* the referring loan officer never takes application data for the other state.
- *GLBA:* sharing across sponsors needs the borrower's opt-in, field by field.
- *Practicality:* the value grows with the network. With 2 loan officers in 5 states it mostly feeds Recruit Radar for now.

**Effort:** 4 weeks. **Fits:** after D12, and after the consent passport (5.3).

---

### 12. Comp Firewall and the platform-months reward engine

**One line:** Recruit rewards are counted only in "platform-months": paid subscription months of loan officers someone recruited, vested over the recruit's tenure. The engine runs under a database role that **cannot read** loan, pricing or pipeline tables, and it produces a quarterly attestation of that.

**How it works:**
- **Inputs:** billing events only (invoice paid, refunded, cancelled), the recruiter-of-record link, and the plan counsel approves (units per month, cliff, vesting, caps).
- **The database firewall:**
  - The engine connects as a Postgres role with SELECT on `subscriptions`, `seats`, `recruit_links` and `ownership_plans` only.
  - A CI test checks table privileges and fails the build if any loan-side access appears.
  - A lint rule blocks the engine from importing `lib/pricing`, the connectors or the loan models.
- **Monthly accrual:** one platform-month per paid recruit seat-month, zero on a refund, nothing while a seat is suspended.
- **Quarterly:** a signed attestation for counsel and examiners.
- **What the loan officer sees:** units only, never dollar projections.

**Technologies:** Neon role grants with a CI privilege test, an ESLint import-boundary rule, Stripe webhooks, KMS signing, an append-only ledger, PDF output.

**Why it's new:**
- One Real ties RSUs to the recruit completing a transaction. NEXA shares revenue from recruits. eXp shares company revenue from transactions.
- None limits rewards to subscription and tenure, or proves it technically.

**How I tested it:**
- *Refuted on state licensing (the main finding):* some state laws may bar a loan officer from receiving pay from anyone other than their sponsoring company. **Redesign:** rewards are **subscription credits** (a discount on what the loan officer pays LoanM8) and **counsel-approved equity units**, not cash, until counsel clears WA, OR, AZ, CA and TX.
- *Reg Z 1026.36(d):* the subscription must be a flat fee, never per loan, or it becomes a proxy for loan volume.
- *Securities:* units are securities, and Rule 701 may not cover subscribing loan officers, so counsel chooses Reg D or another route.
- *Copy:* no "downline", no earnings claims, no "commission". [COUNSEL: mortgage and securities]

**Effort:** 4 weeks. **Fits:** inside D12. It ships only with counsel's approval.

---

## Also worth considering

- **One Stop, everywhere:** a "stop" said to M8 for one loan officer stops M8 for every loan officer, using a salted hash of the number, so no loan officer learns another's clients. It's 2 weeks. **I recommend folding it into D3 and D4 regardless.**
- **Disaster Desk:** a FEMA declaration puts that county in "quiet mode" for marketing and gives the loan officer a service-only call list. It's 3 weeks, and the quiet-mode rule belongs in the D3 rules table.
- **Pricing Rota:** loan officers under one sponsor split the daily manual ARIVE pricing pull, so 5.4, 5.6 and idea 5 have fresh snapshots. It only pays off once a sponsor has 4 or more loan officers.
- **Move-In Week (absorbs "Day-One Map"):** runs a recruit's license transfer: temporary-authority dates, an "in transit" routing status so M8 tells borrowers the honest status, early 10DLC registration, and a non-solicit-aware agent re-introduction list. It's the strongest recruiting idea after idea 12.
- **Zero-Upload Book Check (merges "Zero-Upload Book Preview" and "Book Check"):** a recruit audits their book in their own browser, with network calls blocked and aggregate counts only. Good recruiting proof, with no data risk.
- **Partner Drift:** flags when an agent's buyers drift to another loan officer and lines it up against the loan officer's own missed calls and slow files. It's 3 weeks and needs monthly RETR CSVs.
- **Guarded Voice Notes:** the loan officer's own voice reply is checked by the guard (rate without APR, promises) before it's sent as a consented text. It's 3 weeks and avoids ringless voicemail.
- **Back-on-Market Rescue:** a listing that goes from pending back to active prompts a respectful offer of verified-approval help (idea 8). First check whether RETR exports the status change.
- **Call Copilot (merges the live copilot and "RESPA Whisper"):** live rate tripwire, relationship card, and RESPA flags on calls between the loan officer and agents. It's bold, at 6–7 weeks, with heavy wiretap exposure (Ambriz v. Google), so it comes later.
- **Live Interpreter Bridge:** M8 interprets the loan officer's own calls, with number checks. It's bold, at 8 weeks. Language is offered to every caller and never inferred from a name. Counsel must rule on translation liability.
- **Coverage Circle:** a same-sponsor, licensed backup loan officer covers live transfers when the primary is away, with time-limited access. Most useful at team scale.
- **Play Exchange:** network-wide results for each play version, plus an automatic pause when opt-outs spike. Needs 10 or more loan officers to mean anything.
- **Reliability Record:** a page showing the loan officer's on-time record, computed from LOS dates (at least 20 files). Needs sponsor advertising approval and counsel's review of the measures.
- **Book Deed (simplified):** a one-click export of the book with signed consent proofs. I dropped the public transparency page as over-engineered.
- **Book Succession:** opt-in handover of a retiring loan officer's clients to a vetted successor, with nothing sold. It's bold, needs counsel on RESPA "agreement or understanding", and comes later.
- **Solar Lien Pre-Clear:** spot solar fixture filings at application or listing. It's useful, but county index access is uneven and title already finds these, so it's low priority.

## Rejected and why

- **Lender Pulse and Turn-Time Commons:** sharing lender performance across competing companies has antitrust exposure now that the federal safety zones are withdrawn. Wholesale broker agreements may forbid it, and LoanM8 can't reach the minimum group sizes (4 or more loan officers across 2 or more sponsors) for a year or more. Revisit at scale.
- **ADU Yield Map:** 9 weeks, plus a city-by-city zoning table that's hard to keep accurate, and risk that it reads as zoning advice. ADU becomes a neutral explainer inside idea 5.
- **Move-By Planner:** school-district deadlines come close to familial-status targeting, and pricing three lock periods triples the manual pull. The borrower-set deadline lives on inside the Time Capsule (idea 6).
- **At-cost Vendor Pool:** a business-development program, not CRM software. The borrower-paid lane carries RESPA 8(b) and Loan Estimate tolerance risk. The owner can pursue the loan officer tools lane separately.
- **The "Clean-Room Book Rebuild", "Book Dictation", "Checkup Line", "Bring Your Loan", "Project Pulse", "Offer Desk", "Agent Status Line", "Relocation Relay", "Day-One Map", "RESPA Whisper", the second "Escrow Shock Shield" and "Book Check" entries:** not rejected on merit. They were merged into the Top 12 or the list above.
- **Anything that dials or texts an imported book before consent:** rejected by design. That's the industry habit the plan's section 2.1 forbids.

## Sources

- RETR book of business: https://kb.retr.app/how-do-i-see-my-book-of-business ; data spec: https://kb.retr.app/data-specification-loan-officer ; available data: https://kb.retr.app/what-data-is-available-on-retr
- Poaching and non-solicit cases: https://www.housingwire.com/articles/griffin-funding-alleges-west-capital-lending-former-los-diverted-borrower-leads/ ; https://www.nationalmortgagenews.com/news/citizens-sues-sofi-as-fights-over-talent-pipelines-persist ; https://www.housingwire.com/articles/stockton-mortgage-gmail-lawsuit-2/ ; https://www.mpamag.com/us/news/general/ex-union-home-mortgage-exec-loses-in-court-over-non-compete-clause/528921 ; https://www.housingwire.com/articles/ccm-enforcement-action-non-solicitation/
- CRM imports and migration: https://intercom.help/bonzo-help-center/en/articles/9067436-chapter-2-data-and-people ; https://adminhelp.totalexpert.com/support/solutions/articles/22000243369 ; https://bntouch.com/switching-from-bonzo/ ; https://bntouch.com/mortgage-blog/switch-mortgage-crm-without-losing-data/
- Reassigned Numbers Database: https://support.telnyx.com/en/articles/11358700-what-is-the-u-s-reassigned-numbers-database
- TCPA revocation and AI voice: https://kelleydrye.com/viewpoints/blogs/ad-law-access/fcc-sets-effective-date-for-tcpa-reasonable-consent-revocation-rules ; https://www.orrick.com/en/Insights/2024/02/Did-the-FCC-Really-Ban-AI-Generated-Voice-Calls-No-But-Restrictions-Apply
- AI voice and reactivation competitors: https://www.totalexpert.com/features/ai-sales-assistant ; https://www.housingwire.com/articles/west-capital-flair-ai-voice/ ; https://www.structurely.com/news/insights/how-mortgage-teams-can-reactivate-dormant-leads-with-ai-powered-outreach ; https://setshape.com/blog/mortgage-crm-data-hygiene ; https://www.myaifrontdesk.com/industries/mortgage-brokers
- AI listener and recording law: https://www.goodwinlaw.com/en/insights/publications/2025/02/alerts-practices-dpc-ftec-ai-voice-products-subject-to-california-invasion-of-privacy-claims ; https://www.zwillgen.com/privacy/federal-judge-allows-google-customer-service-ai-class-action-to-proceed/
- Call summaries and scoring: https://empirelearning.com/edge/your-crm-but-smarter-auto-summaries-call-notes-and-follow-ups-2 ; https://techintelpro.com/news/finance/financial-services/total-expert-launches-customer-iq-to-power-agentic-lending-era
- Document parsing, portfolio alerts and Homebot: https://www.sensible.so/blog/how-to-extract-data-from-closing-disclosures ; https://insights.informativeresearch.com/press-releases/ir-unveils-enhancement-suite-mortgage-portfolio-monitoring-alerts ; https://homebot.ai/demo ; https://homebot.ai/partner-intel
- Plaid mortgage data: https://plaid.com/blog/liabilities-mortgages/ ; https://plaid.com/docs/api/products/liabilities/
- PMI rules: https://www.fdic.gov/consumer-compliance-examination-manual/v-5-homeowners-protection-act ; https://www.fanniemae.com/content/guide/servicing/b/8.1/04.html ; https://www.nationalmortgagenews.com/news/fannie-servicers-can-contact-borrowers-about-mi-cancelations ; https://www.consumerfinance.gov/ask-cfpb/when-can-i-remove-private-mortgage-insurance-pmi-from-my-loan-en-202/ ; https://nerdwallet.com/article/mortgages/how-to-cancel-private-mortgage-insurance ; https://www.chase.com/personal/mortgage/education/managing-your-mortgage/pmi-removal-chase-owned-loan
- Escrow and property tax: https://www.nationalmortgagenews.com/news/lenders-could-score-an-easy-win-with-borrowers-in-tax-appeal-aid ; https://www.cotality.com/resources/proactive-technology-reduces-servicer-call-volume ; https://www.cotality.com/resources/property-taxes-are-reshaping-servicing-operations ; https://www.housingwire.com/videos/predictive-tax-data-prevent-escrow-surprises/ ; https://lereta.com/blog/escrow-confusion-and-rising-costs-why-homeowners-are-facing-unexpected-mortgage-increases/ ; https://nationalmortgageprofessional.com/news/spiking-escrows-shock-unsuspecting-borrowers
- Permits and HELOCs: https://www.housingwire.com/articles/kukun-heloc-permit-data/ ; https://www.attomdata.com/news/company-news/data-solutions/loan-officers-can-use-attoms-building-permit-data-to-find-new-prospects ; https://www.buildzoom.com/blog/how-heloc-lenders-use-permit-history-to-maximize-loan-to-value-accuracy
- Pre-approval letters and verification: https://highnote.io/mortgage-pre-approval-letter-agents-guide/ ; https://info.lenderlogix.com/quickqual-instant-pre-approval-letters-lenderlogix ; https://himaxwell.com/features/flexletters ; https://www.pymnts.com/news/artificial-intelligence/2026/the-housing-market-hands-more-decisions-to-ai ; https://hellotars.com/ai-agents/mortgage-pre-qualification-assessment-agent ; https://help.floify.com/en/articles/15141079-encompass-third-party-recipient-sync
- Agent intelligence: https://www.highway.ai/products/aiconnect ; https://support.mbshighway.com/hc/en-us/articles/25556586401555 ; https://modelmatch.com/pricing ; https://www.totalexpert.com/partners/retr
- RESPA and loan officer pay: https://www.consumerfinance.gov/rules-policy/regulations/1024/2023-04-19/14/ ; https://www.consumerfinance.gov/rules-policy/regulations/1026/interp-36/ ; https://www.mayerbrown.com/en/perspectives-events/publications/2023/08/respa-enforcement-is-back-the-cfpb-takes-aim-at-marketing-and-promotional-activities ; https://nar.realtor/respa ; https://coast2coastml-help.freshdesk.com/support/solutions/articles/158000324395-policy-in-house-referral-program ; https://www.totalexpert.com/features/insights-alerts ; https://postalpro.usps.com/mailing-and-shipping-services/ncoalink
- Recruiting incentives and securities: https://nationalmortgageprofessional.com/news/one-real-mortgage-introduces-loan-officer-incentives ; https://www.proptechbuzz.com/news/realpha-launches-rsu-incentivized-loan-officer-recruitment-push ; https://nationalmortgageprofessional.com/news/nexa-removes-guardrails-its-100-revenue-model ; https://expworldholdings.com/press-releases/exp-realty-takes-agent-compensation-to-next-level-with-revenue-share-2-0/ ; https://www.cooley.com/news/insight/2020/2020-12-01-sec-proposes-changes-rule-701-form-s8
- NMLS license transfers: https://mortgage.nationwidelicensingsystem.org/knowledge/Products/nmls/pubs/ugIndState/licensing/individual/topics/licInd_mu4_temporaryAuthority.html
- Disaster data: https://fema.gov/about/openfema/faq ; https://myhome.freddiemac.com/blog/homeownership/disaster-relief-mortgage-assistance-faq
- Antitrust on information sharing (why Lender Pulse was rejected): https://www.wsgr.com/en/insights/doj-and-ftc-withdraw-antitrust-guidelines-for-competitor-collaborations.html ; https://newslink.mba.org/?p=256042
- Interpretation competitors: https://www.mpamag.com/us/specialty/wholesale/uwm-expands-mia-ai-assistant-with-spanish-language-capability/575330 ; https://www.seiright.com/case-study/sei-x-ny-mortgage-lender
- Plan reviewed: /home/user/RATEM8/LoanM8_MLO_Command_Center_Build_Prompt.md (sections 2, 4, 5 and 7)
