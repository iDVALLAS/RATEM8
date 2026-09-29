"use client";

import { useId, useState } from "react";
import ChatShell from "@/components/chat/ChatShell";
import M8LiveChat from "@/components/M8LiveChat";
import { chatContent } from "@/components/chat/chatContent";

/**
 * ChatExperienceWithToggle — the /demo tester wrapper (password-gated).
 *
 * Two tabs:
 *   "Scripted demo"      → <ChatShell />   the same UI-only shell as /chat
 *   "Live M8 (preview)"  → <M8LiveChat />  talks to /api/m8-chat
 *
 * The live tab is allowed HERE ONLY because app/demo/page.tsx renders
 * this after the tester password check. The public /chat route renders
 * <ChatShell /> alone and never calls a model while
 * CONFIG.featureFlags.chatLiveAi is false.
 */

type Mode = "scripted" | "live";

export default function ChatExperienceWithToggle() {
  const [mode, setMode] = useState<Mode>("scripted");
  const base = useId();
  const tabs: { id: Mode; label: string }[] = [
    { id: "scripted", label: chatContent.demo.tabs.scripted },
    { id: "live", label: chatContent.demo.tabs.live },
  ];

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === mode);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    setMode(next.id);
    document.getElementById(`${base}-tab-${next.id}`)?.focus();
  };

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 sm:px-6"
        style={{ borderColor: "var(--rule)" }}
      >
        <div role="tablist" aria-label="Chat mode" className="flex items-center gap-1" onKeyDown={onKeyDown}>
          {tabs.map((t) => {
            const active = mode === t.id;
            return (
              <button
                key={t.id}
                id={`${base}-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls={`${base}-panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setMode(t.id)}
                className="min-h-[44px] rounded-lg px-4 text-sm font-medium transition-colors"
                style={{
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--accent)" : "var(--muted)",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <span className="mono-label">
          {chatContent.demo.testerNote}
        </span>
      </div>

      <div
        id={`${base}-panel-scripted`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-scripted`}
        hidden={mode !== "scripted"}
        className="flex-1"
      >
        {mode === "scripted" ? <ChatShell /> : null}
      </div>

      <div
        id={`${base}-panel-live`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-live`}
        hidden={mode !== "live"}
        className="flex-1"
        style={{ height: "calc(100svh - 57px)" }}
      >
        {mode === "live" ? <M8LiveChat /> : null}
      </div>
    </div>
  );
}
