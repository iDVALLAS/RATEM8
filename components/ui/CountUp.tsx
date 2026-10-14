"use client";

import { useEffect, useRef, useState } from "react";

/**
 * CountUp — a dollar or count figure that counts up from zero when it
 * scrolls into view (v24). The final value is the server HTML; it only
 * resets to zero after hydration, and only if it starts below the fold.
 * Screen readers get the final value once (sr-only); reduced motion and
 * no-JS show the final value. Note rates and APRs never count up: a rate
 * is shown exactly or not at all.
 */
const MS = 900;

function parts(value: string) {
  const m = value.match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return { pre: m[1], n, post: m[3], decimals: (m[2].split(".")[1] ?? "").length };
}

export default function CountUp({ value }: { value: string }) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    const p = parts(value);
    if (!el || !p || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.92) return; // already visible: leave it
    const fmt = (v: number) => `${p.pre}${v.toLocaleString("en-US", { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })}${p.post}`;
    setShown(fmt(0));
    let raf = 0;
    // A huge top margin counts anything scrolled PAST as "in view", so a jump
    // straight to the bottom still finishes the count.
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (t: number) => {
          const k = Math.min(1, (t - t0) / MS);
          setShown(k < 1 ? fmt(p.n * (1 - Math.pow(1 - k, 3))) : value);
          if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { rootMargin: "100000px 0px -8% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      setShown(value);
    };
  }, [value]);

  return (
    <span className="countup">
      <span ref={ref} aria-hidden="true" className="num">
        {shown}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
