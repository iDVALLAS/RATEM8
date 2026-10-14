"use client";

import { useEffect, useState } from "react";

/**
 * StickyCtaBar — the phone-only bottom bar on borrower pages (v24).
 * Hidden from lg up, hidden while the footer is on screen (so it never
 * covers the state chips or legal lines), and it adds bottom padding to
 * the page while shown so no content sits under it.
 */
export default function StickyCtaBar({ label, children }: { label: string; children: React.ReactNode }) {
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("has-sticky-cta");
    const footer = document.querySelector("footer");
    let io: IntersectionObserver | undefined;
    if (footer && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([e]) => setFooterVisible(e.isIntersecting), { threshold: 0 });
      io.observe(footer);
    }
    return () => {
      io?.disconnect();
      document.documentElement.classList.remove("has-sticky-cta");
    };
  }, []);

  return (
    <div className={`sticky-cta ${footerVisible ? "sticky-cta--hidden" : ""}`} role="region" aria-label={label} inert={footerVisible}>
      <div className="sticky-cta__inner">{children}</div>
    </div>
  );
}
