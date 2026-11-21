"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, DURATION_SLACK } from "@/lib/videos/audio";
import { registerVideoAction } from "./actions";
import { baseType, durationOf, extFor, posterFrom, runCheck, soundPieces } from "./client";

type Take = { file: Blob; url: string; seconds: number };

const TYPES = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
const pickType = () => (typeof MediaRecorder === "undefined" ? "" : TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "");
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * D55: record with the camera (phone or computer) or pick a file, then
 * save: the sound is read here for the word check, the video goes straight
 * to storage, and the check runs. Nothing is sent to anyone from this screen.
 */
export default function Recorder({ folder, checkReady }: { folder: string; checkReady: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"record" | "upload">("record");
  const [live, setLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCamera = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setLive(false);
  };
  useEffect(() => () => {
    stopCamera();
    if (timer.current) clearInterval(timer.current);
  }, []);
  useEffect(() => () => {
    if (take) URL.revokeObjectURL(take.url);
  }, [take]);

  async function openCamera() {
    setMsg(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      setLive(true);
      requestAnimationFrame(() => {
        if (preview.current) {
          preview.current.srcObject = s;
          preview.current.play().catch(() => undefined);
        }
      });
    } catch {
      setMsg({ ok: false, text: "The camera didn't open. Allow the camera and microphone for this site in your browser, or upload a video instead." });
    }
  }

  function startRecording() {
    if (!stream.current) return;
    const type = pickType();
    const chunks: BlobPart[] = [];
    const r = new MediaRecorder(stream.current, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 2_500_000 });
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      const seconds = (Date.now() - started.current) / 1000;
      const file = new Blob(chunks, { type: baseType(r.mimeType || type) });
      setTake({ file, url: URL.createObjectURL(file), seconds });
      stopCamera();
    };
    rec.current = r;
    started.current = Date.now();
    setElapsed(0);
    r.start(1000);
    setRecording(true);
    timer.current = setInterval(() => {
      const s = (Date.now() - started.current) / 1000;
      setElapsed(s);
      if (s >= MAX_VIDEO_SECONDS) stopRecording();
    }, 250);
  }

  function stopRecording() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRecording(false);
    if (rec.current?.state === "recording") rec.current.stop();
  }

  async function pickFile(f: File | undefined) {
    setMsg(null);
    if (!f) return;
    if (!/^video\/(mp4|webm|quicktime)$/.test(f.type)) return setMsg({ ok: false, text: "Use an MP4, WebM or MOV video (what phones and computers record)." });
    if (f.size > MAX_VIDEO_BYTES) return setMsg({ ok: false, text: "That file is over 250 MB. Record at 1080p or lower (not 4K), or trim it." });
    const seconds = await durationOf(f);
    if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS + DURATION_SLACK) return setMsg({ ok: false, text: `That video is ${clock(seconds)} long. Keep videos to two minutes.` });
    setTake({ file: f, url: URL.createObjectURL(f), seconds: Number.isFinite(seconds) ? seconds : 0 });
    if (!title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").slice(0, 80));
  }

  async function save() {
    if (!take) return;
    setMsg(null);
    try {
      setBusy("Reading what you said…");
      let sound: Awaited<ReturnType<typeof soundPieces>>;
      try {
        sound = await soundPieces(take.file);
      } catch {
        setBusy("");
        return setMsg({ ok: false, text: "This browser couldn't read the video's sound, so the word check can't run. Record it here instead, or use an MP4 file." });
      }
      const seconds = take.seconds || sound.seconds;
      if (sound.seconds > MAX_VIDEO_SECONDS + DURATION_SLACK) {
        setBusy("");
        return setMsg({ ok: false, text: "Keep videos to two minutes." });
      }
      setBusy("Saving the video…");
      setPct(0);
      const type = baseType(take.file.type);
      const stamp = `${Date.now()}`;
      // Give up if the upload makes no progress for a minute (a dropped connection), rather than spin.
      const stall = new AbortController();
      let lastMove = Date.now();
      const watch = setInterval(() => Date.now() - lastMove > 60_000 && stall.abort(), 5_000);
      let file: Awaited<ReturnType<typeof upload>>;
      try {
        file = await upload(`${folder}${stamp}.${extFor(type)}`, take.file, {
          access: "private",
          handleUploadUrl: "/api/cc/videos/upload",
          contentType: type,
          multipart: take.file.size > 8 * 1024 * 1024,
          abortSignal: stall.signal,
          onUploadProgress: (p) => {
            lastMove = Date.now();
            setPct(Math.round(p.percentage));
          },
        });
      } catch (e) {
        if (stall.signal.aborted) throw new Error("the upload stopped moving. Check your connection and try again.");
        throw e;
      } finally {
        clearInterval(watch);
      }
      setPct(null);
      const still = await posterFrom(take.file);
      const poster = still ? await upload(`${folder}${stamp}-poster.jpg`, still, { access: "private", handleUploadUrl: "/api/cc/videos/upload", contentType: "image/jpeg" }).catch(() => null) : null;
      const reg = await registerVideoAction({ url: file.url, posterUrl: poster?.url ?? null, title, durationSec: seconds || sound.seconds });
      if (!reg.ok) {
        setBusy("");
        return setMsg({ ok: false, text: reg.error });
      }
      setBusy("Checking the words…");
      const c = await runCheck(reg.id, sound.parts, (d, t) => t > 1 && setBusy(`Checking the words (${d} of ${t})…`));
      setBusy("");
      if (!c.ok) setMsg({ ok: false, text: `Saved, but ${c.error} You can run the check again from the list below.` });
      else if (c.status === "ok") setMsg({ ok: true, text: `Saved and checked. ${c.reason ? `${c.reason} ` : ""}It's ready to send from any contact's page, or below.` });
      else setMsg({ ok: false, text: `Saved, but held: ${c.reason} Record it again without that part; this one can't be sent.` });
      setTake(null);
      setTitle("");
      router.refresh();
    } catch (e) {
      setBusy("");
      setPct(null);
      setMsg({ ok: false, text: e instanceof Error && e.message ? `The video didn't save: ${e.message.slice(0, 160)}` : "The video didn't save. Try again." });
    }
  }

  const left = Math.max(0, MAX_VIDEO_SECONDS - elapsed);
  return (
    <div className="vid-rec">
      <div className="mlo-row-form" role="tablist" aria-label="How to add a video">
        <button type="button" role="tab" aria-selected={mode === "record"} className={`mlo-btn ${mode === "record" ? "" : "mlo-btn--ghost"}`} onClick={() => setMode("record")} disabled={!!busy || recording}>Record</button>
        <button type="button" role="tab" aria-selected={mode === "upload"} className={`mlo-btn ${mode === "upload" ? "" : "mlo-btn--ghost"}`} onClick={() => { stopCamera(); setMode("upload"); }} disabled={!!busy || recording}>Upload a video</button>
      </div>

      {!take && mode === "record" ? (
        <div className="vid-stage">
          <video ref={preview} className="vid-screen" muted playsInline aria-label="Camera preview" hidden={!live} />
          {!live ? <button type="button" className="mlo-btn" onClick={openCamera}>Turn on the camera</button> : null}
          {live && !recording ? <button type="button" className="mlo-btn" onClick={startRecording}>Start recording</button> : null}
          {recording ? (
            <div className="mlo-row-form">
              <button type="button" className="mlo-btn" onClick={stopRecording}>Stop</button>
              <span className="vid-clock" aria-live="off"><span className="vid-dot" aria-hidden /> {clock(elapsed)} · {clock(left)} left</span>
            </div>
          ) : null}
          <p className="mlo-note">Up to two minutes. Look at the camera, say their name, keep it to one idea, and end with how to reach you. No rates, payments or promises: those can only come with a Loan Estimate.</p>
        </div>
      ) : null}

      {!take && mode === "upload" ? (
        <label className="mlo-field">
          <span>Pick a video (MP4, MOV or WebM, up to two minutes)</span>
          <input type="file" accept="video/mp4,video/quicktime,video/webm" className="mlo-input" onChange={(e) => pickFile(e.target.files?.[0])} />
        </label>
      ) : null}

      {take ? (
        <div className="vid-stage">
          <video src={take.url} className="vid-screen" controls playsInline aria-label="Your video" />
          <label className="mlo-field">
            <span>Name it (it&apos;s the heading on their page)</span>
            <input className="mlo-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Congrats on closing!" />
          </label>
          <div className="mlo-row-form">
            <button type="button" className="mlo-btn" onClick={save} disabled={!!busy || !checkReady}>Save and check</button>
            <button type="button" className="mlo-btn mlo-btn--ghost" onClick={() => setTake(null)} disabled={!!busy}>{mode === "record" ? "Record again" : "Pick another"}</button>
          </div>
          {!checkReady ? <p className="mlo-note">Saving waits until the word check is set up (see below).</p> : null}
        </div>
      ) : null}

      {busy ? <p className="mlo-note" role="status">{busy}{pct !== null ? ` ${pct}%` : ""}</p> : null}
      {pct !== null ? <progress className="vid-progress" max={100} value={pct} aria-label="Upload progress" /> : null}
      {msg ? <div className={`mlo-flash ${msg.ok ? "mlo-flash--ok" : "mlo-flash--err"}`} role={msg.ok ? "status" : "alert"}><p>{msg.text}</p></div> : null}
    </div>
  );
}

/** Runs the word check again for a saved video (the sound is read from the stored file). */
export function CheckAgain({ id, url }: { id: string; url: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch");
      const sound = await soundPieces(await res.blob());
      const c = await runCheck(id, sound.parts);
      if (!c.ok) setErr(c.error);
      router.refresh();
    } catch {
      setErr("Couldn't read the video's sound here. Delete it and record it again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="mlo-btn mlo-btn--ghost" onClick={go} disabled={busy}>{busy ? "Checking…" : "Run the word check"}</button>
      {err ? <span className="mlo-note" role="alert">{err}</span> : null}
    </>
  );
}
