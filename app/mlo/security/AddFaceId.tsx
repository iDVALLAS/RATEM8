"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FACE_ID, FACE_ID_ERRORS } from "@/lib/content/face-id";
import { addFaceId, faceIdAvailable } from "@/app/sign-in/faceid-client";
import FaceIcon from "@/app/sign-in/FaceIcon";

/** D94: "Add this device" on Sign-in security, only where the device has Face ID, a fingerprint reader or Windows Hello. */
export default function AddFaceId() {
  const router = useRouter();
  const [can, setCan] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let live = true;
    void faceIdAvailable().then((ok) => live && setCan(ok));
    return () => {
      live = false;
    };
  }, []);
  if (can === null) return null;
  if (!can) return <p className="mlo-note" style={{ marginTop: 10 }}>{FACE_ID.unsupported}</p>;
  const add = async () => {
    setBusy(true);
    setMsg(null);
    const r = await addFaceId();
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: FACE_ID.added });
      router.refresh();
    } else setMsg({ ok: false, text: r.error === FACE_ID_ERRORS.cancelled ? FACE_ID.addCancelled : r.error });
  };
  return (
    <>
      {msg ? <div className={`mlo-flash ${msg.ok ? "mlo-flash--ok" : "mlo-flash--err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</div> : null}
      <div className="mlo-actions">
        <button type="button" className="mlo-btn cc-faceid__btn" onClick={add} disabled={busy}>
          <FaceIcon /> {busy ? FACE_ID.addBusy : FACE_ID.add}
        </button>
      </div>
    </>
  );
}
