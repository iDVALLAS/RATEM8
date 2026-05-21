"use client";

import { useEffect, useRef, useState } from "react";
import {
  type Theme,
  THEMES,
  THEME_LABELS,
  THEME_DESCRIPTIONS,
  THEME_DOT_COLORS,
  applyTheme,
  readSavedTheme,
} from "@/lib/theme";

/**
 * The three-dot theme toggle that lives in the top nav.
 *
 * Behavior:
 *  - Closed state: three small dots in a row. The dot corresponding
 *    to the current theme is filled and slightly larger; the other
 *    two are outlined.
 *  - Click any dot: switch directly to that theme.
 *  - The whole row also responds to keyboard: ←/→ to move between
 *    themes, Enter to select. Accessible as a radiogroup.
 *
 * Why not a single button that cycles?
 *  - With 3 themes, "click to cycle" forces a user who wants Paper
 *    when on Night to either click twice or guess the cycle order.
 *  - Direct selection is one click instead of two-or-three. Worth
 *    the extra ~6px of nav width.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("night");
  const [hovered, setHovered] = useState<Theme | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  // Sync from localStorage on mount.
  // The boot script in layout.tsx has already applied data-theme,
  // we just need to mirror that into React state for the visual selection.
  useEffect(() => {
    setTheme(readSavedTheme());
  }, []);

  function select(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  function handleKey(e: React.KeyboardEvent) {
    const idx = THEMES.indexOf(theme);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      select(THEMES[(idx + 1) % THEMES.length]);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      select(THEMES[(idx - 1 + THEMES.length) % THEMES.length]);
    }
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Color theme"
      className="theme-toggle"
      onKeyDown={handleKey}
    >
      {THEMES.map((t) => {
        const isActive = t === theme;
        const isHovered = hovered === t;
        return (
          <button
            key={t}
            role="radio"
            aria-checked={isActive}
            aria-label={`${THEME_LABELS[t]} mode — ${THEME_DESCRIPTIONS[t]}`}
            onClick={() => select(t)}
            onMouseEnter={() => setHovered(t)}
            onMouseLeave={() => setHovered(null)}
            tabIndex={isActive ? 0 : -1}
            className={`theme-dot ${isActive ? "theme-dot--active" : ""}`}
            style={
              {
                "--dot-color": THEME_DOT_COLORS[t],
              } as React.CSSProperties
            }
          >
            <span className="sr-only">{THEME_LABELS[t]}</span>
            {isHovered && (
              <span className="theme-dot-tooltip" aria-hidden="true">
                {THEME_LABELS[t]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
