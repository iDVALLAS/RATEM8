import { REMEMBER_COPY } from "@/lib/content/sign-in";
import { REMEMBER_FIELD } from "./fields";

export { REMEMBER_COPY };

/** D89: "Remember this device for 30 days" (D94: was "computer"), unticked unless the person ticked it a step earlier. */
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
