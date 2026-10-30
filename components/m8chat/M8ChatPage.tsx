import PageShell from "@/components/PageShell";
import Orb from "@/components/Orb";
import BookingCTA from "@/components/BookingCTA";
import LenderMark from "@/components/LenderMark";
import CountUp from "@/components/ui/CountUp";
import { demoChat, demoLender, demoLenderText } from "@/lib/demoChat";
import {
  CONFIG,
  hasApplicationUrl,
  isPlaceholder,
  licenseIn,
  mloById,
  stateByCode,
  NOT_AN_OFFER_LINE,
  SAMPLE_CONVERSATION_LINE,
  RATE_DISCLAIMER_LEAD,
  RATE_DISCLAIMER_BODY,
} from "@/lib/config";
import { copy } from "@/lib/copy";
import { lenderBrand, lenderTint, type LenderBrand } from "@/lib/lenders";
import { rateOfficerLine } from "@/lib/licensing";
import ChatHead from "./ChatHead";
import SpeakButton from "./SpeakButton";
import Composer from "./Composer";
import FollowUps from "./FollowUps";
import "./m8chat.css";

/**
 * /chat — the M8 chat, redesigned (v33, owner-approved mockup 2026-10-30).
 *
 * - The site's own nav and footer (PageShell), the orb header that follows
 *   M8's voice, the conversation, and the composer docked at the bottom of
 *   the conversation column (it stays with the conversation as it scrolls).
 * - The loan officer card is pinned beside the conversation on desktop and
 *   sits above it on phones; their photo shows when one is configured.
 * - Rate cards carry the not-an-offer line and the full disclaimer
 *   (RATE_DISCLAIMER_*), never the old "illustrative" badge. Until real
 *   pricing lands (L4) the conversation is the scripted sample, and says so.
 * - Lenders follow CONFIG.demo.namedLenders (numbered today).
 *
 * The scripted conversation is lib/demoChat.ts. No model call here.
 */

const STATE = "WA" as const;

