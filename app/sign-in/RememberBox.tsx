import { REMEMBER_FIELD } from "./land";

/** D89: the words, in one place for the three forms that can finish signing in. */
export const REMEMBER_COPY = {
  label: "Remember this computer for 30 days",
  note: "Leave it unticked on a shared or public computer. Unticked, you stay signed in for 12 hours.",
  noteMfa: "Ticked, this computer also skips this phone-code step for 30 days. Leave it unticked on a shared or public computer.",
};

/** D89: "Remember this computer for 30 days", unticked unless the person ticked it a step earlier. */
export default function RememberBox({ checked = false, mfa = false }: { checked?: boolean; mfa?: boolean }) {
  return (
    <div className="cc-auth__remember">
      <label className="mlo-check">
        <input type="checkbox" name={REMEMBER_FIELD} defaultChecked={checked} aria-describedby="remember-note" />
        <span>{REMEMBER_COPY.label}</span>
      </label>
      <p className="mlo-note" id="remember-note">{mfa ? REMEMBER_COPY.noteMfa : REMEMBER_COPY.note}</p>
    </div>
  );
}
