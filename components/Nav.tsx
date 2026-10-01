"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Wordmark from "./Wordmark";
import ThemeToggle from "./ThemeToggle";
import PartnerMenu from "./PartnerMenu";
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
 */
export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) => (href.startsWith("/#") ? false : pathname === href || pathname.startsWith(`${href}/`));
  const partnerActive = copy.nav.partner.items.some((i) => isActive(i.href));

  return (
    <header className="site-nav">
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

      <div id="mobile-sheet" className={`nav-sheet ${open ? "nav-sheet--open" : ""}`} aria-hidden={!open}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
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
    </header>
  );
}

export default Nav;
