"use client";

import { useEffect, useRef } from "react";

/**
 * SheetStack — the sticky container for stacked sheets (see stage.css).
 *
 * The stacking itself is pure CSS: every direct `.sheet-item` child is
 * `position: sticky; top: <nav>` so the next one in flow slides up over
 * it. This component does the two things CSS cannot:
 *
 *  1. Measures the nav and every sheet. A sheet taller than the
 *     viewport gets a negative `--sheet-top` so it pins by its bottom
 *     edge (every line is readable before the next sheet covers it).
 *  2. Keeps keyboard focus visible. When focus lands inside a sheet the
 *     next sheet has already covered, the page scrolls back to that
 *     sheet's flow position so the focused control is on screen.
 *
 * Nothing here animates; transforms and opacity are untouched.
 */
type SheetStackProps = {
  children: React.ReactNode;
  className?: string;
};

const NAV_FALLBACK = 64;

export default function SheetStack({ children, className = "" }: SheetStackProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stack = ref.current;
    if (!stack) return;

    const sheets = () => Array.from(stack.querySelectorAll<HTMLElement>(":scope > .sheet-item"));

    const measure = () => {
      const nav = document.querySelector<HTMLElement>(".site-nav")?.offsetHeight ?? NAV_FALLBACK;
      stack.style.setProperty("--stage-nav", `${nav}px`);
      const lip = parseFloat(getComputedStyle(stack).getPropertyValue("--stage-lip")) || 0;
      const vh = window.innerHeight;
      for (const s of sheets()) {
        const top = Math.min(nav + lip, vh - s.offsetHeight);
        s.style.setProperty("--sheet-top", `${Math.round(top)}px`);
      }
    };

    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(stack);
      sheets().forEach((s) => ro?.observe(s));
    }
    window.addEventListener("resize", measure);

    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      const sheet = target?.closest<HTMLElement>(".sheet-item");
      if (!target || !sheet || sheet.parentElement !== stack) return;
      const next = sheet.nextElementSibling as HTMLElement | null;
      if (!next) return;
      const r = sheet.getBoundingClientRect();
      const n = next.getBoundingClientRect();
      if (n.top >= r.bottom - 1) return; // not covered
      // Flow position = stack top + padding + the sheets before this one.
      let flow = stack.getBoundingClientRect().top + window.scrollY + (parseFloat(getComputedStyle(stack).paddingTop) || 0);
      for (const s of sheets()) {
        if (s === sheet) break;
        flow += s.offsetHeight;
      }
      const stickyTop = parseFloat(getComputedStyle(sheet).top) || 0;
      window.scrollTo({ top: flow - stickyTop, behavior: "instant" });
      target.scrollIntoView({ block: "nearest" });
    };
    stack.addEventListener("focusin", onFocus);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      stack.removeEventListener("focusin", onFocus);
    };
  }, []);

  return (
    <div ref={ref} className={`sheet-stack ${className}`.trim()}>
      {children}
    </div>
  );
}
