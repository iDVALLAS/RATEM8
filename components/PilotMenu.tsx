"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CcLogo } from "@/app/mlo/Brand";
import { copy } from "@/lib/copy";

/**
 * PilotMenu (D90) — the coming-soon page's "PILOT" button: the MLO Command
 * Center logo under a small mono label. A tap opens a pop-up with "New here?
 * Sign up" (/sign-up) and "Welcome back — Sign in" (/sign-in).
 *
 * Same behaviour as Command Center's InfoTip (D81): a real <button> with
 * aria-haspopup="dialog" and aria-expanded; focus moves to the pop-up's
 * heading and Tab stays inside; Esc, ×, the button, a tap outside (or the
 * phone's backdrop) close it and focus goes back to the button (a tap on
 * another control keeps focus there). Under 640px it's a bottom sheet;
 * above, a small panel under the button, right-aligned to it, in page
 * coordinates so it scrolls with the page. Rendered into <body>.
 */
const PHONE = "(max-width: 639px)";
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const t = copy.comingSoonHome.pilot;

/** The two choices (exported for the render test; the pop-up mounts only when open). */
export function PilotChoices() {
  return (
    <div className="cs-pop__choices">
      <Link href={t.signUp.href} prefetch={false} className="cs-pop__choice cs-pop__choice--primary">
        <span className="cs-pop__choice-title">{t.signUp.title}</span>
        <span className="cs-pop__choice-note">{t.signUp.note}</span>
      </Link>
      <Link href={t.signIn.href} prefetch={false} className="cs-pop__choice">
        <span className="cs-pop__choice-title">{t.signIn.title}</span>
        <span className="cs-pop__choice-note">{t.signIn.note}</span>
      </Link>
    </div>
  );
}

export default function PilotMenu() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const restore = useRef(true);
  const id = useId();

  const close = useCallback((giveBack = true) => {
    restore.current = giveBack;
    setOpen(false);
  }, []);

  const place = useCallback(() => {
    const b = btn.current, w = wrap.current, p = panel.current;
    if (!b || !w || !p) return;
    if (window.matchMedia(PHONE).matches) {
      delete w.dataset.placed;
      w.style.top = "";
      w.style.left = "";
      return;
    }
    const r = b.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const left = Math.max(16, Math.min(r.right - p.offsetWidth, vw - p.offsetWidth - 16));
    w.style.top = `${Math.round(r.bottom + 8 + window.scrollY)}px`;
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
    const prevOverflow = document.body.style.overflow;
    if (phone) document.body.style.overflow = "hidden";
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
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target || panel.current?.contains(target) || trigger?.contains(target)) return;
      const el = target instanceof Element ? target : null;
      close(!el?.closest(FOCUSABLE));
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", place);
      if (phone) document.body.style.overflow = prevOverflow;
      if (restore.current) trigger?.focus();
      restore.current = true;
    };
  }, [open, close, place]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="cs-entry__btn cs-entry__btn--pilot"
        aria-label={t.aria}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-pop` : undefined}
        data-open={open ? "" : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="cs-entry__label" aria-hidden="true">
          {t.label}
        </span>
        <span className="cs-entry__cc">
          <CcLogo sizes="(min-width: 640px) 174px, 122px" />
        </span>
      </button>
      {open
        ? createPortal(
            <div ref={wrap} className="cs-pop">
              <div className="cs-pop__backdrop" aria-hidden="true" />
              <div ref={panel} id={`${id}-pop`} className="cs-pop__panel" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
                <span aria-hidden="true" className="cs-pop__grip" />
                <div className="cs-pop__head">
                  <h2 id={`${id}-t`} ref={heading} tabIndex={-1} className="cs-pop__title">
                    {t.title}
                  </h2>
                  <button type="button" className="cs-pop__x" aria-label={t.close} onClick={() => close()}>
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <PilotChoices />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
