"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Wordmark from "./Wordmark";
import ThemeToggle from "./ThemeToggle";
import PartnerMenu from "./PartnerMenu";
import LocationBeacon from "./LocationBeacon";
import { copy } from "@/lib/copy";

/**
 * Nav — sticky top bar.
 * Desktop: Wordmark, then two groups split by a thin vertical divider:
 *   group 1 (brighter): Calculators, M8 Chat, Partner ▾
 *   group 2 (dimmer):   Principles, About, Privacy
 * then the theme toggle. Partner is a dropdown (MLOs, agents,
 * investors; see PartnerMenu). Mobile: a sheet with the same two groups
 * split by a horizontal divider (Partner expands inline), then the
 * secondary set (Second Look, guides, For AI assistants).
 *
 * v18 (mobile): the location pill sits right under the header (it scrolls
 * away; the header stays clean) and the full location line heads the
 * menu. The menu closes on Esc, the toggle, a tap outside it, and any
 * link tap (same-page links too), and starts at the measured header
 * height. v20: the sheet is rendered after the header, not inside it (the
 * header's backdrop-filter collapsed it to 0px in Safari/Firefox).
 */
export function Nav() {
  const [open, setOpen] = useState(false);
  const [navH, setNavH] = useState<number | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // The sheet starts exactly under the header (it was a fixed 61px).
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setNavH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // Outside tap: anywhere but the sheet, the header's own controls, or the
    // location picker's bottom sheet.
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || sheetRef.current?.contains(t) || t.closest(".nav-burger, .theme-toggle, [data-theme-toggle], [data-beacon-sheet]")) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const isActive = (href: string) => (href.startsWith("/#") ? false : pathname === href || pathname.startsWith(`${href}/`));
  const partnerActive = copy.nav.partner.items.some((i) => isActive(i.href));

  return (
    <>
      <header className="site-nav" ref={headerRef}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
          <Link href="/" aria-label="LoanM8 home" className="shrink-0">
            <Wordmark />
          </Link>

          <nav className="hidden items-center text-sm lg:flex" aria-label="Primary">
            <div className="nav-group nav-group--primary">
              {copy.nav.links.map((l) => (
                <Link key={l.href} href={l.href} className={`nav-link ${isActive(l.href) ? "nav-link--active" : ""}`} aria-current={isActive(l.href) ? "page" : undefined}>
                  {l.label}
                </Link>
              ))}
              <PartnerMenu active={partnerActive} />
            </div>
            <span aria-hidden="true" className="nav-divider" />
            <div className="nav-group nav-group--more">
              {copy.nav.more.map((l) => (
                <Link key={l.href} href={l.href} className={`nav-link ${isActive(l.href) ? "nav-link--active" : ""}`} aria-current={isActive(l.href) ? "page" : undefined}>
                  {l.label}
                </Link>
              ))}
            </div>
            <div className="ml-8">
              <ThemeToggle />
            </div>
          </nav>

          <div className="flex items-center gap-3 lg:hidden">
            <ThemeToggle />
            <button
              type="button"
              aria-label={open ? copy.nav.closeLabel : copy.nav.menuLabel}
              aria-expanded={open}
              aria-controls="mobile-sheet"
              onClick={() => setOpen((o) => !o)}
              className="nav-burger"
            >
              <span className={`nav-burger__bar ${open ? "nav-burger__bar--x1" : ""}`} />
              <span className={`nav-burger__bar ${open ? "nav-burger__bar--hide" : ""}`} />
              <span className={`nav-burger__bar ${open ? "nav-burger__bar--x2" : ""}`} />
            </button>
          </div>
        </div>

        {/* v15 location beacon (desktop). Renders nothing while MLO_ROUTING is off. */}
        <div className="hidden lg:block">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <LocationBeacon variant="nav" className="nav-beacon" />
          </div>
        </div>
      </header>
      {/* v20: the mobile sheet lives OUTSIDE the header. The header's
          backdrop-filter makes it the containing block for fixed children in
          Safari and Firefox, which collapsed the sheet to 0px tall there. */}
      <div
        id="mobile-sheet"
        ref={sheetRef}
        className={`nav-sheet ${open ? "nav-sheet--open" : ""}`}
        aria-hidden={!open}
        style={navH ? { top: navH } : undefined}
        onClick={(e) => {
          // Any link closes the menu, including same-page links (/#about),
          // and so does a tap on the sheet's empty area.
          if ((e.target as Element).closest("a") || e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
          {/* v18: the full location line heads the mobile menu (nothing while routing is off). */}
          <LocationBeacon variant="menu" className="nav-sheet__beacon" />
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase mb-3" style={{ color: "var(--muted)" }}>
            {"// menu"}
          </div>
          <div className="flex flex-col">
            {copy.nav.links.map((l) => (
              <Link key={l.href} href={l.href} className="nav-sheet__link" tabIndex={open ? 0 : -1}>
                {l.label}
              </Link>
            ))}
            <PartnerMenu variant="sheet" sheetOpen={open} />
          </div>
          <hr className="nav-sheet__divider" />
          <div className="flex flex-col">
            {copy.nav.more.map((l) => (
              <Link key={l.href} href={l.href} className="nav-sheet__link nav-sheet__link--more" tabIndex={open ? 0 : -1}>
                {l.label}
              </Link>
            ))}
          </div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase mt-8 mb-3" style={{ color: "var(--muted)" }}>
            {"// more"}
          </div>
          <div className="flex flex-col">
            {copy.nav.secondary.map((l) => (
              <Link key={l.href} href={l.href} className="nav-sheet__link nav-sheet__link--secondary" tabIndex={open ? 0 : -1}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      {/* v18 mobile location pill: directly under the header, in the page flow (not sticky). */}
      <div className="lg:hidden mx-auto w-full max-w-7xl px-4 sm:px-6">
        <LocationBeacon variant="pill" />
      </div>
    </>
  );
}

export default Nav;
