"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Orb from "@/components/Orb";
import { copy } from "@/lib/copy";
import { AI_DISCLOSURE, NOT_A_CREDIT_PULL } from "@/lib/config";
import { boxFromPoints, boxToPixels, countPdfPages, kindLabel, maskText, type MaskResult, type RedactionBox } from "@/lib/second-look/redact";
import { SECOND_LOOK_DISCLAIMER, type SecondLookResponse, type SecondLookResult } from "@/lib/second-look/schema";
import ResultsBento from "./ResultsBento";
import { SAMPLE_DOC, SAMPLE_FIELDS } from "./sample";
import { SL } from "./strings";
import "./second-look.css";

/**
 * LiveUpload — Layer 2. Consent → drop zone → client-side redaction
 * preview → reading → results.
 *
 * NOTHING leaves the browser until the user clicks "Send masked
 * document". Redaction boxes are burned onto a canvas copy of the image
 * before upload. No localStorage, no cookies, no analytics events.
 *
 * `live` = CONFIG.featureFlags.secondLookLiveUpload, passed from the
 * server page (the env var is server-only). When false the drop zone is
 * disabled and a "preview the flow" mode walks the same UI with the
 * fictional sample, never calling the API.
 */

type Stage = "consent" | "drop" | "redact" | "reading" | "results" | "error";

type Doc =
  | { kind: "image"; name: string; url: string; mediaType: "image/png" | "image/jpeg" | "image/webp"; text: null }
  | { kind: "pdf"; name: string; pages: number | null; text: null }
  | { kind: "sample"; name: string; url: string; mediaType: "image/png"; text: string };

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_FILE = 10 * 1024 * 1024;
const MAX_PAYLOAD = 1.9 * 1024 * 1024;
const MAX_SIDE = 1800;

/* ─── Sample document image (fictional), drawn on a canvas ────── */

function sampleText(): string {
  const lines = [
    "LOAN ESTIMATE — SAMPLE",
    `Applicant: ${SAMPLE_DOC.borrower}`,
    `Property: ${SAMPLE_DOC.property}`,
    "Loan ID: SAMPLE-000123",
    `Loan amount: ${SAMPLE_DOC.loanAmount}`,
    ...SAMPLE_FIELDS.map((f) => `${f.label}: ${f.value}`),
    "Sample — illustrative only, not an offer.",
  ];
  return lines.join("\n");
}

function makeSampleImage(): string | null {
  try {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 720;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#1A1A19";
    ctx.font = "600 26px system-ui, sans-serif";
    ctx.fillText("Loan Estimate", 40, 60);
    ctx.font = "13px ui-monospace, monospace";
    ctx.fillStyle = "#5F5E5A";
    ctx.fillText("SAMPLE — ILLUSTRATIVE ONLY", 40, 84);
    ctx.fillRect(40, 96, 560, 2);
    ctx.fillStyle = "#1A1A19";
    ctx.font = "16px system-ui, sans-serif";
    sampleText()
      .split("\n")
      .slice(1)
      .forEach((line, i) => ctx.fillText(line, 40, 136 + i * 40));
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

/* ─── Canvas compositing of redaction boxes ───────────────────── */

async function compositeImage(url: string, boxes: RedactionBox[]): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("load"));
    el.src = url;
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(img, 0, 0, w, h);
  ctx.fillStyle = "#000";
  for (const b of boxes) {
    const p = boxToPixels(b, w, h);
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }
  const dataUrl = c.toDataURL("image/jpeg", 0.85);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
}

/* ─── Component ─────────────────────────────────────────────── */

