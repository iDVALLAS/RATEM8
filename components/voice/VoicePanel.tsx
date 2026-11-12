"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { CONFIG } from "@/lib/config";
import { copy } from "@/lib/copy";
import { useMloContext } from "@/components/mlo/MloContext";
import RichText from "@/components/chat/RichText";
import type { useVoiceChat } from "./useVoiceChat";

const v = copy.hero.voiceChat;
const live = copy.chat.live;

/**
 * VoicePanel — under the homepage orb during a voice conversation (C17):
 * the one-time note before the mic opens (AI, Google, what's kept, and the
 * two-party consent line where it applies), then the conversation written
 * out, the status line, "End voice chat" and "Continue in M8 Chat".
 */
export default function VoicePanel({ vc, storageOn, retention }: { vc: ReturnType<typeof useVoiceChat>; storageOn: boolean; retention: string }) {
  const ctx = useMloContext();
  const twoPartyState = CONFIG.states.find((s) => s.code === ctx.stateCode && s.twoPartyConsent)?.name ?? null;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [vc.messages, vc.draft]);

  if (vc.phase === "consent") {
    return (
      <div className="vc-panel" role="dialog" aria-label={v.consentTitle}>
        <p className="vc-panel__title">{v.consentTitle}</p>
        <p className="vc-panel__fine">
          {v.consentBody} {storageOn ? live.privacyStored.replace("{retention}", retention) : live.privacyNotStored}
          {storageOn && twoPartyState ? ` ${live.twoParty.replace("{state}", twoPartyState)}` : ""}{" "}
          <Link href="/privacy" className="underline hover:no-underline">
            {live.privacyLink}
          </Link>
        </p>
        <div className="vc-panel__actions">
          <button type="button" className="stitch-btn stitch-btn--on" onClick={vc.accept}>
            {v.start}
          </button>
          <button type="button" className="vc-panel__link" onClick={vc.decline}>
            {v.notNow}
          </button>
        </div>
      </div>
    );
  }

  const status =
    vc.phase === "listening" ? `${v.listening}${vc.seconds ? ` ${vc.seconds}s` : ""}` : vc.phase === "thinking" ? v.thinking : vc.phase === "speaking" ? v.speaking : v.paused;
  const recent = vc.messages.slice(-6);

  return (
    <section className="vc-panel" aria-label={v.transcriptLabel}>
      <div ref={scroller} className="vc-panel__log" aria-live="polite">
        {recent.length === 0 && !vc.draft ? <p className="vc-panel__fine">{v.hint}</p> : null}
        {recent.map((m, i) => (
          <div key={i} className={`vc-msg vc-msg--${m.role}`}>
            <span className="vc-msg__who">
              {m.role === "user" ? v.you : "M8"}
              {m.role === "assistant" ? <span className="m8-ai-tag">{live.aiTag}</span> : null}
            </span>
            {m.role === "assistant" ? <RichText text={m.content} /> : <p>{m.content}</p>}
          </div>
        ))}
        {vc.draft ? (
          <div className="vc-msg vc-msg--assistant">
            <span className="vc-msg__who">
              M8<span className="m8-ai-tag">{live.aiTag}</span>
            </span>
            <RichText text={vc.draft} />
          </div>
        ) : null}
      </div>
      {vc.note ? (
        <p className="vc-panel__note" role="status">
          {vc.note}
        </p>
      ) : null}
      <p className="vc-panel__status" role="status">
        <span aria-hidden="true" className={`vc-dot vc-dot--${vc.phase}`} />
        {status}
      </p>
      <div className="vc-panel__actions">
        <button type="button" className="vc-panel__link" onClick={vc.end}>
          {v.end}
        </button>
        <Link href="/chat" className="vc-panel__link" onClick={vc.end}>
          {v.continueInChat} →
        </Link>
      </div>
      <p className="vc-panel__fine">{live.strip}</p>
    </section>
  );
}
