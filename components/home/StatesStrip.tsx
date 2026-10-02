import Link from "next/link";
import { copy } from "@/lib/copy";
import { STATES, stateChip, stateDisplay } from "@/lib/config";
import { homeContent } from "@/lib/content/home";

/**
 * StatesStrip — `// licensed in` + one chip per licensed state, each
 * linking to its state page. Everything renders from CONFIG.states.
 */
export default function StatesStrip() {
  return (
    <section className="hm-rule" aria-labelledby="states-heading">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="hm-states">
          <div>
            <div className="code-label">{copy.states.label}</div>
            <h2 id="states-heading" className="hm-h2 mt-3">
              {copy.states.heading}
            </h2>
            <p className="hm-sub max-w-xl">{copy.states.sub}</p>
          </div>
          <ul className="hm-states__chips" aria-label={homeContent.states.ariaLabel}>
            {STATES.map((s) => (
              <li key={s.slug}>
                <Link href={`/states/${s.slug}`} className="state-chip" aria-label={`${stateChip(s)}: ${stateDisplay(s)} ${copy.states.ctaSuffix}`}>
                  {stateChip(s)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
