"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * D68: a collapse arrow on every long section in Command Center.
 *
 * A section (`.mlo-section`) whose first child is its heading and which is
 * taller than about a screenful gets an arrow in its heading; tapping the
 * heading (or Enter / Space on it) folds the section down to the heading.
 * The choice is remembered per page and heading, in this browser only.
 *
 * It never adds or removes elements React owns: it sets attributes on the
 * existing section and heading, and the arrow is drawn by CSS, so a page
 * that re-renders keeps working. Short sections are left as they are.
 */
const TALL = 560;
const key = (path: string, title: string) => `cc.fold:${path.replace(/\/(?:[a-z]_[\w-]+|c_[\w-]+|l_[\w-]+|fm_[\w-]+)(?=\/|$)/g, "/*")}:${title.slice(0, 60)}`;
const read = (k: string): string | null => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* private mode: the fold still works, it just isn't remembered */
  }
};

export default function Folds() {
  const path = usePathname() ?? "";
  useEffect(() => {
    const set = (sec: HTMLElement, h: HTMLElement, open: boolean) => {
      sec.dataset.fold = open ? "open" : "closed";
      h.setAttribute("aria-expanded", String(open));
    };
    const enhance = () => {
      document.querySelectorAll<HTMLElement>(".cc-app .mlo-section").forEach((sec) => {
        if (sec.dataset.fold) return;
        const h = sec.firstElementChild as HTMLElement | null;
        if (!h || h.tagName !== "H2") return;
        if (sec.scrollHeight < TALL) return;
        const k = key(path, h.textContent ?? "");
        h.setAttribute("role", "button");
        h.setAttribute("tabindex", "0");
        h.dataset.foldKey = k;
        set(sec, h, read(k) !== "closed");
      });
    };
    const toggle = (h: HTMLElement) => {
      const sec = h.parentElement;
      if (!sec?.dataset.fold || !h.dataset.foldKey) return;
      const open = sec.dataset.fold !== "open";
      set(sec, h, open);
      write(h.dataset.foldKey, open ? "open" : "closed");
    };
    const onClick = (e: MouseEvent) => {
      const h = (e.target as HTMLElement | null)?.closest<HTMLElement>("h2[data-fold-key]");
      if (h && !(e.target as HTMLElement).closest("a, button, input, select, textarea")) toggle(h);
    };
    const onKey = (e: KeyboardEvent) => {
      const h = (e.target as HTMLElement | null)?.closest<HTMLElement>("h2[data-fold-key]");
      if (h && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        toggle(h);
      }
    };
    enhance();
    const mo = new MutationObserver(() => enhance());
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      mo.disconnect();
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [path]);
  return null;
}
