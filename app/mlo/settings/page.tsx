import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/app/mlo/CcShell";
import { requireViewer } from "@/lib/mlo/page-auth";
import { decodeFlash } from "@/lib/mlo/flash";
import { formatPhone } from "@/lib/contacts/normalize";
import { LEAD_ALERTS, prefsFor } from "@/lib/profile/prefs";
import { hoursLine } from "@/lib/leads/alert";
import { hourLabel, TIME_ZONES } from "@/lib/inbox/state";
import { settingsCopy as sc } from "@/lib/content/inbox";
import PageHead from "../PageHead";
import { FlashBox } from "../MloChrome";
import { saveSettingsAction } from "./actions";
import "../mlo.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your settings", robots: { index: false, follow: false } };

const FROM = Array.from({ length: 24 }, (_, h) => h);
const TO = Array.from({ length: 24 }, (_, h) => h + 1);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** /mlo/settings — your time zone and new-lead alerts (D79). */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const v = await requireViewer();
  const me = v.user;
  if (!me) {
    return (
      <PageShell>
        <div className="mlo-wrap">
          <PageHead k="mysettings" title={sc.title} />
          <p className="mlo-note"><Link href="/sign-in">{sc.signIn}</Link></p>
        </div>
      </PageShell>
    );
  }
  const p = await prefsFor(me);
  return (
    <PageShell>
      <div className="mlo-wrap">
        <PageHead k="mysettings" title={sc.title} sub={sc.sub} />
        <FlashBox flash={decodeFlash(f)} />
        <form action={saveSettingsAction} className="cc-settings">
          <section className="mlo-section mlo-grid">
            <label className="mlo-field">
              <span>{sc.zone.label}</span>
              <select name="timeZone" defaultValue={p.timeZone}>
                {TIME_ZONES.map(([z, label]) => <option key={z} value={z}>{label}</option>)}
              </select>
              <span className="mlo-note">{sc.zone.note}</span>
            </label>
          </section>
          <section className="mlo-section mlo-grid" id="alerts">
            <h2>{sc.alert.heading}</h2>
            <p className="mlo-note">{sc.alert.note}</p>
            <fieldset className="cc-radios">
              <legend>{sc.alert.label}</legend>
              {LEAD_ALERTS.map((k) => (
                <label key={k} className="mlo-check">
                  <input type="radio" name="leadAlert" value={k} defaultChecked={p.leadAlert === k} /> {sc.alert.options[k]}
                </label>
              ))}
            </fieldset>
            <label className="mlo-field">
              <span>{sc.alert.phone}</span>
              <input name="alertPhone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={formatPhone(p.alertPhone)} maxLength={20} />
              <span className="mlo-note">{sc.alert.phoneNote}</span>
            </label>
            <fieldset className="cc-radios">
              <legend>{sc.alert.hours}</legend>
              <div className="mlo-row-form cc-settings__hours">
                <label className="mlo-field">
                  <span>{sc.alert.from}</span>
                  <select name="alertFrom" defaultValue={String(p.alertFrom)}>
                    {FROM.map((h) => <option key={h} value={h}>{cap(hourLabel(h))}</option>)}
                  </select>
                </label>
                <label className="mlo-field">
                  <span>{sc.alert.to}</span>
                  <select name="alertTo" defaultValue={String(p.alertTo)}>
                    {TO.map((h) => <option key={h} value={h}>{cap(hourLabel(h))}</option>)}
                  </select>
                </label>
              </div>
              <p className="mlo-note">{hoursLine(p)}</p>
            </fieldset>
          </section>
          <div className="mlo-actions">
            <button type="submit" className="mlo-btn">{sc.save}</button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
