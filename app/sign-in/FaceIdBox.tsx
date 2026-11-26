"use client";

import { useEffect, useState } from "react";
import { FACE_ID } from "@/lib/content/face-id";
import { FACEID_FIELD } from "./fields";
import { faceIdAvailable } from "./faceid-client";

/**
 * D94: "Use Face ID to sign in on this device", beside Remember on each form that can finish signing in. Off unless the
 * person ticked it a step earlier. Shown only where the device has Face ID, a fingerprint reader or Windows Hello.
 */
export default function FaceIdBox({ checked = false }: { checked?: boolean }) {
  const [can, setCan] = useState(false);
  useEffect(() => {
    let live = true;
    void faceIdAvailable().then((ok) => live && setCan(ok));
    return () => {
      live = false;
    };
  }, []);
  if (!can) return null;
  return (
    <div className="cc-auth__remember cc-auth__faceid-box">
      <label className="mlo-check">
        <input type="checkbox" name={FACEID_FIELD} defaultChecked={checked} aria-describedby="faceid-note" />
        <span>{FACE_ID.toggle}</span>
      </label>
      <p className="mlo-note" id="faceid-note">{FACE_ID.toggleNote}</p>
    </div>
  );
}
