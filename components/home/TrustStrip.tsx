import { copy } from "@/lib/copy";
import { homeContent } from "@/lib/content/home";

/**
 * TrustStrip — Soft pull only · One loan officer · Never shared · Free
 * to use. 2×2 on mobile, one row on desktop. Line icons are inline,
 * currentColor, 20px, stroke 1.6, aria-hidden.
 */
type IconName = (typeof copy.trust.items)[number]["icon"];

function TrustIcon({ name }: { name: IconName }) {
  const common = {
    className: "hm-trust__icon",
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  switch (name) {
    case "soft-pull":
      // fingerprint-ish arcs with a slash: no hard inquiry
      return (
        <svg {...common}>
          <path d="M6.5 8.5a6 6 0 0 1 11 0" />
          <path d="M8.8 11a3.5 3.5 0 0 1 6.4 0" />
          <path d="M12 12v6" />
          <path d="M5 16.5c.6 1.6 1.6 2.9 2.8 3.9" />
          <path d="M19 16.5c-.6 1.6-1.6 2.9-2.8 3.9" />
          <path d="M4 20 20 4" />
        </svg>
      );
    case "one-lo":
      // a single person outline
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
        </svg>
      );
    case "never-shared":
      // a lock
      return (
        <svg {...common}>
          <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
          <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
          <path d="M12 14.5v2.5" />
        </svg>
      );
    case "free":
      // a circle with a dollar sign, struck through: no fee to borrowers
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.2v9.6" />
          <path d="M14.4 9.4c-.4-.9-1.3-1.3-2.4-1.3-1.4 0-2.4.7-2.4 1.8 0 2.4 4.8 1.2 4.8 3.7 0 1.2-1.1 1.9-2.4 1.9-1.3 0-2.2-.6-2.5-1.5" />
          <path d="M6 18 18 6" />
        </svg>
      );
    default:
      return null;
  }
}

export default function TrustStrip() {
  return (
    <ul className="hm-trust" aria-label={homeContent.hero.trustLabel}>
      {copy.trust.items.map((item) => (
        <li key={item.icon} className="hm-trust__item">
          <TrustIcon name={item.icon} />
          <div>
            <div className="hm-trust__label">{item.label}</div>
            <div className="hm-trust__sub">{item.sub}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
