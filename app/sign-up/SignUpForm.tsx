"use client";

import { useState, useTransition } from "react";
import { signUpAction } from "./actions";

type State = { code: string; name: string };

/** D45: the loan officer sign-up form. Every state and DC can be picked. */
export default function SignUpForm({ states, invite = null }: { states: State[]; invite?: { token: string; name: string; email: string } | null }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ ok: boolean; error?: string; invited?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (code: string) => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code].sort()));

  if (result?.ok && result.invited) {
    return (
      <div className="mlo-flash mlo-flash--ok" role="status">
        <strong>Thanks, you&apos;re in the queue.</strong> A person checks your NMLS record next, and you&apos;ll get an email with your sign-in link when your account is ready.
      </div>
    );
  }
  if (result?.ok) {
    return (
      <div className="mlo-flash mlo-flash--ok" role="status">
        <strong>Check your email.</strong> We sent a link to confirm it. After that, a person checks your NMLS record, and you&apos;ll get an email with your sign-in link when your account is ready.
      </div>
    );
  }
  return (
    <form
      className="su-form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => setResult(await signUpAction(fd)));
      }}
    >
      <fieldset className="mlo-section su-set">
        <legend>You</legend>
        {invite ? <input type="hidden" name="invite" value={invite.token} /> : null}
        <label className="mlo-field"><span>Full name, as on your NMLS record</span><input name="name" required maxLength={80} autoComplete="name" className="mlo-input" defaultValue={invite?.name ?? ""} /></label>
        <label className="mlo-field"><span>Work email (you&apos;ll sign in with it){invite ? " (from your invite)" : ""}</span><input name="email" type="email" required maxLength={254} autoComplete="email" className="mlo-input" defaultValue={invite?.email ?? ""} readOnly={!!invite} /></label>
        <label className="mlo-field"><span>Phone (optional)</span><input name="phone" type="tel" maxLength={30} autoComplete="tel" inputMode="tel" className="mlo-input" /></label>
        <label className="mlo-field"><span>Your NMLS ID</span><input name="nmls" required inputMode="numeric" pattern="\d{1,10}" maxLength={10} className="mlo-input" /></label>
      </fieldset>

      <fieldset className="mlo-section su-set">
        <legend>Your sponsoring company</legend>
        <label className="mlo-field"><span>Company name</span><input name="sponsorName" required maxLength={120} autoComplete="organization" className="mlo-input" /></label>
        <label className="mlo-field"><span>Company NMLS ID</span><input name="sponsorNmls" required inputMode="numeric" pattern="\d{1,10}" maxLength={10} className="mlo-input" /></label>
        <label className="mlo-field"><span>Company mailing address (it goes in your email footer)</span><input name="sponsorAddress" required maxLength={200} autoComplete="street-address" className="mlo-input" /></label>
      </fieldset>

      <fieldset className="mlo-section su-set">
        <legend>Where you&apos;re licensed</legend>
        <p className="mlo-note">Pick every state. Command Center only lets you market to clients in these states.</p>
        <div className="su-states">
          {states.map((s) => (
            <label key={s.code} className={`su-state ${picked.includes(s.code) ? "is-on" : ""}`} title={s.name}>
              <input type="checkbox" name={`st_${s.code}`} checked={picked.includes(s.code)} onChange={() => toggle(s.code)} />
              <span>{s.code}</span>
            </label>
          ))}
        </div>
        {picked.length ? (
          <div className="su-lics">
            <p className="mlo-note">License number for each state. Leave it blank where the state uses your NMLS ID.</p>
            {picked.map((c) => (
              <label key={c} className="mlo-field su-lic"><span>{states.find((s) => s.code === c)?.name}</span><input name={`lic_${c}`} maxLength={40} className="mlo-input" /></label>
            ))}
          </div>
        ) : null}
      </fieldset>

      <fieldset className="mlo-section su-set">
        <legend>Your links (optional, you can add them later)</legend>
        <label className="mlo-field"><span>Booking link (https://)</span><input name="calendly" type="url" maxLength={300} placeholder="https://" className="mlo-input" /></label>
        <label className="mlo-field"><span>Secure application or document upload link (https://)</span><input name="applicationUrl" type="url" maxLength={300} placeholder="https://" className="mlo-input" /></label>
        <label className="mlo-field"><span>Who told you about LoanM8? (optional)</span><input name="heardFrom" maxLength={120} className="mlo-input" /></label>
      </fieldset>

      <fieldset className="mlo-section su-set">
        <legend>Two questions</legend>
        <p className="mlo-note">Does your sponsoring company allow you to keep your client contacts in an outside system like this one?</p>
        <div className="su-radios">
          <label><input type="radio" name="sponsorAllows" value="yes" required /> Yes</label>
          <label><input type="radio" name="sponsorAllows" value="no" /> No, or I&apos;m not sure</label>
        </div>
        <label className="su-check"><input type="checkbox" name="attest" required /> <span>These details are accurate, and I hold the licenses I listed, sponsored by the company above.</span></label>
      </fieldset>

      <div aria-hidden="true" className="su-hp"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {result && !result.ok ? <p className="mlo-flash mlo-flash--err" role="alert">{result.error}</p> : null}
      <button type="submit" className="mlo-btn" disabled={pending}>{pending ? "Sending…" : "Sign up"}</button>
      <p className="mlo-note" style={{ marginTop: 10 }}>A person checks your NMLS record before your account opens.</p>
    </form>
  );
}
