"use client";

import { useState } from "react";
import ChatExperience from "@/components/ChatExperience";
import M8LiveChat from "@/components/M8LiveChat";

/**
 * ChatExperienceWithToggle — v10.0 wrapper
 *
 * Adds a simple two-tab switcher above the chat area:
 *   [ Scripted demo ]  [ Live M8 (preview) ]
 *
 * "Scripted demo" = the Sarah refi conversation that testers have
 * been seeing since v7. Useful for showing what a completed M8 flow
 * looks like (rate cards, hold-period analysis, three-option display).
 *
 * "Live M8 (preview)" = the real Claude API conversation from v10.0.
 * Placeholder personality, no rates, no compliance guardrails yet.
 *
 * Both live behind the /demo password gate. When v10.2 ships with
 * real guardrails and the compliance attorney signs off, the "Live M8"
 * tab can become the default.
 *
 * How to use:
 *   Replace `<ChatExperience />` with `<ChatExperienceWithToggle />`
 *   in whatever page renders the chat (usually app/demo/page.tsx).
 */

type Mode = "demo" | "live";

export default function ChatExperienceWithToggle() {
  const [mode, setMode] = useState<Mode>("demo");

  return (
    <div className="flex flex-col h-screen">
      <div
        className="flex items-center justify-center gap-1 border-b px-4 py-2"
        style={{ borderColor: "var(--rule)", background: "var(--bg)" }}
        role="tablist"
        aria-label="Chat mode"
      >
        <ModeButton
          active={mode === "demo"}
          onClick={() => setMode("demo")}
          label="Scripted demo"
          hint="Sarah's refi walkthrough"
        />
        <ModeButton
          active={mode === "live"}
          onClick={() => setMode("live")}
          label="Live M8"
          hint="Chat with the real API"
          badge="PREVIEW"
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {mode === "demo" ? <ChatExperience /> : <M8LiveChat />}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  hint,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  badge?: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--muted)",
      }}
      title={hint}
    >
      <span className="text-sm font-medium">{label}</span>
      {badge && (
        <span
          className="font-mono text-[9px] tracking-[0.15em] uppercase px-1.5 py-0.5 rounded"
          style={{
            background: "color-mix(in srgb, var(--color-m8-green) 20%, transparent)",
            color: "var(--color-m8-green)",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
