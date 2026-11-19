import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { Icon } from "./icons";
import type { IconName } from "./nav";
import "./cc-shell.css";
import "./mlo.css";

const POINTS: { icon: IconName; text: string }[] = [
  { icon: "spark", text: "A Concierge that drafts check-ins in your voice. You approve every one." },
  { icon: "shield", text: "Contact rules for all 50 states and DC, checked before anything goes out." },
  { icon: "pipeline", text: "Every loan's journey and deadlines, synced from your loan system." },
  { icon: "receipt", text: "Expenses and mileage, kept for your CPA." },
];

/**
 * D46: the frame for signing in and signing up (/sign-in, /sign-in/code,
 * /sign-up, /sign-up/confirm). Command Center's own bar, palette and theme
 * toggle, with no menus (nobody is signed in yet) and no public-site
 * footer: these pages are for loan officers, not borrowers. On desktop a
 * short panel beside the form says what Command Center is.
 */
export default function CcAuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="cc-app cc-auth">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="cc-bar">
        <div className="cc-bar__in">
          <Link href="/sign-in" className="cc-brand" aria-label="Command Center sign in">
            <span className="cc-brand__orb" aria-hidden="true" />
            <span className="cc-brand__text"><span className="cc-brand__small">Loan<span className="cc-m8">M8</span></span><span className="cc-brand__big">Command Center</span></span>
          </Link>
          <div className="cc-bar__end cc-auth__end"><ThemeToggle /></div>
        </div>
      </header>
      <main id="main" className="cc-auth__main">
        <div className={`cc-auth__grid ${wide ? "cc-auth__grid--wide" : ""}`}>
          <aside className="cc-auth__side" aria-label="About Command Center">
            <p className="cc-auth__eyebrow">For licensed loan officers</p>
            <p className="cc-auth__pitch">Your book, your day and your business, in one place.</p>
            <ul className="cc-auth__points">
              {POINTS.map((p) => (
                <li key={p.icon}><span className="cc-auth__icon"><Icon name={p.icon} size={20} /></span><span>{p.text}</span></li>
              ))}
            </ul>
            <p className="cc-auth__fine"><Icon name="lock" size={16} /> No password: you sign in with a code we email you, plus a code from your phone if your team requires it.</p>
          </aside>
          <section className="cc-auth__card">{children}</section>
        </div>
      </main>
      <footer className="cc-foot">
        <span>LoanM8 Command Center · for licensed loan officers</span>
        <span className="cc-auth__links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></span>
      </footer>
    </div>
  );
}
