# PATCHLOG — LoanM8 production launch

The running log for the launch series:
- C1–C5 (`LoanM8_Launch_Live_M8_Chat.md`) runs first.
- L1–L8 and L4b (`LoanM8_Production_Launch_Prompt.md`) follow.

Each patch: plan, files, change, `npm run verify`, a Vercel preview, then
a stop for the owner's sign-off. Production only on the owner's "promote".

History before this series (v1–v30) is in `LoanM8_Project_Handoff_README.md`.

## C0 — Audit (2026-10-31)

- **Files:**
  - `LoanM8_Launch_Live_M8_Chat.md` and `LoanM8_Production_Launch_Prompt.md`
    (the owner's briefs, verbatim)
  - `docs/launch/audit-2026-10-31.md`
  - `PATCHLOG.md`
- **No code changes.**
- **Owner statement (2026-10-31):** counsel has approved everything. That
  means the drafts that were waiting on counsel review, including the M8
  prompt, the legal pages and the Second Look prompt. C3 replaces the M8
  prompt with the brief's production prompt anyway.
- **Findings:** see the audit. In short:
  - Licensing facts are already only in `lib/config.ts`.
  - The brief changes the sponsor naming and the AZ license number.
  - `ANTHROPIC_API_KEY` isn't set for Preview.
  - `sml.texas.gov` is unreachable from this environment.
  - C4 needs three services the owner must approve.
- **Next:** C1, after the owner signs off.
