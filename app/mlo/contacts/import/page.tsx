import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { MloNav } from "../../MloChrome";
import ImportWizard from "./ImportWizard";
import "../../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import", robots: { index: false, follow: false } };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">Import</h1>
        <MloNav current="contacts" tenantId={tenant.id} admin={v.admin} signedIn={!!v.user} />
        {v.user ? (
          <ImportWizard initialKind={kind === "agents" ? "agents" : "contacts"} />
        ) : (
          <section className="mlo-section">
            <p className="mlo-note">Contacts belong to a person, so importing needs your own account. <Link href="/sign-in">Sign in with your email</Link>.</p>
          </section>
        )}
      </div>
    </PageShell>
  );
}
