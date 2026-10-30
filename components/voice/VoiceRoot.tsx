"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createVoice, type VoiceKind, type VoiceProvider } from "@/lib/voice/provider";
import type { OrbState } from "@/components/Orb";
import VoiceConsentSheet from "./VoiceConsentSheet";

/**
 * VoiceRoot — M8's voice for the whole site (v33). Mounted once in
 * app/layout.tsx with the engine the server chose (CONFIG.voice.provider).
 *
 * - Consent first: nothing listens or speaks until the visitor agrees in
 *   VoiceConsentSheet (WA and CA are two-party consent states). The choice
 *   is remembered in this browser only.
 * - `state` drives any orb that wants to follow M8 (idle / listening /
 *   speaking). Tapping the mic stops speech first.
 * - No audio is recorded or stored anywhere.
 */

type Ctx = {
  kind: VoiceKind;
  state: OrbState;
  /** Read M8's replies aloud. */
  repliesOn: boolean;
  setRepliesOn: (on: boolean) => Promise<void>;
  canListen: boolean;
  canSpeak: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
  /** Listen once; resolves with what was said ("" if nothing or declined). */
  listen: (onPartial?: (t: string) => void) => Promise<string>;
  /** Asks for consent if it hasn't been given; resolves true when it has. */
  ensureConsent: () => Promise<boolean>;
};

const VoiceCtx = createContext<Ctx | null>(null);

const CONSENT_KEY = "lm8_voice_consent_v1";
const REPLIES_KEY = "lm8_voice_replies";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* private mode: the choice lasts this page view */
  }
}

export default function VoiceRoot({ kind, children }: { kind: VoiceKind; children: React.ReactNode }) {
  const voice = useRef<VoiceProvider | null>(null);
  const [state, setState] = useState<OrbState>("idle");
  const [repliesOn, setReplies] = useState(false);
  const [consented, setConsented] = useState(false);
  const [caps, setCaps] = useState({ listen: false, speak: false });
  const [asking, setAsking] = useState(false);
  const pending = useRef<((ok: boolean) => void) | null>(null);
  const stopListening = useRef<(() => void) | null>(null);

  useEffect(() => {
    voice.current = createVoice(kind);
    setCaps({ listen: voice.current.canListen(), speak: voice.current.canSpeak() });
    const ok = read(CONSENT_KEY) === "yes";
    setConsented(ok);
    if (ok && read(REPLIES_KEY) === "on") setReplies(true);
    return () => voice.current?.stop();
  }, [kind]);

  const ensureConsent = useCallback(() => {
    if (consented) return Promise.resolve(true);
    setAsking(true);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
    });
  }, [consented]);

  const answer = useCallback((ok: boolean) => {
    setAsking(false);
    if (ok) {
      write(CONSENT_KEY, "yes");
      setConsented(true);
    }
    pending.current?.(ok);
    pending.current = null;
  }, []);

  const stop = useCallback(() => {
    stopListening.current?.();
    stopListening.current = null;
    voice.current?.stop();
    setState("idle");
  }, []);

  const speak = useCallback(
    async (text: string) => {
      const v = voice.current;
      if (!v || !(await ensureConsent())) return;
      stopListening.current?.();
      await v.speak(text, () => setState("speaking"));
      setState((s) => (s === "speaking" ? "idle" : s));
    },
    [ensureConsent],
  );

  const listen = useCallback(
    async (onPartial?: (t: string) => void) => {
      const v = voice.current;
      if (!v || !v.canListen() || !(await ensureConsent())) return "";
      v.stop(); // the mic interrupts M8
      setState("listening");
      return new Promise<string>((resolve) => {
        let said = "";
        stopListening.current = v.listen({
          onPartial,
          onFinal: (t) => (said = t),
          onEnd: () => {
            stopListening.current = null;
            setState("idle");
            resolve(said);
          },
          onError: () => {
            stopListening.current = null;
            setState("idle");
            resolve("");
          },
        });
      });
    },
    [ensureConsent],
  );

  const setRepliesOn = useCallback(
    async (on: boolean) => {
      if (on && !(await ensureConsent())) return;
      setReplies(on);
      write(REPLIES_KEY, on ? "on" : "off");
      if (!on) stop();
    },
    [ensureConsent, stop],
  );

  const value = useMemo<Ctx>(
    () => ({ kind, state, repliesOn, setRepliesOn, canListen: caps.listen, canSpeak: caps.speak, speak, stop, listen, ensureConsent }),
    [kind, state, repliesOn, setRepliesOn, caps, speak, stop, listen, ensureConsent],
  );

  return (
    <VoiceCtx.Provider value={value}>
      {children}
      {asking ? <VoiceConsentSheet kind={kind} onAnswer={answer} /> : null}
    </VoiceCtx.Provider>
  );
}

/** The site's voice. Outside VoiceRoot (tests, isolated renders) it is silent. */
export function useVoice(): Ctx {
  const c = useContext(VoiceCtx);
  if (c) return c;
  return {
    kind: "browser",
    state: "idle",
    repliesOn: false,
    setRepliesOn: async () => {},
    canListen: false,
    canSpeak: false,
    speak: async () => {},
    stop: () => {},
    listen: async () => "",
    ensureConsent: async () => false,
  };
}
