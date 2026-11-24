import { CC_LOA_TILE, CC_PITCH, CC_POINTS, CC_TAGLINE, CC_TEAM_LINE, CC_TEAM_TITLE } from "@/lib/content/command-center";
import { AGENT_KEYS, AGENTS } from "@/lib/agents/team";
import ThemeToggle from "@/components/ThemeToggle";
import { Icon } from "./icons";
import Brand from "./Brand";
import AuthScrollTop from "./AuthScrollTop";
import type { IconName } from "./nav";
import { NOW_STEP, stepLabelClass } from "./auth-steps";
import "./cc-shell.css";
import "./mlo.css";

const POINTS: readonly { icon: IconName; text: string }[] = CC_POINTS;

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
      <AuthScrollTop />
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="cc-bar">
        <div className="cc-bar__in">
          <Brand href="/sign-in" label="MLO Command, powered by LoanM8: sign in" />
          <div className="cc-bar__end cc-auth__end"><ThemeToggle /></div>
        </div>
      </header>
      <main id="main" className="cc-auth__main">
        <div className={`cc-auth__grid ${wide ? "cc-auth__grid--wide" : ""}`}>
          <aside className="cc-auth__side" aria-label="About Command Center">
            <p className="cc-auth__eyebrow">For licensed loan officers</p>
            <p className="cc-auth__pitch">{CC_TAGLINE}</p>
            <p className="cc-auth__sub">{CC_PITCH}</p>
            <div className="cc-auth__team">
              <p className="cc-auth__team-title"><Icon name="spark" size={20} /> {CC_TEAM_TITLE}</p>
              <p className="cc-auth__team-line">{CC_TEAM_LINE}</p>
              <ul className="cc-auth__agents" aria-label="Your Concierge team">
                {AGENT_KEYS.map((k) =>
                  k === "loa" ? (
                    <li key={k} className="cc-auth__loa">
                      <div>
                        <span className="cc-auth__new">{CC_LOA_TILE.badge}</span>
                        <strong>{AGENTS.loa.name}</strong>
                        <span>{CC_LOA_TILE.line}</span>
                      </div>
                      <div aria-hidden="true">
                        <div className="cc-auth__steps">{CC_LOA_TILE.steps.map((x, i) => <i key={x} className={i < NOW_STEP ? "on" : i === NOW_STEP ? "now" : ""} />)}</div>
                        <div className="cc-auth__steplabels">{CC_LOA_TILE.steps.map((x, i) => <b key={x} className={stepLabelClass(i, CC_LOA_TILE.steps.length)}>{x}</b>)}</div>
                      </div>
                    </li>
                  ) : (
                    <li key={k}><strong>{AGENTS[k].name}</strong><span>{AGENTS[k].role}</span></li>
                  ),
                )}
              </ul>
            </div>
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
        <span>MLO Command Center · for licensed loan officers</span>
        <span className="cc-auth__links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></span>
      </footer>
    </div>
  );
}
