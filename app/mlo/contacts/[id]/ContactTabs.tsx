"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TabDef = { id: string; label: string; /** A shorter label for phones. */ short?: string; content: React.ReactNode };

/**
 * D77: the contact page's tabs (Conversation first). Every panel is rendered
 * on the server; only the picked one shows. A link to a section in another
 * tab (#permission, #email, #script, the header's Note…) opens that tab, any
 * fold around the section, and scrolls to it, so old links keep working. The
 * picked tab is kept in the address (?tab=) so a reload stays on it.
 */
export default function ContactTabs({ tabs, initial, label }: { tabs: TabDef[]; initial: string; label: string }) {
  const [tab, setTab] = useState(tabs.some((t) => t.id === initial) ? initial : tabs[0].id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const show = useCallback((id: string, opts: { focusTab?: boolean } = {}) => {
    setTab(id);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", id);
      window.history.replaceState(window.history.state, "", u);
    } catch {}
    if (opts.focusTab) refs.current[id]?.focus();
  }, []);

  // A hash pointing into another tab: open it, open the fold, scroll there.
  useEffect(() => {
    const go = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (!h) return;
      const el = document.getElementById(h);
      const panel = el?.closest<HTMLElement>("[data-cc-tab]");
      if (!el || !panel) return;
      const id = panel.dataset.ccTab!;
      setTab(id);
      requestAnimationFrame(() => {
        for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
        if (el instanceof HTMLDetailsElement) el.open = true;
        el.scrollIntoView({ block: "start" });
        // A composer marked data-focus gets the cursor (the header's Text, Email and Note).
        const host = el.matches("[data-focus]") ? el : el.querySelector<HTMLElement>("[data-focus]");
        host?.querySelector<HTMLElement>("textarea, input:not([type=hidden]):not([type=checkbox])")?.focus({ preventScroll: true });
      });
    };
    // The same link tapped twice doesn't change the hash, so in-page links also run it.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href^='#']");
      if (a) setTimeout(go, 0);
    };
    go();
    window.addEventListener("hashchange", go);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", go);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = tabs.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    show(tabs[to].id, { focusTab: true });
  };

  return (
    <div className="cc-ctabs">
      <div className="cc-tabs-inline cc-ctabs__list" role="tablist" aria-label={label}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(b) => {
              refs.current[t.id] = b;
            }}
            type="button"
            role="tab"
            id={`cc-tab-${t.id}`}
            aria-controls={`cc-panel-${t.id}`}
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => show(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.short ? <><span className="cc-l">{t.label}</span><span className="cc-s" aria-hidden="true">{t.short}</span></> : t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`cc-panel-${t.id}`} aria-labelledby={`cc-tab-${t.id}`} data-cc-tab={t.id} hidden={tab !== t.id} className="cc-ctabs__panel">
          {t.content}
        </div>
      ))}
    </div>
  );
}
