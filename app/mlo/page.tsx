import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { mloContent } from "@/lib/content/mlo";
import { listTenants } from "@/lib/pricing/tenants";
import { ROLE_LABELS } from "@/lib/accounts/auth";
import { mloById } from "@/lib/config";
import { requireViewer } from "@/lib/mlo/page-auth";
import { MloNav } from "./MloChrome";
import "./mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Command Center", robots: { index: false, follow: false } };

/** /mlo — Command Center home (D1). Admins see the admin areas; everyone sees their account. */
export default async function CommandCenterHome() {
  const v = await requireViewer();
  const tenant = listTenants()[0];
  const mlo = v.user?.mloId ? mloById(v.user.mloId) : null;
  return (
    <PageShell>
      <div className="mlo-wrap">
        <p className="eyebrow">LoanM8 Command Center</p>
        <h1 className="tagline text-4xl">{v.user ? `Hi, ${v.user.name.split(" ")[0]}` : mloContent.title}</h1>
        <MloNav current="home" tenantId={tenant.id} admin={v.admin} signedIn={!!v.user} />
        <section className="mlo-section">
          <h2>Your account</h2>
          {v.user ? (
            <p className="mlo-note">
              {v.user.email} · <span className="mlo-pill">{ROLE_LABELS[v.user.role]}</span>
              {mlo ? ` · loan officer record: ${mlo.name}, NMLS #${mlo.nmls}` : ""}
            </p>
          ) : (
            <p className="mlo-note">
              You&apos;re on the shared admin login. <Link href="/sign-in">Sign in with your email</Link> to use your own account and manage the team.
            </p>
          )}
        </section>
        <section className="mlo-section">
          <h2>Coming next</h2>
          <p className="mlo-note">
            Contacts and CSV import (with consent tracking) are next, then texting through Twilio, the Today screen, ARIVE pipeline sync, and agent data from RETR exports.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
