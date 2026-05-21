"use client";

import Link from "next/link";
import { useState } from "react";
import Wordmark from "./Wordmark";
import ThemeToggle from "./ThemeToggle";

/* Trimmed to routes that currently exist. v8 patch shipped a Nav
 * referencing /purchase, /refinance, /home-equity, /loan-types,
 * /tools, /rates, /about, /contact — those pages aren't built yet;
 * lib/copy.ts has the content data ready, but no page.tsx files
 * exist for them. Re-add to PRIMARY_LINKS / MORE_LINKS as the
 * subpages get built. */
const PRIMARY_LINKS = [
  { href: "/chat", label: "M8 Chat" },
  { href: "/agents", label: "For agents" },
];

const MORE_LINKS = [
  { href: "/#principles", label: "Principles" },
  { href: "/#about", label: "About" },
  { href: "/privacy", label: "Privacy" },
];

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md border-b"
      style={{
        background: "color-mix(in srgb, var(--bg) 75%, transparent)",
        borderColor: "var(--rule)",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" aria-label="RateM8 home">
          <Wordmark />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-7 text-sm md:flex">
          {PRIMARY_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors hover:text-[var(--accent)]"
              style={{ color: "var(--fg-soft)" }}
            >
              {l.label}
            </Link>
          ))}
          <span
            className="h-4 w-px"
            style={{ background: "var(--rule)" }}
          />
          {MORE_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors hover:text-[var(--accent)]"
              style={{ color: "var(--muted)" }}
            >
              {l.label}
            </Link>
          ))}

          {/* Theme toggle — far right, after the link list */}
          <div className="ml-2">
            <ThemeToggle />
          </div>
        </nav>

        {/* Mobile hamburger + theme toggle */}
        <div className="flex items-center gap-3 md:hidden">
          <ThemeToggle />
          <button
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-md border"
            style={{ borderColor: "var(--rule)" }}
          >
            <div className="flex flex-col gap-1.5">
              <span
                className={`block h-0.5 w-5 transition-transform ${
                  mobileOpen ? "translate-y-2 rotate-45" : ""
                }`}
                style={{ background: "var(--fg)" }}
              />
              <span
                className={`block h-0.5 w-5 transition-opacity ${
                  mobileOpen ? "opacity-0" : ""
                }`}
                style={{ background: "var(--fg)" }}
              />
              <span
                className={`block h-0.5 w-5 transition-transform ${
                  mobileOpen ? "-translate-y-2 -rotate-45" : ""
                }`}
                style={{ background: "var(--fg)" }}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div
          className="border-t md:hidden"
          style={{ borderColor: "var(--rule)", background: "var(--bg)" }}
        >
          <div className="mx-auto max-w-7xl px-6 py-6">
            <div className="flex flex-col gap-1">
              {[...PRIMARY_LINKS, ...MORE_LINKS].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-3 text-base transition-colors hover:text-[var(--accent)]"
                  style={{ color: "var(--fg-soft)" }}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export default Nav;
