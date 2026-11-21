import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/mlo/page-auth";
import PageShell from "@/app/mlo/CcShell";
import { mloContent } from "@/lib/content/mlo";
import { extraLoanSifterOrigins } from "@/lib/pricing/loansifterOrigin";
import { importCaptureAction } from "../../actions";
import ReceiveClient from "./ReceiveClient";
import "../../mlo.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Receiving from LoanSifter", robots: { index: false, follow: false } };

/**
 * /mlo/pricing/receive — opened by the Send to LoanM8 button (C11). Behind
 * the same admin login as the rest of /mlo. It accepts captures only from
 * LoanSifter pages and publishes each one with importLoanSifter. No menu
 * links (C11.3): clicking away from this tab mid-run lost the captures.
 */
export default async function ReceivePage() {
  await requireAdminPage();
  const c = mloContent.receive;
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="pricing" title={c.heading} />
        <ReceiveClient extraOrigins={extraLoanSifterOrigins(process.env.LOANSIFTER_ORIGINS)} importCapture={importCaptureAction} />
      </div>
    </PageShell>
  );
}
