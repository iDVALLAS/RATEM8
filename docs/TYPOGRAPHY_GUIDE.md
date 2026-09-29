# LoanM8 — Typography Guide

**LOCKED type stack** (site brief, Section 3):

| Role          | Font               | Used for                                                     |
|---------------|--------------------|--------------------------------------------------------------|
| Display       | **Fraunces**       | Headlines, the tagline, principle titles, the accent word    |
| Body / UI     | **Geist**          | Paragraphs, buttons, nav, inputs, cards                      |
| Labels / data | **JetBrains Mono** | Scene labels (`// 01 — drop`), eyebrows, numbers, badges     |

"M8" in the wordmark is always M8 Green.

All three are self-hosted through `next/font` (Fraunces and JetBrains
Mono are fetched from Google Fonts at build time and served from
`/_next/static`; Geist ships in the `geist` npm package). CSS variables:
`--font-fraunces`, `--font-geist-sans`, `--font-jetbrains`. The theme
aliases `--font-display`, `--font-sans`, `--font-serif`, `--font-mono`
point at them in `app/globals.css`.

> The previous Exo stack (v5–v11) was replaced by the one-shot site
> build because the brief locks the fonts above. The Exo `.otf` files
> were removed from `public/fonts/`.

---

## The tagline

```
Loan intelligence.        ← .tagline  (Fraunces 700, tight leading)
Free for the people.      ← .accent-word (Fraunces italic 500, M8 Green)
```

The first line is the anchor. The second is the promise. Never set
either in Geist.

## The accent word

One word or short phrase per headline renders in italic Fraunces, M8
Green (Deep Green on paper, via `--accent`). Use `Reveal` with `accent`
or `AccentTitle` from `PrincipleCard`. Optionally a hand-drawn underline
(`Underline`) draws itself after the words land.

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
