"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { copy } from "@/lib/copy";

/**
 * PartnerMenu — the "Partner" dropdown in the nav (v14, Edit 5).
 *
 * Disclosure pattern: a button with aria-expanded / aria-controls and a
 * list of links. Desktop opens on hover and on click; touch and the
 * mobile sheet open on tap. Closes on outside click or Esc (focus goes
 * back to the trigger). Keyboard: Enter / Space toggles, ArrowDown /
 * ArrowUp open and move between items, Home / End jump.
 *
 * `variant="sheet"` renders the same items inline inside the mobile menu.
 */
type Props = {
  variant?: "bar" | "sheet";
  /** Highlight the trigger when the current route is one of the items. */
  active?: boolean;
  /** Mobile sheet: whether the sheet itself is open (for tabIndex). */
  sheetOpen?: boolean;
};

const HOVER_CLOSE_MS = 140;

function Chevron() {
  return (
    <svg aria-hidden="true" className="nav-partner__chev" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3.75 5 6.5l3-2.75" />
    </svg>
  );
}

export default function PartnerMenu({ variant = "bar", active = false, sheetOpen = true }: Props) {
  const p = copy.nav.partner;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const hoverTimer = useRef<number | null>(null);
  /** Opened by hover: the click that usually follows keeps it open. */
  const hoverOpened = useRef(false);
  const menuId = useId();

  const focusItem = useCallback((i: number) => {
    const n = p.items.length;
    itemRefs.current[((i % n) + n) % n]?.focus();
  }, [p.items.length]);

  // Outside click and Esc close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        hoverOpened.current = false;
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      hoverOpened.current = false;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
  }, []);

  // Hover only for real mouse pointers; touch taps go through onClick.
  const onEnter = (e: React.PointerEvent) => {
    if (variant !== "bar" || e.pointerType !== "mouse") return;
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    if (!open) hoverOpened.current = true;
    setOpen(true);
  };
  const onLeave = (e: React.PointerEvent) => {
    if (variant !== "bar" || e.pointerType !== "mouse") return;
    hoverTimer.current = window.setTimeout(() => {
      hoverOpened.current = false;
      setOpen(false);
    }, HOVER_CLOSE_MS);
  };

  const onTriggerClick = () => {
    if (hoverOpened.current) {
      hoverOpened.current = false;
      setOpen(true);
      return;
    }
    setOpen((o) => !o);
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const target = e.key === "ArrowDown" ? 0 : p.items.length - 1;
      requestAnimationFrame(() => focusItem(target));
    }
  };

  const onItemKey = (e: React.KeyboardEvent, i: number) => {
    const moves: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: p.items.length - 1 };
    if (e.key in moves) {
      e.preventDefault();
      focusItem(moves[e.key]);
    }
  };

  const tab = sheetOpen ? 0 : -1;

  return (
    <div
      ref={rootRef}
      className={`nav-partner nav-partner--${variant} ${open ? "is-open" : ""}`.trim()}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <button
        ref={triggerRef}
        type="button"
        className={variant === "bar" ? `nav-link nav-partner__trigger ${active ? "nav-link--active" : ""}` : "nav-sheet__link nav-partner__trigger"}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={onTriggerClick}
        onKeyDown={onTriggerKey}
        tabIndex={tab}
      >
        <span>{p.label}</span>
        <Chevron />
      </button>
      <div id={menuId} className="nav-partner__panel" hidden={!open}>
        <ul className="nav-partner__list">
          {p.items.map((item, i) => (
            <li key={item.href}>
              <Link
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                href={item.href}
                className="nav-partner__item"
                onKeyDown={(e) => onItemKey(e, i)}
                onClick={() => setOpen(false)}
                tabIndex={tab}
              >
                <span className="nav-partner__label">{item.label}</span>
                <span className="nav-partner__desc">{item.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
