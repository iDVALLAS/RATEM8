import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireViewer } from "@/lib/mlo/page-auth";
import { MloNav } from "../../MloChrome";
import ImportWizard from "./ImportWizard";
import { contactStore } from "@/lib/contacts/store";
import { tagBook } from "@/lib/contacts/tagging";
import "../../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import", robots: { index: false, follow: false } };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const v = await requireViewer();
  const tenant = listTenants()[0];
  // D73: the book's tags, for type-ahead (an assistant imports into the officer's book).
  const book = v.user ? tagBook(v.user) : null;
  const knownTags = book ? (await contactStore().tagCounts(book).catch(() => [])).map((t) => t.tag) : [];
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">MLO Command Center</p>
        <h1 className="tagline text-4xl">Import</h1>
        <MloNav current="contacts" tenantId={tenant.id} admin={v.admin} signedIn={!!v.user} />
        {v.user ? (
          <ImportWizard initialKind={kind === "agents" ? "agents" : "contacts"} knownTags={knownTags} />
        ) : (
          <section className="mlo-section">
            <p className="mlo-note">Contacts belong to a person, so importing needs your own account. <Link href="/sign-in">Sign in with your email</Link>.</p>
          </section>
        )}
      </div>
    </PageShell>
  );
}