export default function LiveUpload({ live }: { live: boolean }) {
  const L = copy.secondLook.live;
  const [stage, setStage] = useState<Stage>("consent");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [mask, setMask] = useState<MaskResult | null>(null);
  const [boxes, setBoxes] = useState<RedactionBox[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: SecondLookResult; disclaimer: string } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewMode = doc?.kind === "sample";

  // Object URLs for chosen images: revoke the previous one whenever the
  // document is replaced or cleared, and on unmount.
  const objectUrl = useRef<string | null>(null);
  const releaseUrl = useCallback(() => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  }, []);
  useEffect(() => releaseUrl, [releaseUrl]);

  const reset = useCallback(() => {
    releaseUrl();
    setDoc(null);
    setMask(null);
    setBoxes([]);
    setDrawing(false);
    setDraft(null);
    setError(null);
    setResult(null);
    setStage("drop");
  }, [releaseUrl]);

  const setDocument = useCallback((d: Doc) => {
    releaseUrl();
    if (d.kind === "image") objectUrl.current = d.url;
    setDoc(d);
    setMask(d.text ? maskText(d.text) : null);
    setBoxes([]);
    setDrawing(false);
    setError(null);
    setStage("redact");
  }, [releaseUrl]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_FILE) {
        setError(SL.live.fileTooLarge);
        return;
      }
      if ((IMAGE_TYPES as readonly string[]).includes(file.type)) {
        setDocument({ kind: "image", name: file.name, url: URL.createObjectURL(file), mediaType: file.type as (typeof IMAGE_TYPES)[number], text: null });
        return;
      }
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        let pages: number | null = null;
        try {
          const buf = await file.arrayBuffer();
          pages = countPdfPages(new TextDecoder("latin1").decode(buf));
        } catch {
          pages = null;
        }
        setDocument({ kind: "pdf", name: file.name, pages, text: null });
        return;
      }
      setError(SL.live.unsupported);
    },
    [setDocument]
  );

  const startPreview = () => {
    const url = makeSampleImage();
    if (!url) {
      setError(SL.live.compositeFailed);
      return;
    }
    setDocument({ kind: "sample", name: "sample-loan-estimate.png", url, mediaType: "image/png", text: sampleText() });
  };

  /* Pointer drawing over the preview */
  const toPoint = (e: React.PointerEvent) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPoint(e);
    setDraft({ a: p, b: p });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing || !draft) return;
    setDraft({ a: draft.a, b: toPoint(e) });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing || !draft) return;
    const box = boxFromPoints(draft.a, toPoint(e));
    if (box) setBoxes((bs) => [...bs, box]);
    setDraft(null);
  };
  const addCenteredBox = () => setBoxes((bs) => [...bs, { x: 0.3, y: 0.45, w: 0.4, h: 0.1 }]);

  /* Send */
  const send = async () => {
    if (!doc || previewMode || !live) return;
    if (doc.kind === "pdf") {
      setError(SL.live.pdfRefuse);
      return;
    }
    setError(null);
    let payload: { imageBase64: string; mediaType: string; agentOrigin: string };
    try {
      const { base64, mediaType } = await compositeImage(doc.url, boxes);
      if (base64.length > MAX_PAYLOAD) {
        setError(SL.live.payloadTooLarge);
        return;
      }
      payload = { imageBase64: base64, mediaType, agentOrigin: "web" };
    } catch {
      setError(SL.live.compositeFailed);
      return;
    }
    setStage("reading");
    try {
      const res = await fetch("/api/second-look", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as SecondLookResponse;
      if (!json.ok) {
        setError(json.message);
        setStage("error");
        return;
      }
      setResult({ data: json.result, disclaimer: json.disclaimer });
      setStage("results");
    } catch {
      setError(SL.live.networkFailed);
      setStage("error");
    }
  };

  const stageIndex = stage === "consent" ? 0 : stage === "drop" ? 1 : stage === "redact" ? 2 : stage === "reading" || stage === "error" ? 3 : 4;
  const draftBox = draft ? boxFromPoints(draft.a, draft.b, 0) : null;

  return (
    <section className="sl-live" aria-labelledby="sl-live-heading">
      <p className="eyebrow">{L.eyebrow}</p>
      <h2 id="sl-live-heading" className="sl-scene__title" style={{ marginTop: 8 }}>
        {L.heading}
      </h2>
      <ol className="sl-live__steps" aria-label="Steps">
        {SL.live.steps.map((s, i) => (
          <li key={s} className={i === stageIndex ? "is-current" : i < stageIndex ? "is-done" : ""} aria-current={i === stageIndex ? "step" : undefined}>
            {String(i + 1).padStart(2, "0")} {s}
          </li>
        ))}
      </ol>

      <div className="card sl-live__panel">
        {/* ── consent ── */}
        {stage === "consent" ? (
          <div>
            <div className="sl-card-title">{L.consent.title}</div>
            <p className="mono-label">{AI_DISCLOSURE}</p>
            <ul className="sl-consent">
              {L.consent.items.map((it) => (
                <li key={it}>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
            <div className="sl-btn-row">
              <button type="button" className="sl-btn" onClick={() => setStage("drop")}>
                {L.consent.cta}
              </button>
            </div>
            <p className="mono-label sl-intake">{NOT_A_CREDIT_PULL}</p>
          </div>
        ) : null}

        {/* ── drop ── */}
        {stage === "drop" ? (
          <div>
            {live ? (
              <div
                className={`dashed-box sl-drop ${over ? "is-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFile(f);
                }}
              >
                <div className="sl-drop__title">{L.dropzone.title}</div>
                <p className="sl-drop__sub">{L.dropzone.sub}</p>
                <label className="sl-btn sl-btn--ghost">
                  {L.dropzone.button}
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : (
              <div className="dashed-box sl-drop is-disabled" aria-disabled="true">
                <div className="sl-drop__title">{L.dropzone.title}</div>
                <p className="sl-drop__sub">{L.comingSoon}</p>
                <button type="button" className="sl-btn sl-btn--ghost" onClick={startPreview}>
                  {SL.live.previewFlow}
                </button>
              </div>
            )}
            {error ? (
              <p className="sl-error" role="alert">
                {error}
              </p>
            ) : null}
            <p className="mono-label sl-intake">{NOT_A_CREDIT_PULL}</p>
          </div>
        ) : null}

        {/* ── redact ── */}
        {stage === "redact" && doc ? (
          <div>
            <div className="sl-card-title">{L.redaction.title}</div>
            <p className="sl-card-body">{L.redaction.sub}</p>
            {previewMode ? <p className="sl-note">{SL.live.previewNote}</p> : null}

            <div className="sl-file">
              <span>{doc.name}</span>
              {doc.kind === "pdf" && doc.pages !== null ? <span>{SL.live.pages(doc.pages)}</span> : null}
            </div>

            {doc.kind === "pdf" ? (
              <div className="dashed-box sl-pdf">{SL.live.pdfNote}</div>
            ) : (
              <div
                ref={previewRef}
                className={`sl-preview ${drawing ? "is-drawing" : ""}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDraft(null)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={doc.url} alt="Preview of the document you chose, with your redaction boxes drawn on top." draggable={false} />
                {boxes.map((b, i) => (
                  <div key={i} className="sl-box" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} aria-hidden="true" />
                ))}
                {draftBox ? (
                  <div className="sl-box sl-box--draft" style={{ left: `${draftBox.x * 100}%`, top: `${draftBox.y * 100}%`, width: `${draftBox.w * 100}%`, height: `${draftBox.h * 100}%` }} aria-hidden="true" />
                ) : null}
              </div>
            )}

            {/* Automatic text masking */}
            <div className="mono-label" style={{ marginTop: 16 }}>
              {SL.live.autoMasked}
            </div>
            {mask ? (
              mask.matches.length === 0 ? (
                <p className="sl-note">{SL.live.nothingFound}</p>
              ) : (
                <>
                  <ul className="sl-chips" aria-label={SL.live.autoMasked}>
                    {mask.matches.map((m, i) => (
                      <li key={`${m.kind}-${i}`} className="sl-chip">
                        <span className="sl-chip__kind">{kindLabel(m.kind)}</span>
                        <span className="sl-chip__mask">•••••</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mono-label" style={{ marginTop: 14 }}>
                    {SL.live.maskedPreview}
                  </div>
                  <pre className="sl-masked">{mask.masked}</pre>
                </>
              )
            ) : (
              <p className="sl-note">{doc.kind === "pdf" ? SL.live.pdfNote : SL.live.noTextLayer}</p>
            )}

            {/* Manual boxes */}
            {doc.kind !== "pdf" ? (
              <>
                <p className="sl-note">{SL.live.boxesHint}</p>
                <div className="sl-btn-row" style={{ marginTop: 10 }}>
                  <button type="button" className="sl-btn sl-btn--ghost" aria-pressed={drawing} onClick={() => setDrawing((d) => !d)}>
                    {drawing ? SL.live.drawing : L.redaction.addBox}
                  </button>
                  <button type="button" className="sl-btn sl-btn--ghost" onClick={addCenteredBox}>
                    {SL.live.addCenteredBox}
                  </button>
                  <button type="button" className="sl-btn sl-btn--ghost" onClick={() => setBoxes([])} disabled={boxes.length === 0}>
                    {L.redaction.clear}
                  </button>
                  <span className="mono-label" aria-live="polite">
                    {SL.live.boxCount(boxes.length)}
                  </span>
                </div>
              </>
            ) : null}

            {error ? (
              <p className="sl-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="sl-btn-row" style={{ marginTop: 20 }}>
              {previewMode || !live ? (
                <span className="sl-btn" aria-disabled="true">
                  {L.redaction.send}
                </span>
              ) : (
                <button type="button" className="sl-btn" onClick={() => void send()}>
                  {L.redaction.send}
                </button>
              )}
              <button type="button" className="sl-btn sl-btn--ghost" onClick={reset}>
                {SL.live.back}
              </button>
            </div>
            {previewMode || !live ? <p className="sl-note">{previewMode ? SL.live.previewSendNote : L.comingSoon}</p> : null}
            <p className="mono-label sl-intake">{NOT_A_CREDIT_PULL}</p>
          </div>
        ) : null}

        {/* ── reading ── */}
        {stage === "reading" ? (
          <div className="sl-reading" aria-live="polite">
            <Orb size="ambient" state="thinking" />
            <div className="sl-card-title">{L.reading}</div>
            <p className="mono-label">{AI_DISCLOSURE}</p>
            <p className="mono-label">{NOT_A_CREDIT_PULL}</p>
          </div>
        ) : null}

        {/* ── error ── */}
        {stage === "error" ? (
          <div>
            <div className="sl-card-title">{L.resultsTitle}</div>
            <p className="sl-error" role="alert">
              {error}
            </p>
            <div className="sl-btn-row" style={{ marginTop: 16 }}>
              <button type="button" className="sl-btn" onClick={() => setStage("redact")}>
                {SL.live.tryAgain}
              </button>
              <button type="button" className="sl-btn sl-btn--ghost" onClick={reset}>
                {SL.live.startOver}
              </button>
            </div>
            <p className="sl-note">{SECOND_LOOK_DISCLAIMER}</p>
            <p className="mono-label sl-intake">{NOT_A_CREDIT_PULL}</p>
          </div>
        ) : null}

        {/* ── results ── */}
        {stage === "results" && result ? (
          <div>
            <div className="sl-card-title" style={{ marginBottom: 14 }}>
              {L.resultsTitle}
            </div>
            <ResultsBento result={result.data} disclaimer={result.disclaimer} />
            <div className="sl-btn-row" style={{ marginTop: 16 }}>
              <button type="button" className="sl-btn sl-btn--ghost" onClick={reset}>
                {SL.live.startOver}
              </button>
            </div>
            <p className="mono-label sl-intake">{NOT_A_CREDIT_PULL}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
