"use client";

import { useEffect, useRef, useState } from "react";
import { FACE_ID, FACE_ID_ERRORS } from "@/lib/content/face-id";
import FaceIcon from "./FaceIcon";
import { addFaceId } from "./faceid-client";

/**
 * D94: right after a sign-in with the Face ID box ticked. Asks the device once on arrival; where the browser wants a tap
 * first (it ends at once, before any prompt), it just shows the button. A cancel saves nothing; they're signed in either way.
 */
export default function FaceIdSetup({ next }: { next: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "skipped">("busy");
  const [msg, setMsg] = useState<string | null>(null);
  const tried = useRef(false);

  const run = async (auto: boolean) => {
    setState("busy");
    setMsg(null);
    const r = await addFaceId();
    if (r.ok) {
      setState("done");
      window.setTimeout(() => window.location.assign(next), 1200);
      return;
    }
    if (auto && "quiet" in r && r.quiet) return setState("idle");
    setState("skipped");
    setMsg(r.error === FACE_ID_ERRORS.cancelled ? null : r.error);
  };

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    void run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "done") {
    return (
      <div className="mlo-section">
        <div className="mlo-flash mlo-flash--ok" role="status">{FACE_ID.setupDone}</div>
        <div className="mlo-actions"><a className="mlo-btn" href={next}>{FACE_ID.continue}</a></div>
      </div>
    );
  }
  return (
    <div className="mlo-section">
      {state === "skipped" ? (
        <div className="mlo-flash" role="status">
          {FACE_ID.setupSkipped}
          {msg ? <> {msg}</> : null}
        </div>
      ) : null}
      <div className="mlo-actions">
        <button type="button" className="mlo-btn cc-faceid__btn" onClick={() => void run(false)} disabled={state === "busy"}>
          <FaceIcon /> {state === "busy" ? FACE_ID.setupBusy : FACE_ID.setupButton}
        </button>
        <a className="mlo-btn mlo-btn--ghost" href={next}>{state === "skipped" ? FACE_ID.continue : FACE_ID.skip}</a>
      </div>
    </div>
  );
}
