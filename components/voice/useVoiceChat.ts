"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrbState } from "@/components/Orb";
import { useMic } from "@/components/chat/useMic";
import { streamM8Turn } from "@/lib/m8/client";
import { M8_SESSION_KEY, type M8Message } from "@/lib/m8/shared";
import { playM8Reply, silentWav } from "@/lib/voice/client";
import { copy } from "@/lib/copy";

export type VoicePhase = "off" | "consent" | "listening" | "thinking" | "speaking" | "paused";

const CONSENT_KEY = "loanm8.voiceChatOk";
const v = copy.hero.voiceChat;
const loadedAt = typeof performance !== "undefined" ? performance.now() : 0;

function readSaved(): M8Message[] {
  try {
    const raw = window.localStorage.getItem(M8_SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as M8Message[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * useVoiceChat — a hands-free conversation with M8 (C17): listen → the
 * words go to M8 → M8 answers out loud → listen again.
 *
 * It uses the same endpoints as the typed chat (/api/m8-listen,
 * /api/m8-chat, /api/m8-speak), so the same redaction, guard, limits and
 * transcript storage apply, and the same browser copy of the conversation
 * (M8_SESSION_KEY), so "Continue in M8 Chat" picks up where it left off.
 */
export function useVoiceChat() {
  const [phase, setPhase] = useState<VoicePhase>("off");
  const [messages, setMessages] = useState<M8Message[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const phaseRef = useRef<VoicePhase>("off");
  const msgsRef = useRef<M8Message[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const run = useRef(0);

  const go = (p: VoicePhase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const commit = (m: M8Message[]) => {
    msgsRef.current = m;
    setMessages(m);
    try {
      window.localStorage.setItem(M8_SESSION_KEY, JSON.stringify(m));
    } catch {
      // ignore
    }
  };

  const listenRef = useRef<() => void>(() => {});

  const onHeard = useCallback(async (text: string) => {
    if (phaseRef.current === "off") return;
    const token = ++run.current;
    const next: M8Message[] = [...msgsRef.current, { role: "user", content: text }];
    commit(next);
    setDraft("");
    go("thinking");
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const out = await streamM8Turn(next, { t: Math.round(performance.now() - loadedAt), signal: ctl.signal, onText: setDraft, fallbackError: v.failed });
      if (token !== run.current) return;
      const shown = out.userText !== undefined ? next.map((m, i) => (i === next.length - 1 ? { ...m, content: out.userText as string } : m)) : next;
      const reply: M8Message = { role: "assistant", content: out.text };
      if (out.pricing) reply.pricing = out.pricing;
      if (out.voice) reply.voice = out.voice;
      commit(out.text ? [...shown, reply] : shown);
      setDraft("");
      if (out.text && out.voice && audio.current) {
        go("speaking");
        try {
          await playM8Reply(audio.current, out.text, out.voice, v.speakFailed);
        } catch (err) {
          if (token === run.current) setNote(err instanceof Error ? err.message : v.speakFailed);
        }
      }
      if (token === run.current && (phaseRef.current as VoicePhase) !== "off") listenRef.current();
    } catch (err) {
      if (token !== run.current || (err instanceof Error && err.name === "AbortError")) return;
      setDraft("");
      setNote(err instanceof Error ? err.message : v.failed);
      go("paused");
    } finally {
      if (abort.current === ctl) abort.current = null;
    }
  }, []);

  const onMicError = useCallback((msg: string) => {
    if (phaseRef.current === "off") return;
    setNote(msg);
    go("paused");
  }, []);
  const onSilence = useCallback(() => {
    if (phaseRef.current !== "off") go("paused");
  }, []);
  const mic = useMic(onHeard, onMicError, { auto: true, onSilence });

  const listen = useCallback(() => {
    setNote(null);
    go("listening");
    void mic.start();
  }, [mic]);
  listenRef.current = listen;

  /** Inside the tap that starts things, so phones allow M8's audio later. */
  const unlock = () => {
    const a = audio.current ?? new Audio();
    audio.current = a;
    a.src = silentWav();
    a.play().catch(() => {});
  };

  const begin = () => {
    unlock();
    commit(readSaved());
    listen();
  };

  /** The Voice button or the orb. */
  const tap = () => {
    const p = phaseRef.current;
    if (p === "off") {
      let ok = false;
      try {
        ok = window.localStorage.getItem(CONSENT_KEY) === "1";
      } catch {
        // ignore
      }
      if (ok) begin();
      else go("consent");
      return;
    }
    if (p === "consent") return;
    if (p === "listening") return void mic.stop();
    if (p === "speaking") {
      run.current++;
      audio.current?.pause();
      return listen();
    }
    if (p === "paused") {
      unlock();
      return listen();
    }
  };

  const accept = () => {
    try {
      window.localStorage.setItem(CONSENT_KEY, "1");
    } catch {
      // ignore
    }
    begin();
  };

  const end = useCallback(() => {
    run.current++;
    abort.current?.abort();
    audio.current?.pause();
    mic.cancel();
    setDraft("");
    setNote(null);
    go("off");
  }, [mic]);

  useEffect(() => () => {
    abort.current?.abort();
    audio.current?.pause();
  }, []);

  const orb: OrbState = phase === "listening" ? "listening" : phase === "thinking" ? "thinking" : phase === "speaking" ? "speaking" : "idle";
  return { phase, messages, draft, note, seconds: mic.seconds, orb, tap, accept, end, decline: () => go("off") };
}
