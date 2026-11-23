# D88 — "Clean up my contacts" (owner brief, 2026-11-23)

Owner's words: "You can also have an option where the C (concierge) notices this and notices any other labeling
patterns and asks or proposes ways to clean up their database and go through them." Owner's choice: **check every
week and put a "Clean up" card on Home** (plus an on-demand button on Contacts).

## What the Concierge looks for (deterministic rules first)

1. **Tags that mean the same thing**: same tag after case, spacing, punctuation and a trailing plural "s" are
   folded ("VIP", "vip", "V.I.P", "VIPs"); near spellings (edit distance 1, both ≥ 5 letters). Suggest merging into the
   most-used spelling.
2. **The same lead source written different ways**: raw `leadSource` / `lead:` values that map to the same
   `sourceKey()` but are spelled differently ("Zillow", "Zillow.com", "zillow leads"). Suggest one spelling.
3. **Possible duplicate people**: the D75 match rules (same email, or same phone and same first name), plus anyone
   tagged "Possible duplicate". Never a pair already marked "Keep separate". Merging uses D77's merge exactly
   (confirm per pair, strictest permission wins, both histories kept).
4. **Missing basics**: no name ("(no name)" / "Needs a name"), no state, a lead with no lead source.
5. **Phones or emails that won't work**: values the existing validators reject (kept "as written" in notes at import).
6. **Past clients still labeled as leads**: relationship is a lead but the person has a closed loan (pipeline closed
   and not dead, or a loan closed date). Suggest relationship "Past client".
7. **Agents filed as clients**: kind is client but the record says agent (Realtor/agent/brokerage words in the
   company, title, tags or source, or a match to an existing agent's email/phone). Suggest moving to Agents — the
   person is asked per group, never moved silently.
8. **Imported leads with no source**: provenance `lead_vendor` with no `leadSource`.

AI is optional and only for grouping tag or source labels that rules can't fold ("VIP clients" vs "VIP"): only the
labels and their counts go to the model, in nonce data blocks, the answer zod-checked, a no-AI fallback (rules only).
Names, phones, emails and notes never go to the model. Respect the AI allowance.

## How the loan officer uses it

- `/mlo/contacts/cleanup` (in `app/mlo/nav.ts`, People group) and a "Clean up" button on Contacts.
- Suggestions in groups, e.g. "Merge 3 tags into VIP (41 people)", each with a count, up to 5 example names, and
  **Approve**, **Skip**, or **Review** (open the group and tick individual people). Bound server actions.
- Every applied run is recorded with per-field snapshots so it can be **undone for 30 days** (like D75's import undo;
  type UNDO). A merge is undone by D77's rules where possible; if a merge can't be undone cleanly, say so before
  approving.
- Skipped suggestions don't come back unless the underlying records change (fingerprint the group).
- **Never touches** consent rows, stops, do-not-call, phone checks, the on-hold status or provenance proof.
- Moving someone to Agents ends their client campaigns and follows the existing rule that agents never get client
  messages.

## Weekly card

- The morning run scans each loan officer's whole book (`listAll`) at most once per week (keyed by ISO week) and
  saves the suggestion counts; the on-demand button rescans now.
- Home shows "Clean up your contacts: N suggestions" with a link, only when N > 0, dismissible for the week.
- The morning email may carry one line with the count (names and counts only, like D11).

## Rules that stay

Own book only (`canSee` on every id; assistants act in `assistsUserId`'s book and may approve everything except
anything that deletes; there is no delete in D88). Neon and memory behave the same; SQL parameterized. Fair lending:
no protected traits as fields, groups or suggestions. RETR data never to AI. Copy in `lib/content/*`, passes
`check:copy`/`check:identity`, gender-neutral. 44px targets, contrast ≥ 4.5:1, phone width, Night/Dim/Paper.
