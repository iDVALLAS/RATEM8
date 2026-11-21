import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { listTenants } from "@/lib/pricing/tenants";
import { requireAdminPage } from "@/lib/mlo/page-auth";
import { envStatus, LAUNCH, PHASES } from "@/lib/setup/launch";
import { MloNav } from "../MloChrome";
import "../mlo.css";
import PageHead from "@/app/mlo/PageHead";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Launch checklist", robots: { index: false, follow: false } };

/** /mlo/launch — every outside account and Vercel setting, in order, with what's already set (D32). Admins only. */
export default async function Launch() {
  const v = await requireAdminPage();
  const tenant = listTenants()[0];
  const vars = LAUNCH.flatMap((s) => s.env ?? []).filter((e) => !e.optional);
  const set = vars.filter((e) => envStatus(e.name)).length;
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="launch" title="Launch checklist" />
        <MloNav current="setup" tenantId={tenant.id} admin={v.admin} signedIn={!!v.user} />
        <section className="mlo-section">
          <h2>{set} of {vars.length} required settings are in Vercel</h2>
          <p className="mlo-note">In order, top to bottom. Add each variable in Vercel → your project → Settings → Environment Variables (Production and Preview), then redeploy. “Sensitive” means mark it Sensitive in Vercel so its value can never be read back. This page only knows whether a variable is set, never its value. Your own day-to-day setup is on the <Link href="/mlo#setup">Command Center home</Link>; the texting wording is on <Link href="/mlo/texting">Texting setup</Link>.</p>
        </section>
        {PHASES.map((p, i) => (
          <section key={p} className="mlo-section">
            <h2>{i + 1}. {p}</h2>
            <ol className="cc-today">
              {LAUNCH.filter((s) => s.phase === i + 1).map((s) => (
                <li key={s.title} className="cc-card">
                  <p className="cc-card__title">{s.title}</p>
                  <p className="mlo-note">{s.detail}{s.outside ? ` (${s.outside})` : ""}</p>
                  {s.env?.length ? (
                    <div className="mlo-scroll">
                      <table className="mlo-table mlo-table--plain mlo-table--stack" style={{ marginTop: 6 }}>
                        <tbody>
                          {s.env.map((e) => (
                            <tr key={e.name}>
                              <th scope="row"><code>{e.name}</code>{e.optional ? <span className="mlo-note"> (optional)</span> : null}<br /><span className="mlo-note">{e.note}</span></th>
                              <td className="mlo-note">{e.sensitive ? "Sensitive" : "Not sensitive"}</td>
                              <td><span className={`mlo-pill ${envStatus(e.name) ? "" : "mlo-pill--off"}`}>{envStatus(e.name) ? "Set" : "Not set"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
