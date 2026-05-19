# RateM8 — Typography Guide

**Primary typeface: Exo**
A geometric sans-serif designed by Natanael Gama. Modern, clean,
slightly futuristic. Pairs naturally with the orb's geometric form.

This guide is the rulebook. Anyone working on RateM8 — designers,
developers, copywriters — should follow it.

---

## The Type Stack

| Role           | Font                | Used for                                    |
|----------------|---------------------|---------------------------------------------|
| Display + Sans | **Exo**             | Headlines, body, UI, the wordmark           |
| Mono           | **JetBrains Mono**  | Numbers, labels, "Principle 01" eyebrows    |

We deliberately do NOT use a serif. The previous Fraunces choice was
replaced because the geometric sans pairs better with the orb's
identity and reads more "loan intelligence platform" than "editorial
think piece."

---

## The Tagline — The Most Important Type Choice

The tagline gets its rhetorical power from contrasting weights:

```
Loan intelligence.              ← Exo Bold (700)
Free for all loan mates.        ← Exo Thin Italic (100, italic)
```

**Why this works.** The bold sets a confident, grounded statement.
The thin italic reads as a promise — light, almost an exhale.
Reader experiences the brand as confident BUT generous in two
visual beats.

Don't substitute Medium for Bold. Don't substitute Light for Thin.
The wider the weight contrast, the better this reads.

**CSS class:** `.tagline` (defined in `app/globals.css`)
**Override:** the italic span inside `<h1 className="tagline">` gets
its weight automatically via the `.tagline em` selector.

---

## Weight Usage Map

| Weight | Name        | Use for                                        |
|-------:|-------------|------------------------------------------------|
| 100    | Thin        | Tagline italic line ONLY. Reserved.            |
| 200    | ExtraLight  | Optional for very large, airy headlines        |
| 300    | Light       | Body text on secondary pages, long-form prose  |
| 400    | Regular     | Default body text                              |
| 500    | Medium      | UI buttons, nav links, principle card labels   |
| 600    | SemiBold    | Card titles, section subheads, "How it works"  |
| 700    | Bold        | Tagline first line, section H2 headlines       |
| 800    | ExtraBold   | Reserved for marketing posters / launch deck   |
| 900    | Black       | Almost never. Reserved.                        |

Most of the site uses three weights: **300 (Light)** for body,
**500 (Medium)** for UI, **700 (Bold)** for headlines. Bold +
Thin Italic appears only in the tagline. Keep the system tight.

---

## Italic Usage

Italic in Exo is meaningful — use it sparingly.

**Use italic for:**
- The second line of the tagline
- Pull quotes (rare; mostly in long-form pages)
- True foreign words or titles ("the Loan Estimate")

**Don't use italic for:**
- Emphasis inside body text (use semi-bold instead, or restructure
  the sentence)
- "Cute" phrases or microcopy
- M8 dialogue (M8 speaks in regular weight; voice carries warmth)

---

## Size Scale

Tailwind v4 utility classes work directly. Recommended scale:

| Use                          | Tailwind class               | Weight |
|------------------------------|------------------------------|-------:|
| Hero tagline                 | `text-5xl sm:text-7xl`       | 700/100|
| Page H1                      | `text-4xl sm:text-6xl`       | 700    |
| Section H2                   | `text-4xl sm:text-5xl`       | 700    |
| Card / step title (H3)       | `text-2xl`                   | 600    |
| Mini-card title              | `text-xl`                    | 600    |
| Body large (subhead)         | `text-lg leading-relaxed`    | 300    |
| Body regular                 | `text-base leading-relaxed`  | 400    |
| Body small                   | `text-sm`                    | 400    |
| UI button                    | `text-base`                  | 500    |
| Principle label / eyebrow    | `text-xs tracking-[0.18em]`  | 500 mono |
| Compliance disclaimer        | `text-xs`                    | 400    |

---

## Letter Spacing (Tracking)

| Use                         | Letter spacing  |
|-----------------------------|-----------------|
| Headlines (display)         | `-0.025em` (tighter — Exo is wide otherwise) |
| Body                        | `normal`        |
| Eyebrow labels (mono)       | `0.18em` (wide, all-caps) |
| Button text                 | `0` to `0.01em` |

Always tighten Exo at display sizes. Loose tracking at large weights
makes it feel uncertain.

---

## Color Pairings

Exo on `--m8-night` (dark mode default) reads best at:

- **Headlines:** `--m8-paper` (#FAFAF9) for the bold line, then
  `color-mix(in srgb, var(--m8-paper) 92%, var(--m8-green))` for
  the italic — barely tinted toward green, not fully colored.
- **Body:** `--muted` (paper at 65% opacity)
- **Eyebrow / labels:** `--m8-green` at 80% mixed with paper —
  slightly desaturated so it doesn't shout

Don't put bold Exo in pure `--m8-green` at any size. The green is
for accents and the orb. Headlines stay paper-colored.

---

## Wordmark Specifics

The "RateM8" wordmark is set in Exo **SemiBold (600)** with:
- "Rate" in `--m8-paper`
- "M8" in `--m8-green`
- Letter spacing: `-0.02em`
- Subname "LOAN INTELLIGENCE" in JetBrains Mono, 10px, tracking 0.2em

Don't change the weight of "M8" relative to "Rate" — they're the
same weight, only the color differs. The lift comes from color, not
from weight contrast.

---

## What NOT to Do

- **Don't pair Exo with another sans-serif.** It's the system.
  Mixing in Geist, Inter, Helvetica, etc. fragments the brand.
- **Don't use Black (900) on the web.** It looks chunky in browser
  rendering. Reserve for print/poster work only.
- **Don't italicize body paragraphs.** Italic is for the tagline
  and rare emphasis.
- **Don't all-caps anything except mono labels.** Exo at large sizes
  in all caps reads as aggressive shouting.
- **Don't drop below 14px for any user-facing text.** Compliance
  disclaimer at 12px is the only exception, and it's required to be
  small by convention but readable.

---

## Quick Implementation Reference

In Next.js, fonts are loaded via `next/font/local` in `app/layout.tsx`.
The variable `--font-exo` is set on `<html>`. CSS variables route to it:

```css
--font-display: var(--font-exo);
--font-sans: var(--font-exo);
```

In components, use `font-display` or `font-sans` Tailwind classes,
plus weight utilities (`font-bold`, `font-medium`, `font-light`).

For the tagline specifically, use the `.tagline` class on the
container; weight contrast handles itself.

---

End of guide. When in doubt: less weight contrast outside the tagline,
tighter tracking on display sizes, paper for headlines, green for
accents only.
