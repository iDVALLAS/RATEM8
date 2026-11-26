"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import { permissionLinks } from "@/lib/contacts/import-steps";

/**
 * D93: asked as soon as an import finishes: "Did these contacts agree to be
 * contacted?". It explains that texts and calls need each person's
 * permission and offers the existing Record permission page for this import,
 * Contacts filtered to this import and "Needs permission", or Not now.
 * Nobody is ever marked as agreeing from here: each way leads to the loan
 * officer's own step, with the attestation wording those pages already use.
 */
export default function PermissionDialog({ importId, returnFocus }: { importId: string; returnFocus: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const links = permissionLinks(importId);
  const d = ic.done.dialog;
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open && typeof el.showModal === "function") el.showModal();
  }, []);
  const close = () => {
    ref.current?.close();
    document.getElementById(returnFocus)?.focus();
  };
  return (
    <dialog ref={ref} className="cc-report im-perm" aria-labelledby="im-perm-title" aria-describedby="im-perm-body" onClose={() => document.getElementById(returnFocus)?.focus()} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="cc-report__panel">
        <div className="cc-report__head">
          <h2 id="im-perm-title">{d.title}</h2>
          <button type="button" className="cc-sheet__close" onClick={close} aria-label={d.close}>×</button>
        </div>
        <p id="im-perm-body" className="im-perm__body">{d.body}</p>
        <ul className="im-perm__opts">
          <li>
            <Link href={links.record} className="cc-card im-next__tile im-perm__opt">
              <strong>{d.record}</strong>
              <span className="mlo-note">{d.recordNote}</span>
            </Link>
          </li>
          <li>
            <Link href={links.oneByOne} className="cc-card im-next__tile im-perm__opt">
              <strong>{d.oneByOne}</strong>
              <span className="mlo-note">{d.oneByOneNote}</span>
            </Link>
          </li>
        </ul>
        <p className="mlo-note">{d.bar}</p>
        <div className="mlo-actions">
          <button type="button" className="mlo-btn mlo-btn--ghost" onClick={close} autoFocus>{d.later}</button>
        </div>
      </div>
    </dialog>
  );
}
