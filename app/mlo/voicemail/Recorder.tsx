"use client";

import { useEffect, useRef, useState } from "react";
import { encodeWav, MAX_VM_SECONDS, monoAt, VM_RATE } from "@/lib/voicemail/audio";
import { saveVoicemailAction } from "./actions";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Turns any recording or audio file into the 8 kHz WAV the phone network plays. */
async function toPhoneWav(file: Blob): Promise<{ wav: Uint8Array; seconds: number }> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const a = await ctx.decodeAudioData(await file.arrayBuffer());
    const samples = monoAt(Array.from({ length: a.numberOfChannels }, (_, i) => a.getChannelData(i)), a.sampleRate);
    // A little gain so quiet laptop microphones are clear on a phone, never clipping.
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    if (peak > 0.02 && peak < 0.7) for (let i = 0; i < samples.length; i++) samples[i] *= 0.7 / peak;
    return { wav: encodeWav(samples), seconds: samples.length / VM_RATE };
  } finally {
    ctx.close().catch(() => undefined);
  }
}

/** D57: record a voicemail (or pick an audio file), hear it as the phone will play it, then save it. */
export default function VoicemailRecorder({ ready }: { ready: boolean }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<{ wav: Uint8Array; url: string; seconds: number } | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    if (timer.current) clearInterval(timer.current);
  }, []);
  useEffect(() => () => {
    if (take) URL.revokeObjectURL(take.url);
  }, [take]);

  async function takeFrom(file: Blob) {
    setErr("");
    try {
      const t = await toPhoneWav(file);
      if (t.seconds > MAX_VM_SECONDS + 0.5) return setErr(`That's ${clock(t.seconds)} long. Keep voicemails under ${MAX_VM_SECONDS} seconds.`);
      if (t.seconds < 2) return setErr("That's too short to be a message.");
      setTake({ ...t, url: URL.createObjectURL(new Blob([t.wav as BlobPart], { type: "audio/wav" })) });
    } catch {
      setErr("That audio couldn't be read here. Record it instead.");
    }
  }

  async function start() {
    setErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      const chunks: BlobPart[] = [];
      const r = new MediaRecorder(s);
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        s.getTracks().forEach((t) => t.stop());
        takeFrom(new Blob(chunks, { type: r.mimeType }));
      };
      rec.current = r;
      started.current = Date.now();
      setElapsed(0);
      r.start(1000);
      setRecording(true);
      timer.current = setInterval(() => {
        const sec = (Date.now() - started.current) / 1000;
        setElapsed(sec);
        if (sec >= MAX_VM_SECONDS) stop();
      }, 250);
    } catch {
      setErr("The microphone didn't open. Allow it for this site in your browser, or pick an audio file.");
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRecording(false);
    if (rec.current?.state === "recording") rec.current.stop();
  }

  async function save() {
    if (!take) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("title", title);
    fd.set("audio", new Blob([take.wav as BlobPart], { type: "audio/wav" }), "voicemail.wav");
    await saveVoicemailAction(fd);
    setBusy(false);
  }

  return (
    <div className="mlo-grid">
      {!take ? (
        <div className="mlo-row-form">
          {recording ? (
            <>
              <button type="button" className="mlo-btn" onClick={stop}>Stop</button>
              <span className="mlo-note" aria-live="off">{clock(elapsed)} · {clock(Math.max(0, MAX_VM_SECONDS - elapsed))} left</span>
            </>
          ) : (
            <>
              <button type="button" className="mlo-btn" onClick={start}>Record</button>
              <label className="mlo-btn mlo-btn--ghost">
                Pick an audio file
                <input type="file" accept="audio/*" className="sr-only" onChange={(e) => e.target.files?.[0] && takeFrom(e.target.files[0])} />
              </label>
            </>
          )}
        </div>
      ) : (
        <>
          <audio src={take.url} controls aria-label="Your voicemail, as the phone will play it" />
          <label className="mlo-field">
            <span>Name it (only you see this)</span>
            <input className="mlo-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Appraisal is in" />
          </label>
          <div className="mlo-row-form">
            <button type="button" className="mlo-btn" onClick={save} disabled={busy || !ready}>{busy ? "Checking…" : "Save and check"}</button>
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => setTake(null)} disabled={busy}>Record again</button>
          </div>
        </>
      )}
      <p className="mlo-note">Up to {MAX_VM_SECONDS} seconds. Start right in: Command Center adds who&apos;s calling before your message and your number after it, as the law requires. No rates, payments or promises.</p>
      {err ? <div className="mlo-flash mlo-flash--err" role="alert"><p>{err}</p></div> : null}
    </div>
  );
}
