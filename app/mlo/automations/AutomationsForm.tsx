"use client";

import { useRef, useState } from "react";
import { AUTOMATIONS } from "@/lib/content/cc-pages";

/**
 * D76: the Automations form. Keeps the rows that share one switch in step
 * (borrower updates, agent updates: picking Full-auto or LO-Auth on one
 * sets the others that are on), updates each section's "3 of 8 on", and
 * shows a save bar only after a change.
 */
export default function AutomationsForm({ action, children }: { action: (fd: FormData) => Promise<void>; children: React.ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const onChange = (e: React.FormEvent<HTMLFormElement>) => {
    const input = e.target as HTMLInputElement;
    if (input.type !== "radio") return;
    setDirty(true);
    const group = input.closest<HTMLElement>("[data-shared]");
    if (group && input.value !== "off") {
      for (const row of group.querySelectorAll<HTMLElement>("[data-row]")) {
        const on = row.querySelector<HTMLInputElement>("input[type=radio]:checked");
        if (!on || on.value === "off" || on.name === input.name) continue;
        const same = row.querySelector<HTMLInputElement>(`input[type=radio][value="${input.value}"]`);
        if (same && !same.disabled) same.checked = true;
      }
    }
    for (const sec of ref.current?.querySelectorAll<HTMLElement>("[data-count]") ?? []) {
      const rows = [...sec.querySelectorAll<HTMLElement>("[data-row]")];
      const on = rows.filter((r) => r.querySelector<HTMLInputElement>("input[type=radio]:checked")?.value !== "off").length;
      const out = sec.querySelector<HTMLElement>("[data-count-out]");
      if (out) out.textContent = AUTOMATIONS.count(on, rows.length);
    }
  };
  return (
    <form ref={ref} action={action} onChange={onChange} className="cc-autoform">
      {children}
      <div className="cc-savebar" data-dirty={dirty ? "true" : "false"} role="region" aria-label={AUTOMATIONS.save}>
        <span className="mlo-note">{AUTOMATIONS.unsaved}</span>
        <button type="submit" className="mlo-btn" tabIndex={dirty ? 0 : -1}>{AUTOMATIONS.save}</button>
      </div>
      <noscript><div className="mlo-actions"><button type="submit" className="mlo-btn">{AUTOMATIONS.save}</button></div></noscript>
    </form>
  );
}
