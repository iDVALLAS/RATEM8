"use client";

import { useState } from "react";
import { contactsImportCopy as ic } from "@/lib/content/contacts-import";
import { skippedRowsAction } from "../../actions";
import { downloadText } from "../ReviewStep";

/** D75: one past import's skipped rows (fetched when tapped; checked with the import's book on the server). */
export default function SkippedDownload({ id, day }: { id: string; day: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="cc-linkbtn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await skippedRowsAction(id).catch(() => null);
        setBusy(false);
        if (r?.ok) downloadText(r.csv, `loanm8-skipped-rows-${day}.csv`);
      }}
    >
      {ic.history.download}
    </button>
  );
}
