/**
 * Theme system for RateM8.
 *
 * Three modes:
 *  - "night"  — true dark (current default). Black background, luminous green orb.
 *  - "dim"    — softer dark. Forest background, paper text, gentler orb glow.
 *  - "paper"  — true light. Paper background, charcoal text, orb sits like
 *               printed ink, term-field fades to ghost.
 *
 * Implementation pattern:
 *  - The active theme is set as a `data-theme` attribute on <html>.
 *  - All three themes are defined as full CSS variable sets in globals.css.
 *  - The browser swap is instant — no React re-render needed for the visuals.
 *  - The choice persists via localStorage under THEME_KEY.
 *
 * Default behavior:
 *  - First visit: "night" (the brand default).
 *  - We deliberately do NOT respect prefers-color-scheme on first load.
 *    RateM8 IS a dark brand; users opt in to the others.
 *  - Once a user picks, their choice persists across visits.
 *
 * No flash of wrong theme:
 *  - The inline boot script in layout.tsx runs BEFORE React hydrates,
 *    reads localStorage, and sets data-theme synchronously. This avoids
 *    the visible "flash of dark then snap to light" some sites have.
 */

export type Theme = "night" | "dim" | "paper";

export const THEMES: Theme[] = ["night", "dim", "paper"];

export const THEME_LABELS: Record<Theme, string> = {
  night: "Night",
  dim: "Dim",
  paper: "Paper",
};

export const THEME_DESCRIPTIONS: Record<Theme, string> = {
  night: "True dark · Brand default",
  dim: "Softer dark · Forest",
  paper: "Daylight · Editorial",
};

/** The CSS color used in the toggle dot for each theme. */
export const THEME_DOT_COLORS: Record<Theme, string> = {
  night: "#050B08",
  dim: "#04342C",
  paper: "#FAFAF9",
};

export const THEME_KEY = "ratem8.theme";
export const DEFAULT_THEME: Theme = "night";

/** Read the saved theme from localStorage, or fall back to the default. */
export function readSavedTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "night" || saved === "dim" || saved === "paper") {
      return saved;
    }
  } catch {
    // localStorage may be blocked (Safari private mode, etc.) — silently fall through.
  }
  return DEFAULT_THEME;
}

/** Persist a theme choice and apply it to <html>. */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

/**
 * The inline boot script string — injected into <head> via dangerouslySetInnerHTML
 * in layout.tsx. Runs synchronously before any React code, before any paint.
 * This is what prevents the flash-of-wrong-theme.
 *
 * Keep this self-contained. No imports. No template literals from outside.
 */
export const themeBootScript = `
(function() {
  try {
    var t = localStorage.getItem('${THEME_KEY}');
    if (t !== 'night' && t !== 'dim' && t !== 'paper') t = '${DEFAULT_THEME}';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', '${DEFAULT_THEME}');
  }
})();
`.trim();
