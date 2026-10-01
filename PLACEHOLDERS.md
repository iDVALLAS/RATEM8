# PLACEHOLDERS.md — every value to fill before launch

Bracketed values render as-is on the site on purpose: an unfilled
placeholder is visible, a wrong fact is not. Fill each one, then run
`npm run verify`. Values marked **carried over** were already in the repo
before this build (entered by the site owner in earlier patches); they were
not invented here, but each still needs verification on
nmlsconsumeraccess.org and with counsel.

## lib/config.ts (the single source of truth)

| Key | Current value | Fill with |
|---|---|---|
| `entityNmls` | `[ENTITY NMLS #]` | The licensed entity's NMLS ID (renders in footer, /disclosures, JSON-LD) |
| `entityLegalName` | `Shapiro Home Loans LLC` (carried over) | Verify exact legal name |
| `entityTradeName` | `LoanM8 Loan Intelligence` (carried over) | Verify trade-name registration in WA, AZ, CA, TX |
| `principalMlo.name` | `Jason Shapiro` (carried over) | Verify |
| `principalMlo.nmls` | `1844143` (carried over) | Verify on NMLS Consumer Access |
| `principalMlo.nmlsConsumerAccessUrl` | Consumer Access URL for 1844143 (carried over) | Verify the URL resolves to the right record |
| `principalMlo.bioShort` | `[BIO — …]` | Two or three plain sentences; no years-in-business or volume claims unless verifiable |
| `team` | `[]` | Add MLO records as they onboard (name, nmls, title, bioShort, nmlsConsumerAccessUrl) |
| `contactEmail` | `[EMAIL]` (or `NEXT_PUBLIC_CONTACT_EMAIL`) | Public contact address at loanm8.com |
| `privacyEmail` | `privacy@loanm8.com` | Confirm the mailbox exists |
| `lenderCountDisplay` | `null` | Leave null unless a verified, current count is approved for display |
| `liveRatesEnabled` | `false` | Leave false until a live pricing integration and counsel sign-off exist |
| `states[washington].entityLicense` | `[WA ENTITY LICENSE #]` | WA entity license |
| `states[washington].mloLicense` | `[WA MLO LICENSE #]` | WA individual MLO license |
| `states[washington].regulatorName` / `regulatorUrl` | `[WA regulator name — …]` / `[WA regulator URL]` | Regulator display name and consumer URL |
| `states[washington].requiredDisclosure` | `[STATE-SPECIFIC DISCLOSURE — confirm with counsel]` | Any WA-mandated disclosure text, or empty string if none |
| `states[washington].sponsor` | Home Trust Loans, NMLS 1761573 (carried over) | Verify sponsor and number |
| `states[arizona].entityLicense` / `mloLicense` | `[AZ ENTITY LICENSE #]` / `[AZ MLO LICENSE #]` | AZ licenses |
| `states[arizona].regulatorName` / `regulatorUrl` | placeholders | AZ regulator |
| `states[arizona].requiredDisclosure` | placeholder | AZ disclosure text or empty |
| `states[arizona].sponsor` | Home Financial, AZ License 1037722 (carried over) | Verify |
| `states[california].entityLicense` / `mloLicense` | placeholders | CA licenses |
| `states[california].regulatorName` / `regulatorUrl` | placeholders | CA regulator |
| `states[california].requiredDisclosure` | `[… CA licensing language]` | CA-mandated licensing language |
| `states[california].sponsor` | Home Trust Loans (carried over) | Verify |
| `states[texas].entityLicense` / `mloLicense` | placeholders | TX licenses |
| `states[texas].regulatorName` / `regulatorUrl` | placeholders | TX regulator |
| `states[texas].requiredDisclosure` | `[… TX recovery-fund / complaint notice]` | TX-mandated complaint / recovery fund notice |
| `states[texas].sponsor` | Home Trust Loans (carried over) | Verify |
| `states[*].twoPartyConsent` | WA true, AZ false, CA true, TX false | Confirm with counsel |
| `secondLookRetention` | `[RETENTION — confirm with counsel]` | Retention period for Second Look uploads (also used on /privacy and in the consent screen) |

## Environment variables (`.env.local.example` → Vercel project settings)

