import Link from "next/link";
import { demoChat } from "@/lib/demoChat";
import { ANCHOR_LO } from "@/lib/licensing";
import ChatInput from "@/components/ChatInput";

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
 */
export default function ChatExperience() {
  const c = demoChat;

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
              RATE<span className="text-[var(--color-m8-green)]">M8</span>
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
                    ? "bg-[color-mix(in_srgb,var(--color-m8-green)_12%,transparent)] text-[var(--color-m8-paper)]"
                    : "text-[var(--muted)] hover:text-[var(--color-m8-paper)]"
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
                className="px-3 py-2 rounded-md text-sm text-[var(--muted)] hover:text-[var(--color-m8-paper)] cursor-pointer flex items-center gap-2"
              >
                <span className="text-[var(--color-m8-green)]">·</span> {t}
              </li>
            ))}
          </ul>

          <div className="market-card">
            <div className="market-card-label">Live Market</div>
            <div className="market-card-rate">{c.market.rate}</div>
            <div className="market-card-meta">
              {c.market.label} ·{" "}
              <span className="text-[var(--color-m8-green)]">{c.market.change}</span>
            </div>
          </div>

          <div className="market-card">
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
                    <span className="font-medium text-[var(--color-m8-paper)]">
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
                        className="text-[15px] leading-relaxed text-[var(--color-m8-paper)] mb-3 last:mb-0"
                      >
                        {p}
                      </p>
                    ))
                  ) : (
                    <p className="text-[15px] leading-relaxed text-[var(--color-m8-paper)]">
                      {msg.content}
                    </p>
                  )}

                  {/* Rate options table */}
                  {msg.rateTable && (
                    <div className="rate-card mt-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-m8-green)]">
                          ◇ Live Wholesale Options · Conforming 30yr ·
                          $640,000 · 98004
                        </div>
                        <div className="font-mono text-[10px] tracking-[0.1em] text-[var(--muted)]">
                          Synced 14s ago
                        </div>
                      </div>
                      {c.rateOptions.map((r) => (
                        <div
                          key={r.rank}
                          className={`rate-card-row ${
                            r.selected ? "rate-card-row--selected" : ""
                          }`}
                        >
                          <div className="font-mono text-xs text-[var(--muted)]">
                            {r.rank}
                          </div>
                          <div>
                            <div className="font-display font-semibold text-base text-[var(--color-m8-paper)]">
                              {r.lender}
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
                            <div className="text-[var(--color-m8-paper)] mb-1">
                              {r.pointsLabel}
                            </div>
                            <div className="leading-tight">{r.pointsDetail}</div>
                          </div>
                          <button className="lo-btn-secondary text-[10px]">
                            DETAIL
                          </button>
                        </div>
                      ))}
                      <div className="mt-4 pt-3 border-t border-[var(--rule)] grid sm:grid-cols-2 gap-2 font-mono text-[10px] tracking-[0.05em] text-[var(--muted)]">
                        <span>
                          Indicative pricing · Subject to verification · Soft
                          pull only
                        </span>
                        <span className="sm:text-right">
                          11 more lenders shopped · None lower than #01
                        </span>
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
                      <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--color-m8-green)] mb-4">
                        ◆ Hold-Period Analysis · 7 Years
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {c.holdAnalysis.map((h) => (
                          <div key={h.label}>
                            <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--muted)] mb-2">
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
                className="flex gap-3 text-sm text-[var(--color-m8-paper)] leading-snug"
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
            <p className="text-xs text-[var(--muted)] leading-relaxed mt-3 whitespace-pre-line">
              {c.loanOfficer.bio.split(" · ").join("\n")}
            </p>
            <div className="mt-4 flex gap-2">
              <button className="lo-btn-secondary">Message</button>
              <button className="lo-btn-primary">Talk Now</button>
            </div>
          </div>
        </aside>
      </div>

      {/* ─── Input bar + disclosure ─── */}
      <ChatInput />

      <div className="demo-disclosure">
        RATEM8 never shares your data · Soft pull only ·{" "}
        <b>Verified by a human MLO before signing</b> · NMLS #{ANCHOR_LO.nmls} ·{" "}
        Sample conversation. Live pricing not yet active.
      </div>
    </div>
  );
}
