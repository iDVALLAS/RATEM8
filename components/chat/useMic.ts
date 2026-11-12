"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downsample, MAX_LISTEN_SECONDS, peak, toPcm16 } from "@/lib/voice/pcm";

export type MicState = "idle" | "listening" | "working";

/**
 * useMic — the chat's microphone (C16). Records with Web Audio (works the
 * same in Chrome, Safari and Firefox), stops on a second tap or after 30
 * seconds, and sends 16 kHz PCM to /api/m8-listen. `onText` gets what
 * Google heard; `onError` a plain message. Audio never leaves memory
 * except for that one request.
 */
export function useMic(onText: (text: string) => void, onError: (msg: string) => void) {
  const [state, setState] = useState<MicState>("idle");
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<{ ctx: AudioContext; stream: MediaStream; node: ScriptProcessorNode; chunks: Float32Array[]; timer: number; started: number } | null>(null);

  const teardown = () => {
    const r = rec.current;
    rec.current = null;
    if (!r) return null;
    window.clearInterval(r.timer);
    r.node.disconnect();
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close().catch(() => {});
    return r;
  };

  const stop = useCallback(async () => {
    const r = teardown();
    if (!r) return;
    setSeconds(0);
    const samples = downsample(r.chunks, r.ctx.sampleRate);
    if (samples.length < 3200 || peak(samples) < 0.01) {
      setState("idle");
      onError("I didn't hear anything. Tap the mic and speak, then tap again.");
      return;
    }
    setState("working");
    try {
      const res = await fetch("/api/m8-listen", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: toPcm16(samples) as BodyInit });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; text?: string; error?: string } | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? "I couldn't hear that just now. Try again, or type it.");
      if (body.text) onText(body.text);
      else onError("I didn't catch that. Try again a little closer to the mic.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "I couldn't hear that just now.");
    } finally {
      setState("idle");
    }
  }, [onText, onError]);

  const start = useCallback(async () => {
    if (rec.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      onError("This browser can't use a microphone here. You can type your question.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      onError("The microphone is blocked. Allow it in your browser's settings, or type your question.");
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(ctx.destination);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= MAX_LISTEN_SECONDS) void stop();
    }, 250);
    rec.current = { ctx, stream, node, chunks, timer, started };
    setSeconds(0);
    setState("listening");
  }, [onError, stop]);

  const cancel = useCallback(() => {
    teardown();
    setSeconds(0);
    setState("idle");
  }, []);

  useEffect(() => () => void teardown(), []);

  return { state, seconds, start, stop, cancel };
}
