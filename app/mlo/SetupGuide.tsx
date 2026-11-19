import Link from "next/link";
import { GROUP_LABELS, type SetupItem } from "@/lib/setup/checklist";
import { setupMarkAction } from "./setup-actions";

/** D24: "Get set up" on the Command Center home. Open while anything is left; folds away when everything's done. */
export default function SetupGuide({ items, open }: { items: SetupItem[]; open?: boolean }) {
  const done = items.filter((i) => i.done).length;
  const groups = [...new Set(items.map((i) => i.group))];
  const left = items.length - done;
  return (
    <section className="mlo-section" id="setup">
      <details open={open ?? left > 0}>
        <summary className="cc-setup__summary"><h2 style={{ display: "inline" }}>{left ? `Get set up: ${done} of ${items.length} done` : "You're all set up"}</h2></summary>
        <div className="jr-progress" style={{ marginTop: 10 }}><span style={{ width: `${Math.round((done / items.length) * 100)}%` }} /></div>
        {groups.map((g) => (
          <div key={g} style={{ marginTop: 12 }}>
            <p className="eyebrow">{GROUP_LABELS[g]}</p>
            <ul className="cc-setup">
              {items.filter((i) => i.group === g).map((i) => (
                <li key={i.id} className={i.done ? "cc-setup__item cc-setup__item--done" : "cc-setup__item"}>
                  <span className="cc-setup__mark" aria-hidden>{i.done ? "✓" : ""}</span>
                  <div>
                    <p>{i.href && !i.done ? <Link href={i.href}>{i.label}</Link> : i.label}{i.detail ? <span className="mlo-note"> · {i.detail}</span> : null}<span className="sr-only">{i.done ? " (done)" : " (to do)"}</span></p>
                    {!i.done ? <p className="mlo-note">{i.why}</p> : null}
                    {i.manual ? (
                      <form action={setupMarkAction.bind(null, i.done ? "no" : "yes")}>
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" className="mlo-btn mlo-btn--ghost" style={{ marginTop: 4 }}>{i.done ? "Not done yet" : "I've done this"}</button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </details>
    </section>
  );
}
