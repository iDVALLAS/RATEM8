"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { activeKey, GROUPS, hrefOf, TABS, visibleDests, type Dest, type GroupKey } from "./nav";
import { Icon } from "./icons";

type Props = { admin: boolean; signedIn: boolean; name: string; email: string; role: string; tenantId: string; badges: Record<string, number> };

const initials = (name: string, email: string) => (name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("") || "M8";

/** Closes on an outside click or Esc. */
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

function Menu({ label, icon, items, current, tenantId, badges }: { label: string; icon: Dest["icon"]; items: Dest[]; current: string | null; tenantId: string; badges: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  const active = items.some((d) => d.key === current);
  const count = items.reduce((n, d) => n + (badges[d.key] ?? 0), 0);
  return (
    <div className="cc-menu" ref={ref}>
      <button type="button" className={`cc-nav__btn ${active ? "is-active" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} size={18} />
        <span>{label}</span>
        {count ? <span className="cc-badge" aria-label={`${count} waiting`}>{count}</span> : null}
        <svg className="cc-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.75 5 6.5l3-2.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      {open ? (
        <div className="cc-menu__panel" role="menu">
          {items.map((d) => (
            <Link key={d.key} role="menuitem" href={hrefOf(d, tenantId)} className={`cc-menu__item ${d.key === current ? "is-active" : ""}`} aria-current={d.key === current ? "page" : undefined} onClick={() => setOpen(false)}>
              <span className="cc-menu__icon"><Icon name={d.icon} size={18} /></span>
              <span className="cc-menu__text"><span className="cc-menu__label">{d.label}{badges[d.key] ? <span className="cc-badge">{badges[d.key]}</span> : null}</span><span className="cc-menu__desc">{d.desc}</span></span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const MENU_ICON: Record<GroupKey, Dest["icon"]> = { day: "spark", people: "users", loans: "pipeline", grow: "cap", business: "receipt", settings: "gear", admin: "rocket" };

/**
 * D43: Command Center's own top bar (the public site's menu isn't shown
 * here). Desktop: grouped menus with icons, the theme toggle and your
 * account. Phones: a slim bar, bottom tabs with the Concierge in the
 * middle, and "More" for everything else. The phone sheet is rendered
 * outside the header (v20: a header's backdrop filter would trap it).
 */
export default function CcTopBar({ admin, signedIn, name, email, role, tenantId, badges }: Props) {
  const path = usePathname() ?? "/mlo";
  const current = activeKey(path);
  const dests = visibleDests({ admin, signedIn });
  const groups = (Object.keys(GROUPS) as GroupKey[]).map((g) => ({ g, items: dests.filter((d) => d.group === g && d.key !== "home") })).filter((x) => x.items.length);
  const [acct, setAcct] = useState(false);
  const [more, setMore] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
  useDismiss(acct, () => setAcct(false), acctRef);
  useEffect(() => setMore(false), [path]);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("cc-lock");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("cc-lock");
    };
  }, [more]);
  const tab = (key: string) => dests.find((d) => d.key === key);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="cc-bar">
        <div className="cc-bar__in">
          <Link href="/mlo" className="cc-brand" aria-label="Command Center home">
            <span className="cc-brand__orb" aria-hidden="true" />
            <span className="cc-brand__text"><span className="cc-brand__small">Loan<span className="cc-m8">M8</span></span><span className="cc-brand__big">Command Center</span></span>
          </Link>
          <nav className="cc-nav" aria-label="Command Center">
            <Link href="/mlo" className={`cc-nav__btn ${current === "home" ? "is-active" : ""}`} aria-current={current === "home" ? "page" : undefined}><Icon name="home" size={18} /><span>Home</span></Link>
            {groups.map(({ g, items }) => <Menu key={g} label={GROUPS[g]} icon={MENU_ICON[g]} items={items} current={current} tenantId={tenantId} badges={badges} />)}
          </nav>
          <div className="cc-bar__end">
            <ThemeToggle />
            <div className="cc-menu" ref={acctRef}>
              <button type="button" className="cc-avatar" aria-expanded={acct} aria-label="Your account" onClick={() => setAcct((o) => !o)}>{initials(name, email)}</button>
              {acct ? (
                <div className="cc-menu__panel cc-menu__panel--end" role="menu">
                  <div className="cc-acct"><strong>{name || "Shared admin login"}</strong>{email ? <span>{email}</span> : null}{role ? <span className="mlo-pill">{role}</span> : null}</div>
                  {signedIn ? <Link role="menuitem" className="cc-menu__item" href="/mlo/security" onClick={() => setAcct(false)}><span className="cc-menu__icon"><Icon name="lock" size={18} /></span><span className="cc-menu__label">Sign-in security</span></Link> : <Link role="menuitem" className="cc-menu__item" href="/sign-in"><span className="cc-menu__icon"><Icon name="lock" size={18} /></span><span className="cc-menu__label">Sign in with your email</span></Link>}
                  <a role="menuitem" className="cc-menu__item" href="/" target="_blank" rel="noopener noreferrer"><span className="cc-menu__icon"><Icon name="globe" size={18} /></span><span className="cc-menu__label">Open loanm8.com</span></a>
                  {signedIn ? (
                    <form action="/api/cc/signout" method="post">
                      <button type="submit" role="menuitem" className="cc-menu__item cc-menu__item--btn"><span className="cc-menu__icon"><Icon name="globe" size={18} /></span><span className="cc-menu__label">Sign out</span></button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <nav className="cc-tabs" aria-label="Command Center">
        {TABS.map((k, i) => {
          const d = tab(k);
          if (!d) return null;
          const center = k === "concierge";
          return (
            <Link key={k} href={hrefOf(d, tenantId)} className={`cc-tab ${center ? "cc-tab--center" : ""} ${current === k ? "is-active" : ""}`} aria-current={current === k ? "page" : undefined} style={{ order: center ? 2 : i < 1 ? 0 : i + 1 }}>
              <span className="cc-tab__icon"><Icon name={d.icon} size={center ? 24 : 22} />{badges[k] ? <span className="cc-badge cc-badge--dot">{badges[k]}</span> : null}</span>
              <span className="cc-tab__label">{d.label}</span>
            </Link>
          );
        })}
        <button type="button" className={`cc-tab ${more ? "is-active" : ""}`} style={{ order: 9 }} aria-expanded={more} onClick={() => setMore((o) => !o)}>
          <span className="cc-tab__icon"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8" fill="currentColor" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /><circle cx="18.5" cy="12" r="1.8" fill="currentColor" /></svg></span>
          <span className="cc-tab__label">More</span>
        </button>
      </nav>

      {more ? (
        <div className="cc-sheet" role="dialog" aria-modal="true" aria-label="Everything in Command Center" onClick={(e) => e.target === e.currentTarget && setMore(false)}>
          <div className="cc-sheet__panel">
            <div className="cc-sheet__head"><strong>Everything</strong><button type="button" className="cc-sheet__close" onClick={() => setMore(false)} aria-label="Close">×</button></div>
            {groups.map(({ g, items }) => (
              <section key={g} className="cc-sheet__group">
                <h2>{GROUPS[g]}</h2>
                <div className="cc-sheet__grid">
                  {items.map((d) => (
                    <Link key={d.key} href={hrefOf(d, tenantId)} className={`cc-sheet__item ${d.key === current ? "is-active" : ""}`}>
                      <span className="cc-sheet__icon"><Icon name={d.icon} size={22} />{badges[d.key] ? <span className="cc-badge cc-badge--dot">{badges[d.key]}</span> : null}</span>
                      <span>{d.label}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
