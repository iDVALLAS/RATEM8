import Link from "next/link";
import { demoChat, demoPronoun } from "@/lib/demoChat";
import { CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import ChatInput from "@/components/ChatInput";
import BookingCTA from "@/components/BookingCTA";
import ExamplePricingLabel from "@/components/ExamplePricingLabel";
import LenderMark from "@/components/LenderMark";
import { lenderBrand, lenderTint } from "@/lib/lenders";

/**
 * ChatExperience — the M8 chat preview, extracted from v7's /chat
 * page into a reusable component.
 *
 * Renders the full 3-column demo: conversations sidebar + chat
 * thread + scenario/principles/LO sidebar.
 *
 * Used by:
 *   /demo  (gated by password — see app/demo/page.tsx)
 *   /chat  (legacy URL, redirected to /demo via middleware)
 *
 * Data comes from lib/demoChat.ts (the Sarah refi scenario).
 * In v10 this becomes live Claude API; for now it's scripted.
 *
 * Compliance footer: "Sample conversation. Live pricing not yet
 * active." is preserved exactly as v7 had it.
 *
 * v21 restore (dropped by the one-shot rebuild): verbatim from main, plus
 *  - ExamplePricingLabel on every rate card (the options card, each
 *    option row, the hold-period card, both sidebar rate cards);
 *  - "Book a call with a licensed loan officer" under the follow-ups;
 *  - the option set renders only with at least CONFIG.lenderCountMin
 *    lenders, and "N more lenders shopped" only when the scenario's
 *    shopped count is real (lendersShopped, ≤ CONFIG.lenderCountMax);
 *  - loan officer facts from config (lib/demoChat.ts).
 */
export default function ChatExperience() {
  const c = demoChat;
  const showOptions = new Set(c.rateOptions.map((r) => r.lender)).size >= CONFIG.lenderCountMin;
  const shopped = c.lendersShopped;
  const moreShopped =
    Number.isInteger(shopped) && shopped <= CONFIG.lenderCountMax && shopped > c.rateOptions.length
      ? shopped - c.rateOptions.length
      : null;

  return (
    <div className="chat-page">
      {/* ─── Header ─── */}
      <header className="chat-header">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Back to homepage" className="flex items-center gap-3">
            <span
              className="grid place-items-center rounded-md font-mono text-xs font-bold"
              style={{
                background: "var(--color-m8-green)",
                color: "var(--color-m8-forest)",
                width: 30,
                height: 30,
              }}
            >
              M8
            </span>
            <span className="font-display font-bold tracking-tight">
              Loan<span className="text-[var(--color-m8-green)]">M8</span>
            </span>
          </Link>
          <span className="ml-3 hidden sm:inline font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--muted)]">
            Your AI Mortgage Mate
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2">
            <span className="live-badge">Live · Pricing Sync 14s ago</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--rule)]">
            <span className="lo-avatar" style={{ width: 22, height: 22 }} />
            <span className="text-sm">{c.user.name}</span>
          </div>
        </div>
      </header>

      <div className="chat-shell">
        {/* ─── Left Sidebar: Conversations + Tools + Market ─── */}
        <aside className="chat-side">
          <div className="principle-label mb-4 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--muted)]">
            Conversations
          </div>
          <ul className="space-y-1 mb-8">
            {c.conversations.map((conv) => (
              <li
                key={conv.id}
                className={`px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                  conv.active
                    ? "bg-[var(--active-tab-bg)] text-[var(--fg)]"
                    : "text-[var(--muted)] hover:text-[var(--fg)]"
                }`}
              >
                {conv.active && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-m8-green)] mr-2 -translate-y-px" />
                )}
                {conv.title}
              </li>
            ))}
          </ul>

          <div className="principle-label mb-4 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--muted)]">
            Tools
          </div>
          <ul className="space-y-1 mb-8">
            {c.tools.map((t) => (
              <li
                key={t}
                className="px-3 py-2 rounded-md text-sm text-[var(--muted)] hover:text-[var(--fg)] cursor-pointer flex items-center gap-2"
              >
                <span className="text-[var(--color-m8-green)]">·</span> {t}
              </li>
            ))}
          </ul>

          <div className="market-card">
            <ExamplePricingLabel className="mb-2" />
            <div className="market-card-label">Live Market</div>
            <div className="market-card-rate">{c.market.rate}</div>
            <div className="market-card-meta">
              {c.market.label} ·{" "}
              <span className="text-[var(--color-m8-green)]">{c.market.change}</span>
            </div>
          </div>

          <div className="market-card">
            <ExamplePricingLabel className="mb-2" />
            <div className="market-card-label">Your best quote</div>
            <div className="market-card-rate">{c.bestQuote.rate}</div>
            <div className="market-card-meta">{c.bestQuote.detail}</div>
          </div>
        </aside>

        {/* ─── Center: Messages ─── */}
        <main className="chat-center">
          {c.messages.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <div key={i} className={isUser ? "msg-bubble-user" : "msg-bubble-m8"}>
                <div className={`msg-avatar ${isUser ? "msg-avatar--user" : "msg-avatar--m8"}`}>
                  {msg.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="msg-meta">
                    <span className="font-medium text-[var(--fg)]">
                      {msg.sender}
                    </span>
                    <span className="mx-2 opacity-50">·</span>
                    <span>{msg.time}</span>
                    {msg.label && (
                      <span className="msg-meta--label ml-2">{msg.label}</span>
                    )}
                  </div>
                  {Array.isArray(msg.content) ? (
                    msg.content.map((p, j) => (
                      <p
                        key={j}
                        className="text-[15px] leading-relaxed text-[var(--fg)] mb-3 last:mb-0"
                      >
                        {p}
                      </p>
                    ))
                  ) : (
                    <p className="text-[15px] leading-relaxed text-[var(--fg)]">
                      {msg.content}
                    </p>
                  )}

                  {/* Rate options table */}
                  {msg.rateTable && !showOptions && (
                    <p className="rate-card mt-4 text-sm text-[var(--muted)]">{copy.demoChat.notEnoughLenders}</p>
                  )}
                  {msg.rateTable && showOptions && (
                    <div className="rate-card mt-4">
                      <ExamplePricingLabel className="mb-3" />
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-m8-green)]">
                          ◇ Live Wholesale Options · Conforming 30yr ·
                          $640,000 · 98004
                        </div>
                        <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--muted)]">
                          Synced 14s ago
                        </div>
                      </div>
                      {c.rateOptions.map((r) => {
                        const brand = lenderBrand(r.lenderKey);
                        // v23: tinted edge + wash from the lender's colour; the
                        // lowest-total-cost option (the original "selected" row) glows.
                        const winner = r.designation === "LOWEST TOTAL COST";
                        return (
                        <div
                          key={r.rank}
                          className={`rate-card-row lender-tinted ${
                            r.selected ? "rate-card-row--selected" : ""
                          } ${winner ? "is-winner" : ""}`}
                          style={brand ? ({ "--lender-tint": lenderTint(brand) } as React.CSSProperties) : undefined}
                        >
                          <div className="font-mono text-xs text-[var(--muted)]">
                            {r.rank}
                          </div>
                          <div>
                            <ExamplePricingLabel className="example-label--row" />
                            <div className="flex items-center gap-2.5">
                              {brand ? <LenderMark lender={brand} size="sm" /> : null}
                              <div className="font-display font-semibold text-base text-[var(--fg)]">
                                {r.lender}
                              </div>
                            </div>
                            <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--muted)] mt-1">
                              {r.designation}
                            </div>
                          </div>
                          <div>
                            <div className="rate-num">{r.rate}</div>
                            <div className="rate-num-secondary">{r.apr}</div>
                          </div>
                          <div>
                            <div className="rate-money">{r.payment}</div>
                            <div className="rate-num-secondary">{r.paymentType}</div>
                          </div>
                          <div className="text-xs text-[var(--muted)]">
                            <div className="text-[var(--fg)] mb-1">
                              {r.pointsLabel}
                            </div>
                            <div className="leading-tight">{r.pointsDetail}</div>
                          </div>
                          <button className="lo-btn-secondary text-[10px]">
                            DETAIL
                          </button>
                        </div>
                        );
                      })}
                      <div className="mt-4 pt-3 border-t border-[var(--rule)] grid sm:grid-cols-2 gap-2 font-mono text-[10px] tracking-[0.05em] text-[var(--muted)]">
                        <span>
                          Indicative pricing · Subject to verification · Soft
                          pull only
                        </span>
                        {moreShopped !== null ? (
                          <span className="sm:text-right">
                            {moreShopped} more lenders shopped · None lower than #01
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Scenario pill row */}
                  {msg.scenarioPills && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {c.scenarioPills.map((p) => (
                        <span key={p.label} className="pill">
                          {p.label} · <b>{p.value}</b>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Hold-period analysis */}
                  {msg.holdAnalysis && (
                    <div className="rate-card mt-4">
                      <ExamplePricingLabel className="mb-3" />
                      <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-m8-green)] mb-4">
                        ◆ Hold-Period Analysis · 7 Years
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {c.holdAnalysis.map((h) => (
                          <div key={h.label}>
                            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--muted)] mb-2">
                              <LenderMark lender={h.lenderKey} size="sm" />
                              {h.label}
                            </div>
                            <div className="rate-money">{h.amount}</div>
                            <div className="font-mono text-[10px] text-[var(--muted)] mt-1">
                              {h.note}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Suggested follow-ups */}
          <div className="mt-8 flex flex-wrap gap-3">
            {c.followups.map((f) => (
              <button key={f} className="followup-btn">
                → {f}
              </button>
            ))}
          </div>

          {/* v21: the human hand-off, inside the demo. */}
          <div className="mt-6 max-w-sm">
            <BookingCTA kind="borrower" variant="secondary" intake={false}>
              {copy.demoChat.bookCall}
            </BookingCTA>
          </div>
        </main>

        {/* ─── Right Sidebar: Scenario + Principles + LO ─── */}
        <aside className="chat-side chat-side--right">
          <div className="flex items-baseline justify-between mb-4">
            <div className="principle-label font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--muted)]">
              Your Scenario
            </div>
            <button className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--color-m8-green)]">
              EDIT
            </button>
          </div>

          <div className="mb-8">
            {Object.entries(c.scenario).map(([k, v]) => (
              <div key={k} className="scenario-row">
                <span className="scenario-label">
                  {k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                </span>
                <span className="scenario-value">{v}</span>
              </div>
            ))}
          </div>

          <div className="flex items-baseline justify-between mb-4">
            <div className="principle-label font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--muted)]">
              The M8 Code
            </div>
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--muted)]">
              8 of 8
            </span>
          </div>

          <ol className="space-y-3 mb-8">
            {c.m8Code.map((p) => (
              <li
                key={p.n}
                className="flex gap-3 text-sm text-[var(--fg)] leading-snug"
              >
                <span className="font-mono text-xs text-[var(--muted)] flex-shrink-0 pt-0.5">
                  {p.n}
                </span>
                <span>{p.text}</span>
              </li>
            ))}
          </ol>

          <div className="principle-label mb-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--muted)]">
            Your Loan Officer
          </div>

          <div className="lo-card">
            <div className="flex items-start gap-3">
              <span className="lo-avatar" />
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold text-base">
                  {c.loanOfficer.name}
                </div>
                <div className="font-mono text-[10px] tracking-[0.08em] text-[var(--muted)] mt-1">
                  {c.loanOfficer.nmls}
                </div>
              </div>
            </div>
            {c.loanOfficer.bio ? (
              <p className="text-xs text-[var(--muted)] leading-relaxed mt-3 whitespace-pre-line">
                {c.loanOfficer.bio.split(" · ").join("\n")}
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button className="lo-btn-secondary">Message</button>
              <button className="lo-btn-primary">Talk Now</button>
            </div>
          </div>
        </aside>
      </div>

      {/* ─── Input bar + disclosure ─── */}
      <ChatInput mloFirst={c.loanOfficer.firstName} mloWill={demoPronoun.will} />

      <div className="demo-disclosure">
        LOANM8 never shares your data · Soft pull only ·{" "}
        <b>Verified by a human MLO before signing</b> · NMLS #{c.loanOfficer.nmlsNumber} ·{" "}
        Sample conversation. Live pricing not yet active.
      </div>
    </div>
  );
}
