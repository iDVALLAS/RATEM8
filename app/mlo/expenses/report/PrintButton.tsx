"use client";

/** D37: prints the report (the print stylesheet hides the site chrome). */
export default function PrintButton() {
  return <button type="button" className="mlo-btn" onClick={() => window.print()}>Print or save as PDF</button>;
}
