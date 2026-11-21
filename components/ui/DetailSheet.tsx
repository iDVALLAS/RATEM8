"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * DetailSheet — a "Detail" button that opens a panel (v24): a bottom
 * sheet on phones, a centred dialog from lg up. Esc, the backdrop or ×
 * closes it; focus moves in and returns to the button. The content is
 * passed in already rendered (server side), so nothing sensitive or
 * lender-named is bundled here.
 */
export default function DetailSheet({
  label,
  title,
  closeLabel = "Close",
  buttonClassName = "lo-btn-secondary text-[10px]",
  className,
  buttonContent,
  children,
}: {
  label: string;
  /** D77: what the button shows, when it's more than the label (an icon and the label). */
  buttonContent?: React.ReactNode;
  title: string;
  closeLabel?: string;
  buttonClassName?: string;
  /** Extra class on the sheet (D74: "cc-dsheet" gives it Command Center's palette). */
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const trigger = btn.current;
    panel.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" className={buttonClassName} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        {buttonContent ?? label}
      </button>
      {open
        ? createPortal(
            <div className={className ? `detail-sheet ${className}` : "detail-sheet"} role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
              <div className="detail-sheet__backdrop" onClick={() => setOpen(false)} />
              <div className="detail-sheet__panel" ref={panel} tabIndex={-1}>
                <span aria-hidden="true" className="detail-sheet__grip" />
                <div className="detail-sheet__head">
                  <h2 id={`${id}-t`} className="detail-sheet__title">
                    {title}
                  </h2>
                  <button type="button" className="detail-sheet__x" aria-label={closeLabel} onClick={() => setOpen(false)}>
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <div className="detail-sheet__body">{children}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
