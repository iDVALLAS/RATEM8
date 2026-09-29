import { ALL_MLOS, CONFIG, isPlaceholder, type StateConfig } from "@/lib/config";
import { copy } from "@/lib/copy";
import { statePageContent as t } from "@/lib/content/states";
import "./states.css";

/**
 * LicenseBlock — the state's license line, regulator link, sponsoring
 * entity, every MLO with NMLS #, and the counsel placeholder for any
 * state-mandated disclosure. Every value renders from lib/config.ts.
 * Bracketed placeholders render as-is (mono) so they are impossible to
 * miss before launch; regulator links only become links once the URL
 * is real.
 */
export default function LicenseBlock({ state }: { state: StateConfig }) {
  const regulatorLinked = !isPlaceholder(state.regulatorUrl);
  return (
    <section aria-labelledby="st-license-h" className="card">
      <p className="eyebrow">{copy.statePage.eyebrow}</p>
      <h2 id="st-license-h" className="font-serif-display mt-2 text-2xl">
        {t.licenseHeading}
      </h2>
      <p className="mt-2 text-sm font-light" style={{ color: "var(--muted)" }}>
        {t.licenseSub}
      </p>

      <dl className="st-license mt-6">
        <div className="st-license__item">
          <dt>{t.entityLabel}</dt>
          <dd>
            <Value v={state.entityLicense} />
          </dd>
        </div>
        <div className="st-license__item">
          <dt>{t.mloLabel}</dt>
          <dd>
            <Value v={state.mloLicense} />
          </dd>
        </div>
        <div className="st-license__item">
          <dt>{copy.statePage.regulatorLabel}</dt>
          <dd>
            {regulatorLinked ? (
              <a href={state.regulatorUrl} target="_blank" rel="noopener noreferrer">
                {state.regulatorName}
              </a>
            ) : (
              <Value v={state.regulatorName} />
            )}
          </dd>
        </div>
        <div className="st-license__item">
          <dt>{copy.statePage.licenseLabel}</dt>
          <dd>
            {CONFIG.entityLegalName}
            {" · "}
            <span className="st-placeholder">
              {t.nmlsLabel} {CONFIG.entityNmls}
            </span>
            <br />
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Originating through {state.sponsor.name} ({state.sponsor.idLabel} {state.sponsor.idNumber})
            </span>
          </dd>
        </div>
        <div className="st-license__item sm:col-span-2">
          <dt>{t.originatorsLabel}</dt>
          <dd>
            <ul className="st-mlo">
              {ALL_MLOS.map((m) => (
                <li key={m.nmls}>
                  {isPlaceholder(m.nmlsConsumerAccessUrl) ? (
                    m.name
                  ) : (
                    <a href={m.nmlsConsumerAccessUrl} target="_blank" rel="noopener noreferrer">
                      {m.name}
                    </a>
                  )}{" "}
                  <span>
                    {t.nmlsLabel} #{m.nmls}
                  </span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>

      <div className="st-counsel mt-6 prose-m8" role="note" aria-label="State-specific disclosure placeholder">
        <span className="st-counsel__marker">{t.disclosureMarker}</span>
        <p className="counsel">{state.requiredDisclosure}</p>
        <p className="text-xs" style={{ color: "var(--muted)", marginBottom: 0 }}>
          {t.disclosureNote}
        </p>
      </div>
    </section>
  );
}

function Value({ v }: { v: string }) {
  return isPlaceholder(v) ? <span className="st-placeholder">{v}</span> : <>{v}</>;
}