| Variable | Fill with |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://loanm8.com` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Public contact address (overrides `contactEmail`) |
| `NEXT_PUBLIC_CALENDLY_BORROWER` | Borrower booking link (every borrower CTA) |
| `NEXT_PUBLIC_CALENDLY_AGENT` | Agent intro-call link |
| `NEXT_PUBLIC_CALENDLY_MLO` | MLO intro-call link |
| `NEXT_PUBLIC_CALENDLY_SECOND_LOOK` | Second Look handoff link |
| `NEXT_PUBLIC_STEALTH_MODE` | `true` until launch; `false` to open the site |
| `DEMO_PASSWORD` | Tester password for `/demo` while in stealth |
| `ANTHROPIC_API_KEY` | Leave unset until prompts are counsel-reviewed |
| `SECOND_LOOK_LIVE` | `false` until counsel confirms retention + prompt |

Empty Calendly variables make every CTA render as "Booking link coming
soon" rather than a dead link (`components/BookingCTA.tsx`).

## Content placeholders

| File | Placeholder | Fill with |
|---|---|---|
| `lib/copy.ts` → `copy.chat.gate.recording` | `[RETENTION — confirm with counsel]` | Chat transcript retention period |
| `lib/content/legal.ts` (privacy, Retention section) | `[RETENTION — confirm with counsel]` × several | Retention per data class |
| `lib/content/legal.ts` (terms, Governing law) | `[GOVERNING LAW AND VENUE — confirm with counsel]` | Governing law and venue |
| `lib/content/legal.ts` / `components/legal/*` | every `[COUNSEL REVIEW]` block | Final legal text (see ATTORNEY_REVIEW_LIST.md) |
| `lib/content/states.ts` | `[STATE-SPECIFIC DISCLOSURE — confirm with counsel]` label | Rendered from config; fill `requiredDisclosure` in config |
| `app/join/page.tsx` | `ROUTING POLICY — to be defined` (source comment) | Define how borrowers are assigned across MLOs; public copy stays neutral until then |
| `lib/prompts/m8-system.ts` | `DRAFT — requires compliance counsel review` | Counsel-reviewed system prompt before `chatLiveAi` flips |
| `lib/prompts/second-look.ts` | `DRAFT — requires compliance counsel review` | Counsel-reviewed prompt before `SECOND_LOOK_LIVE` flips |

## Assets

| Item | Status |
|---|---|
| Favicon | `app/icon.svg` (orb mark) ships; add a raster `app/apple-icon.png` if desired |
| Open Graph image | Not shipped; add `app/opengraph-image.tsx` or a static image |
| Equal Housing Lender logo | Inline SVG house mark with text label; swap for the official logo if counsel requires it |

## How to check nothing was missed

```bash
grep -rnoE "\[[A-Z][A-Za-z0-9 #/—:.,'()+-]{3,}\]" lib app components --include=*.ts --include=*.tsx | grep -v "\[slug\]\|\[tool\]\|\[DONE\]"
```

## Pricing (v13, Patch A)

| Item | Where | Current | Needed |
| --- | --- | --- | --- |
| `MLO_ADMIN_USER`, `MLO_ADMIN_PASSWORD` | Vercel env (server only) | unset → `/mlo` returns 404 | Set to enable the admin. Basic auth; replace with real accounts later |
| `PRICING_MANUAL` | Vercel env | unset (off) | `true` once snapshots should replace examples on `/rates` |
| `PRICING_DEMO_EXAMPLES` | Vercel env | unset (on) | `false` to hide example pricing |
| `PRICING_MANUAL_STALE_HOURS` | Vercel env | unset (24) | Hours before a snapshot stops showing |
| Hosted snapshot store | `lib/pricing/store.ts` | file store; read-only on Vercel | Choose a private hosted store (e.g. Postgres) before using `/mlo` in production; `PRICING_STORE_DIR` works on a server with a persistent disk |
| `CONFIG.pricing.examplesAsOf` | `lib/config.ts` | `2026-10-01` | Update when fixtures change |
| Lender `displayConsent` | `lib/pricing/lenders.ts` | all `false` | Set `true` per lender when written consent is on file (PRMG, Plaza, HomeXpress block publishing until then) |
| Admin identity verification | `/mlo/setup` | "Not verified by an administrator" | Needs real accounts and the v21 attestation spec |

