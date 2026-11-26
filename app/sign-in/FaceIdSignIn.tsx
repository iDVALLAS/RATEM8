"use client";

import { useEffect, useRef, useState } from "react";
import { FACE_ID } from "@/lib/content/face-id";
import { REMEMBER_COPY } from "@/lib/content/sign-in";
import FaceIcon from "./FaceIcon";
import { autofillAvailable, faceIdAvailable, signInWithFaceId } from "./faceid-client";

/**
 * D94: "Sign in with Face ID" atop /sign-in, where the device can. No email needed: the device offers its own passkey.
 * Where the browser supports it, the email box also suggests the passkey (conditional UI). A cancel or a refusal says so
 * calmly; the email way below always stays.
 */
export default function FaceIdSignIn() {
  const [can, setCan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const remember = useRef(false);
  const go = (to = "/mlo") => window.location.assign(to);

  useEffect(() => {
    let live = true;
    void (async () => {
      const ok = await faceIdAvailable();
      if (!live) return;
      setCan(ok);
      // The bonus: the email box's suggestions offer the passkey too. Quiet unless it signs in or is refused.
      if (!ok || !(await autofillAvailable()) || !live) return;
      const r = await signInWithFaceId(() => remember.current, true);
      if (!live) return;
      if (r.ok) go(r.next);
      else if (!r.aborted && !r.quiet && r.error) setMsg(r.error);
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!can) return null;
  const tap = async () => {
    setBusy(true);
    setMsg(null);
    const r = await signInWithFaceId(() => remember.current);
    if (r.ok) return go(r.next);
    setBusy(false);
    setMsg(r.error);
  };
  return (
    <div className="cc-faceid">
      <button type="button" className="mlo-btn cc-faceid__btn" onClick={tap} disabled={busy} aria-describedby="faceid-signin-note">
        <FaceIcon /> {busy ? FACE_ID.signInBusy : FACE_ID.signInButton}
      </button>
      <p className="mlo-note" id="faceid-signin-note">{FACE_ID.signInNote}</p>
      <div className="cc-auth__remember">
        <label className="mlo-check">
          <input type="checkbox" onChange={(e) => (remember.current = e.currentTarget.checked)} aria-describedby="faceid-remember-note" />
          <span>{REMEMBER_COPY.label}</span>
        </label>
        <p className="mlo-note" id="faceid-remember-note">{REMEMBER_COPY.note}</p>
      </div>
      {msg ? <div className="mlo-flash mlo-flash--err" role="alert">{msg}</div> : null}
      <p className="cc-faceid__or"><span>{FACE_ID.or}</span></p>
    </div>
  );
}
