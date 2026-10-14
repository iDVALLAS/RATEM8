# LoanM8 — Typography Guide

**Type stack** (owner decision 2026-09-29, after a side-by-side; supersedes the brief's Fraunces display lock):

| Role          | Font               | Used for                                                     |
|---------------|--------------------|--------------------------------------------------------------|
| Display       | **Geist** (300, tight) | Headlines, the tagline, principle titles; accent words in a green gradient |
| Body / UI     | **Geist**          | Paragraphs, buttons, nav, inputs, cards                      |
| Labels / data | **JetBrains Mono** | Scene labels (`// 01 — drop`), eyebrows, numbers, badges     |

Headline rules live under `:root[data-type="sans"]` in `app/globals.css`
(the attribute is set statically on `<html>`). Fraunces is not
downloaded; `--font-fraunces` aliases to Geist.

"M8" in the wordmark is always M8 Green.

Both are self-hosted (JetBrains Mono through `next/font/google`, served
from `/_next/static`; Geist ships in the `geist` npm package). CSS variables:
`--font-fraunces`, `--font-geist-sans`, `--font-jetbrains`. The theme
aliases `--font-display`, `--font-sans`, `--font-serif`, `--font-mono`
point at them in `app/globals.css`.

> The previous Exo stack (v5–v11) was replaced by the one-shot site
> build because the brief locks the fonts above. The Exo `.otf` files
> were removed from `public/fonts/`.

---

## The tagline

```
Loan intelligence.        ← .tagline  (Geist 300, tight tracking, sheen)
human authentication      ← .hm-hero__auth (Geist 300; "human" at full
                             contrast, the rest at 55%, fingerprint mark)
```

Before 2026-09-29 the tagline was Fraunces 700 with the promise line
"Free for the people." in italic Fraunces beneath it. The owner chose
the sans treatment after a side-by-side; the promise line now lives in
the footer and page metadata, not under the hero headline.

## The accent word

One word or short phrase per headline renders in the green gradient
(`linear-gradient(100deg, M8 Green, accent, Deep Green)` clipped to the
text; paper surfaces use a deeper variant for contrast). Use `Reveal`
with `accent` or `AccentTitle` from `PrincipleCard`. Hand-drawn
underlines are disabled site-wide (`.hand-underline { display: none }`)
at the owner's request; `Underline.tsx` remains but is unused.

Rules: one accent per headline. The accent is the *idea* of the
sentence ("Drop it.", "Build your book", "A licensed human"), never a
random word. Never two colours in one headline.

## Mono labels

`.code-label` for scene labels (`// 01 — drop`), `.principle-label` /
`.eyebrow` for section eyebrows (uppercase, 0.2em tracking, green),
`.mono-label` for quiet metadata (uppercase, muted). Mono is for
structure and data, never for paragraphs.

## Sizes (mobile → desktop)

| Element            | Mobile           | Desktop           |
|--------------------|------------------|-------------------|
| h1 hero            | `text-5xl`       | `text-7xl`        |
| h1 page            | `text-4xl`       | `text-6xl`        |
| h2 section         | `text-3xl`       | `text-5xl`        |
| Principle title    | 1.45rem          | 1.6rem            |
| Body               | 1rem / 1.7       | 1rem / 1.7        |
| Mono label         | 10–11px          | 11px              |

Body copy is Geist at weight 300 (`font-light`) when muted, 400 when
primary. Headlines never exceed weight 700.

## Contrast

Paper mode swaps `--accent` from M8 Green to Deep Green because M8 Green
fails 4.5:1 on paper for text. Always colour text with tokens
(`var(--fg)`, `var(--muted)`, `var(--accent)`), never raw brand hex, so
every theme and every scene chapter (night / forest / paper) stays AA.
