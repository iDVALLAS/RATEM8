"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Interactions — the site-wide micro-interaction layer (v24), mounted once
 * in the root layout. Everything is progressive: the server HTML is the
 * final state, and only elements that start BELOW the fold are held back
 * until they scroll in (so nothing visible, and never the LCP headline,
 * is hidden by JS). Reduced motion turns all of it off.
 *
 *   [data-reveal]      card entrances with spring easing; on a grid
 *                      (data-reveal="grid") children stagger via --i.
 *   (Count-up figures are their own client component, <CountUp />, so
 *   no text is changed outside React.)
 *   [data-draw]        chart lines (pathLength=1) and bars draw in.
 *   .cta--primary      "magnetic" hover: drifts ≤4px toward the pointer
 *                      (mouse only).
 */
function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function belowFold(el: Element): boolean {
  return el.getBoundingClientRect().top > window.innerHeight * 0.92;
}

export default function Interactions() {
  const pathname = usePathname();

  // Reveal, count-up and draw-in: re-scan after every navigation.
  useEffect(() => {
    if (reduced() || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          if (el.hasAttribute("data-reveal")) el.classList.replace("reveal-pending", "reveal-in");
          if (el.hasAttribute("data-draw")) el.setAttribute("data-draw", "in");
        }
      },
      // The huge top margin counts anything scrolled PAST as "in view", so a
      // jump straight to the bottom (End key, anchor link) still reveals it.
      { rootMargin: "100000px 0px -8% 0px", threshold: 0 },
    );
    const raf = requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>("[data-reveal]:not(.reveal-pending):not(.reveal-in)").forEach((el) => {
        if (el.dataset.reveal === "grid") Array.from(el.children).forEach((c, i) => (c as HTMLElement).style.setProperty("--i", String(i)));
        if (!belowFold(el)) return;
        el.classList.add("reveal-pending");
        io.observe(el);
      });
      document.querySelectorAll<HTMLElement>("[data-draw]:not([data-draw='in'])").forEach((el) => {
        if (!belowFold(el)) return el.setAttribute("data-draw", "in");
        el.setAttribute("data-draw", "pending");
        io.observe(el);
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [pathname]);

  // Magnetic primary buttons (mouse only).
  useEffect(() => {
    if (reduced()) return;
    let active: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as Element | null)?.closest<HTMLElement>(".cta--primary:not(.cta--disabled)");
      if (active && active !== el) {
        active.style.removeProperty("--mx");
        active.style.removeProperty("--my");
      }
      active = el ?? null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = ((e.clientX - (r.left + r.width / 2)) / r.width) * 8;
      const dy = ((e.clientY - (r.top + r.height / 2)) / r.height) * 6;
      el.style.setProperty("--mx", `${Math.max(-4, Math.min(4, dx)).toFixed(2)}px`);
      el.style.setProperty("--my", `${Math.max(-3, Math.min(3, dy)).toFixed(2)}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  return null;
}
