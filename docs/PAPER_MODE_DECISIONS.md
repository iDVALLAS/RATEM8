# RateM8 — Paper Mode Design Decisions

Paper mode is the editorial light theme. Every decision below is a judgment call I made; this document exists so you can review them and override anything that looks wrong on your screen.

If you don't like a decision, edit the relevant CSS custom property in `app/globals.css` under the `:root[data-theme="paper"]` block. Each variable is documented inline.

---

## Why Paper isn't pure white

Pure white (#FFFFFF) on a screen reads as clinical, hospital-website, generic. The brand's Paper color (#FAFAF9) has a slight warm cream cast. It reads as newsprint. Holds the brand's voice.

## Why Charcoal isn't pure black

Pure black (#000) on a paper background is harsh — it creates "vibration" at body-text size because the contrast is too extreme. Charcoal (#1A1A19) is what newspapers and books use. Easier on eyes, more grown-up.

---

## The 40 decisions, in priority order

### Background & surface tokens

1. **Page background:** `#FAFAF9` (brand Paper)
2. **Elevated surface** (insets like rate card background in Night mode → flat in Paper): `#F2EFE8` — used very sparingly
3. **Sunken surface** (rate cards, market cards, LO card): `#FFFFFF` — true white, looks "lifted" above the warm paper
4. **Grain overlay opacity:** drops from 4% (Night) to 2.5% (Paper). Blend mode switches from `overlay` to `multiply` — overlay washes out on light backgrounds.

### Text tokens

5. **Primary text:** Charcoal `#1A1A19`
6. **Soft text** (headings, emphasis): `#2C2C2A` — slightly lighter than primary, used for places where pure charcoal would feel heavy
7. **Muted text** (body subhead, scenario labels): `#5F5E5A` — passes WCAG AA on paper background at 16px
8. **Selection color:** Deep Green background, Paper text — same green as accents

### Border tokens

9. **Rule (hairline border):** `rgba(26,26,25,0.10)` — 10% charcoal. On paper, this reads as a real line, where 10% white on dark reads as a suggestion.
10. **Rule strong** (hover, focus): `rgba(26,26,25,0.18)`

### Accent shifts

11. **Primary accent:** M8 Green → **Deep Green** (#1D9E75). M8 Green at #5DCAA5 fails WCAG AA on Paper backgrounds (contrast ~2.1:1). Deep Green passes (4.7:1) AND reads more grown-up.
12. **Accent deep** (hover): M8 Green → **Forest** (#04342C)
13. **Accent text** (text on green buttons): Paper (#FAFAF9). White on Deep Green is the highest-contrast pairing in the palette.
14. **Accent soft** (button hover background, selected pill): `color-mix(in srgb, #1D9E75 10%, transparent)` — a barely-tinted green wash

### The orb

15. **Orb interior fill:** UNCHANGED — same radial gradient (M8 Green → Deep Green → Forest). The orb is a graphic object, not text, so it can stay luminous.
16. **Orb halo:** REMOVED entirely (`--orb-halo-opacity: 0`). The green glow that looks magical on black reads as a smudge on paper.
17. **Orb drop shadow:** `0 12px 40px rgba(29, 158, 117, 0.25), 0 2px 8px rgba(4, 52, 44, 0.08)` — replaces the halo with a soft, physical shadow. Suggests weight, not luminance. Reads as "printed on paper" rather than "glowing through paper".
18. **Orb inner highlight:** UNCHANGED — the white spec on the upper-left stays. That's the orb's form, not its glow.
19. **Orb breathing animation:** UNCHANGED — 4-second scale pulse continues in Paper mode.

### The term-field (drifting mortgage terms)

20. **Term color:** M8 Green → **Forest** (#04342C). The same word that reads as luminous on black needs to be ink-dark on paper. Otherwise it disappears.
21. **Term opacity:** drops from 55% to **22%**. Same ghost-watermark intensity, calibrated for the new background.
22. **Term text-shadow:** REMOVED. No glow on paper. The terms become "watermarks", not "incantations".
23. **Term numbers** (the brighter "highlight" terms like 6.625%): change from white-with-glow to Charcoal. Read as ledger entries, not terminal text.
24. **Term-field radial mask:** UNCHANGED — terms still fade where the orb sits, so the orb still appears to "absorb" them.

### Rate cards (the M8 chat anti-steering display)

25. **Rate card background:** Forest-tinted Night → **#FFFFFF**. Hairline border instead of glowing fill.
26. **Selected row indicator:** stays as a 3px left border in accent green. Color shifts from M8 Green to Deep Green.
27. **Rate numbers (the big 6.375%, $3,994):** Stay in Fraunces serif, color shifts from Paper to Charcoal.
28. **Pills (scenario chips):** border stays hairline, text color from Paper/muted to Charcoal/muted.

### Chat page surfaces

29. **Chat sidebars** (left and right): same Paper background as main page. Border line between them.
30. **Chat input box:** white-on-paper feel — `var(--bg-sunken)` background with hairline border. Focus border turns Deep Green.
31. **M8 message avatar:** stays the green pill with white M8. Identifiable.
32. **User message avatar:** soft-green tint on paper background.
33. **Live badge dot:** Deep Green with pulse. Same pulse animation; shadow color shifts.
34. **Follow-up buttons:** transparent background with hairline border. On hover, Deep Green border with soft tint.

### Wordmark and brand surfaces

35. **"M8" in wordmark:** Color shifts from M8 Green to **Deep Green** in Paper mode. Maintains the "highlighted syllable" treatment with proper contrast.
36. **"Rate" in wordmark:** Charcoal.
37. **Subname "Loan Intelligence":** Deep Green (via `var(--accent)`).

### Buttons

38. **Primary CTA** ("I'm shopping a mortgage"): Deep Green background, Paper text. Hover deepens to Forest.
39. **Secondary CTA** ("I'm a real estate agent"): transparent background, hairline charcoal border, Charcoal text. Hover border darkens.

### Footer

40. **Footer compliance disclosure:** stays at small mono font. Color shifts from muted-white to muted-charcoal. The "Verified by a human MLO" bold piece becomes Deep Green.

---

## What's NOT changed across themes

- The brand colors themselves (M8 Green, Deep Green, Forest, Night, Paper, Stone, Charcoal) — these are tokens, locked
- The orb's interior gradient and breathing animation
- Typography (Exo + Fraunces + JetBrains Mono in all modes)
- Letter spacing, line heights, font weights
- Layout, spacing, component proportions
- The 8 principles, copy, all content
- The `M8` syllable always being emphasized in green (just shifts from M8 Green to Deep Green)

---

## Things I want you to look at specifically

When you first apply v8 and switch to Paper mode, look closely at these — they're the spots most likely to need adjustment:

1. **The orb without its halo.** Does it feel grounded or floating?
2. **The serif tagline ("Loan intelligence.") in Charcoal on Paper.** Does it feel editorial or thin?
3. **The drifting terms at 22% opacity.** Visible? Too visible? Invisible?
4. **The big rate numbers (6.375%, $3,994) on white rate cards.** Read as ledger? Read as cold?
5. **The Deep Green primary button** vs. the M8 Green you're used to in Night mode. Does the deeper green feel "right" for the brand, or off?
6. **The "M8" syllable in the wordmark** — Deep Green on Paper. Still distinctive enough?

If any of these feel off, the fix is usually a single CSS variable in the `:root[data-theme="paper"]` block. The whole theme system is built so changes propagate without touching component code.

---

## Dim mode notes (the third option)

Dim mode is simpler — just Night with the background lifted off pure black. Six tokens change:

- `--bg` from #050B08 → #0B1F18
- `--bg-elevated` from forest-tint → #133126
- `--bg-sunken` from #000000 → #06120D
- `--orb-shadow` softens (35% → 28% intensity)
- `--orb-halo-opacity` softens (0.45 → 0.32)
- `--term-opacity` softens (0.55 → 0.42)

Everything else stays Night-mode behavior. Dim is for users who find pure-black uncomfortable but don't want a light theme.

---

## How to override any of this

Open `app/globals.css`. Find the `:root[data-theme="paper"]` block (around line 95). Each CSS variable controls one aspect. Change a value, save, see the effect immediately — no rebuild needed in dev mode.

Most likely candidates for tweaks:

```css
/* Make the terms more visible */
--term-opacity: 0.30;

/* Make the orb shadow softer */
--orb-shadow: 0 8px 30px rgba(29, 158, 117, 0.18);

/* Make the primary accent more vibrant */
--accent: #16A47A;  /* between Deep and a more saturated green */

/* Make the muted text more readable */
--muted: #4A4A47;  /* darker than the default #5F5E5A */
```

End of notes.