export default function M8ChatPage() {
  const c = demoChat;
  const mlo = mloById(c.loanOfficer.id) ?? CONFIG.principalMlo;
  const lic = licenseIn(mlo, STATE);
  const stateName = stateByCode(STATE)?.name ?? STATE;
  const photo = !isPlaceholder(mlo.photo) && mlo.photo.startsWith("/") ? mlo.photo : null;
  const t = copy.m8chat;
  // L2: every rate result names the loan officer and originating company for its state.
  const officerLine = rateOfficerLine(STATE);
  const why = t.whyNamed.replaceAll("{first}", mlo.firstName).replaceAll("{state}", stateName);

  const numbered = (i: number): LenderBrand => ({ slug: `lender-${i + 1}`, name: `Lender ${i + 1}`, monogram: String(i + 1), logoApproved: false, logoFile: null, brandColor: null, tint: (i + 1) as 1 | 2 | 3 });
  const brandFor = (i: number) => {
    const l = demoLender(i);
    return (l.slug ? lenderBrand(l.slug) : null) ?? numbered(i);
  };
  const showOptions = new Set(c.rateOptions.map((r) => r.lender)).size >= CONFIG.lenderCountMin;
  const moreShopped =
    Number.isInteger(c.lendersShopped) && c.lendersShopped <= CONFIG.lenderCountMax && c.lendersShopped > c.rateOptions.length
      ? c.lendersShopped - c.rateOptions.length
      : null;

  const loCard = (
    <div className="m8c-card m8c-lo">
      <p className="m8c-eyebrow">{t.loEyebrow}</p>
      <div className="m8c-lo__who">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- small, local, fixed-size headshot
          <img className="m8c-photo" src={photo} alt="" width={52} height={52} />
        ) : (
          <span className="m8c-photo m8c-photo--none" aria-hidden="true" />
        )}
        <div>
          <p className="m8c-lo__name">{mlo.name}</p>
          <p className="m8c-mono">NMLS #{mlo.nmls}</p>
        </div>
      </div>
      {lic ? (
        <p className="m8c-lo__fact">
          <span>{t.originatesThrough}</span>
          <br />
          {lic.sponsor.name} · {lic.sponsor.idLabel} #{lic.sponsor.idNumber}
        </p>
      ) : null}
      <p className="m8c-lo__fact">
        <span>{t.licensedIn}</span> {mlo.licenses.map((l) => l.state).join(" · ")}
      </p>
      <p className="m8c-lo__why">{why}</p>
      <div className="m8c-lo__btns">
        <BookingCTA kind="borrower" variant="primary" intake={false} className="m8c-btn">
          {t.bookCall}
        </BookingCTA>
        {hasApplicationUrl(mlo) ? (
          <a className="m8c-btn m8c-btn--ghost" href={mlo.applicationUrl} target="_blank" rel="noopener noreferrer">
            {t.startApplication}
          </a>
        ) : null}
      </div>
    </div>
  );

  return (
    <PageShell>
      <div className="m8c">
        <section className="m8c-convo" aria-label="Conversation with M8">
          <ChatHead />

          <div className="m8c-lo-mobile">{loCard}</div>

          <ol className="m8c-thread">
            {c.messages.map((msg, i) => {
              const paras = Array.isArray(msg.content) ? msg.content : [msg.content];
              if (msg.role === "user") {
                return (
                  <li key={i} className="m8c-msg m8c-msg--user">
                    <p className="sr-only">{msg.sender} said:</p>
                    <div className="m8c-bubble">{paras.join(" ")}</div>
                  </li>
                );
              }
              const label = msg.label && msg.label !== "EXAMPLE PRICING" ? msg.label : null;
              return (
                <li key={i} className="m8c-msg">
                  <Orb size="mark" px={28} className="m8c-avatar" />
                  <div className="m8c-msg__body">
                    <p className="m8c-meta">
                      <b>M8</b> · {msg.time}
                      {label ? <span className="m8c-meta__label"> · {label}</span> : null}
                      <SpeakButton text={paras.join(" ")} />
                    </p>
                    {paras.map((p, j) => (
                      <p key={j} className="m8c-p">
                        {p}
                      </p>
                    ))}

                    {msg.rateTable && !showOptions ? <p className="m8c-card m8c-small">{copy.demoChat.notEnoughLenders}</p> : null}
                    {msg.rateTable && showOptions ? (
                      <div className="m8c-card m8c-rates">
                        <p className="m8c-offer">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 8v5M12 16h.01" />
                          </svg>
                          {SAMPLE_CONVERSATION_LINE} · {NOT_AN_OFFER_LINE}
                        </p>
                        <p className="m8c-rates__scenario">Conforming 30-yr · $640,000 · 98004</p>
                        <ul className="m8c-opts">
                          {c.rateOptions.map((r, k) => {
                            const brand = brandFor(k);
                            return (
                              <li
                                key={r.rank}
                                className={`m8c-opt ${r.designation === "LOWEST TOTAL COST" ? "is-win" : ""}`}
                                style={{ "--lender-tint": lenderTint(brand) } as React.CSSProperties}
                              >
                                <div className="m8c-opt__who">
                                  <LenderMark lender={brand} size="sm" />
                                  <div>
                                    <p className="m8c-opt__name">{demoLender(k).label}</p>
                                    <p className="m8c-opt__des">{r.designation}</p>
                                  </div>
                                </div>
                                <div className="m8c-opt__num">
                                  <span className="m8c-rate">{r.rate}</span>
                                  <span className="m8c-lbl">Rate</span>
                                </div>
                                <div className="m8c-opt__num">
                                  <span className="m8c-rate">{r.apr.replace(/^APR\s*/, "")}</span>
                                  <span className="m8c-lbl">APR</span>
                                </div>
                                <div className="m8c-opt__pts">
                                  <span>
                                    {r.pointsLabel} · {r.payment}
                                    {r.paymentType.replace(" · P&I", "")}
                                  </span>
                                  <span className="m8c-lbl">{r.pointsDetail}</span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        <details className="m8c-assump">
                          <summary>
                            <span className="m8c-lbl">{t.softPull}</span>
                            <span className="m8c-assump__btn">{t.assumptions}</span>
                          </summary>
                          <ul>
                            {c.scenarioPills.map((p) => (
                              <li key={p.label}>
                                <span>{p.label}</span> {p.value}
                              </li>
                            ))}
                            <li>
                              <span>payment</span> principal and interest only
                            </li>
                            {moreShopped !== null ? (
                              <li>
                                <span>shopped</span> {moreShopped} more lenders, none lower than option 1
                              </li>
                            ) : null}
                          </ul>
                        </details>
                        <p className="m8c-disclaimer">
                          <b>{RATE_DISCLAIMER_LEAD}</b> {RATE_DISCLAIMER_BODY}
                        </p>
                        {officerLine ? <p className="m8c-officer">{officerLine}</p> : null}
                      </div>
                    ) : null}

                    {msg.scenarioPills ? (
                      <ul className="m8c-pills">
                        {c.scenarioPills.map((p) => (
                          <li key={p.label}>
                            {p.label} · <b>{p.value}</b>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {msg.holdAnalysis ? (
                      <div className="m8c-card">
                        <p className="m8c-offer">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 8v5M12 16h.01" />
                          </svg>
                          {SAMPLE_CONVERSATION_LINE} · {NOT_AN_OFFER_LINE}
                        </p>
                        <p className="m8c-rates__scenario">{t.holdEyebrow}</p>
                        <div className="m8c-hold">
                          {c.holdAnalysis.map((h, k) => (
                            <div key={h.label}>
                              <p className="m8c-lbl">{demoLenderText(h.label, k)}</p>
                              <p className="m8c-money">
                                <CountUp value={h.amount} />
                              </p>
                              <p className="m8c-lbl">{h.note}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          <FollowUps items={c.followups} />

          <Composer first={mlo.firstName} />
        </section>

        <aside className="m8c-rail" aria-label="Your loan officer and scenario">
          <div className="m8c-rail__inner">
            {loCard}
            <div className="m8c-card">
              <p className="m8c-eyebrow">{t.scenarioEyebrow}</p>
              <dl className="m8c-rows">
                {Object.entries(c.scenario).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
