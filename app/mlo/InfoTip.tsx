"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { INFO_TIP } from "@/lib/content/cc-pages";

/**
 * InfoTip (D81) — a small round "i" that opens a pop-up beside it, and a bottom sheet on phones.
 *
 * - A real <button> with aria-label (its name) and aria-expanded; the visible circle is 28px (24px
 *   small) inside a 44px tap target.
 * - Focus moves into the pop-up (its heading) and stays there while it's open (Tab cycles); it goes
 *   back to the button when the pop-up closes by Esc, ×, the button, the phone's backdrop or a tap on
 *   an empty part of the page. A tap on another control closes it and leaves focus on that control.
 * - Rendered into <body> with "cc-dsheet", so it has Command Center's Night, Dim and Paper colors.
 * - Its own words live in lib/content/cc-pages.ts (INFO_TIP); the caller passes the rest.
 */
const PHONE = "(max-width: 639px)";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function InfoTip({
  label,
  title,
  children,
  tone,
  size,
}: {
  /** The button's accessible name, e.g. "When a lead counts as permission". */
  label: string;
  /** The pop-up's heading. */
  title: string;
  children: ReactNode;
  /** "warn": an amber ring, for beside a warning such as "No permission yet". */
  tone?: "warn";
  /** "sm": a 24px circle (the tap target stays 44px). */
  size?: "sm";
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  /** Whether closing should put focus back on the button (not after a tap on another control). */
  const restore = useRef(true);
  const id = useId();

  const close = useCallback((giveBack = true) => {
    restore.current = giveBack;
    setOpen(false);
  }, []);

  // Beside the button on desktop: under it, or above it when there's no room below, in page coordinates so it
  // scrolls with the page. Written straight to the element (no re-render), so it's placed before it's focused.
  const place = useCallback(() => {
    const b = btn.current, w = wrap.current, p = panel.current;
    if (!b || !w || !p) return;
    if (window.matchMedia(PHONE).matches) {
      delete w.dataset.placed;
      return;
    }
    const r = b.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = p.offsetWidth, h = p.offsetHeight;
    const left = Math.max(16, Math.min(r.left + r.width / 2 - 30, vw - width - 16));
    const below = r.bottom + 4;
    const top = below + h > window.innerHeight - 8 && r.top - 4 - h > 8 ? r.top - 4 - h : below;
    w.style.top = `${Math.round(top + window.scrollY)}px`;
    w.style.left = `${Math.round(left + window.scrollX)}px`;
    w.dataset.placed = "";
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    heading.current?.focus({ preventScroll: true });
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const trigger = btn.current;
    const phone = window.matchMedia(PHONE).matches;
    if (phone) document.documentElement.classList.add("cc-lock");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === heading.current || !panel.current.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !panel.current.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    // A tap outside (or on the phone's backdrop) closes it. On "click", after the press has moved focus, so focus can
    // go back to the button; a tap on another control keeps focus there.
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t || panel.current?.contains(t) || trigger?.contains(t)) return;
      const el = t instanceof Element ? t : null;
      close(!el?.closest(FOCUSABLE));
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", place);
      if (phone) document.documentElement.classList.remove("cc-lock");
      if (restore.current) trigger?.focus();
      restore.current = true;
    };
  }, [open, close, place]);

  const cls = ["cc-tip-btn", tone === "warn" ? "cc-tip-btn--warn" : "", size === "sm" ? "cc-tip-btn--sm" : ""].filter(Boolean).join(" ");

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={cls}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? `${id}-tip` : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span aria-hidden="true" className="cc-tip-btn__dot">i</span>
      </button>
      {open
        ? createPortal(
            <div ref={wrap} className="cc-dsheet cc-tip">
              <div className="cc-tip__backdrop" aria-hidden="true" />
              <div ref={panel} id={`${id}-tip`} className="cc-tip__panel" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
                <span aria-hidden="true" className="cc-tip__grip" />
                <div className="cc-tip__head">
                  <h2 id={`${id}-t`} ref={heading} tabIndex={-1} className="cc-tip__title">
                    {title}
                  </h2>
                  <button type="button" className="cc-tip__x" aria-label={INFO_TIP.close} onClick={() => close()}>
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <div className="cc-tip__body">{children}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
