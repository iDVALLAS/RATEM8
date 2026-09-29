"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Wordmark from "./Wordmark";
import ThemeToggle from "./ThemeToggle";
import { copy } from "@/lib/copy";

/**
 * Nav — sticky top bar.
 * Desktop: Wordmark, Calculators, M8 Chat, For agents, Principles,
 * About, Privacy, theme toggle. Mobile: a clean sheet menu with the
 * same links plus the secondary set (Second Look, For MLOs, guides).
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

  return (
    <header className="site-nav">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
        <Link href="/" aria-label="LoanM8 home" className="shrink-0">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-6 text-sm lg:flex" aria-label="Primary">
          {copy.nav.links.map((l) => (
            <Link key={l.href} href={l.href} className={`nav-link ${isActive(l.href) ? "nav-link--active" : ""}`} aria-current={isActive(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <div className="ml-2">
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
