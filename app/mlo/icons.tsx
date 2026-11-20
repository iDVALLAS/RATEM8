import type { IconName } from "./nav";

/** D43: Command Center's line icons. 24px grid, 1.6 stroke, currentColor; decorative (aria-hidden). */
const P: Record<IconName, React.ReactNode> = {
  home: <><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>,
  spark: <><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.9L12 18.5l-1.8-5.8-5.7-1.9L10.2 9z" /><path d="M18.5 3.5v3M17 5h3" /></>,
  inbox: <><path d="M4 13.5 6.5 5h11l2.5 8.5V19H4z" /><path d="M4 13.5h4.5l1.2 2.2h4.6l1.2-2.2H20" /></>,
  phone: <path d="M7.2 4h2.6l1.4 4-1.9 1.3a10.5 10.5 0 0 0 5.4 5.4l1.3-1.9 4 1.4v2.6a2 2 0 0 1-2.2 2C10.6 18.3 5.7 13.4 5.2 6.2A2 2 0 0 1 7.2 4z" />,
  users: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5" /><circle cx="16.8" cy="8.2" r="2.6" /><path d="M15.6 13.9c2.4.2 4.2 1.8 4.7 4.6" /></>,
  upload: <><path d="M12 15V4.5M7.8 8.7 12 4.5l4.2 4.2" /><path d="M4.5 14.5V19h15v-4.5" /></>,
  cards: <><rect x="4" y="7" width="12" height="13" rx="2" /><path d="M8 4h10a2 2 0 0 1 2 2v11" /><path d="M7 11.5h6M7 15h4" /></>,
  script: <><path d="M6 3.5h9l3.5 3.5v13.5H6z" /><path d="M15 3.5V7h3.5" /><path d="M9 11h6.5M9 14.5h6.5M9 18h4" /></>,
  pipeline: <><rect x="3.5" y="5" width="5" height="14" rx="1.5" /><rect x="9.5" y="5" width="5" height="9" rx="1.5" /><rect x="15.5" y="5" width="5" height="11.5" rx="1.5" /></>,
  bolt: <path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12z" />,
  trend: <><path d="M4 18.5 9.5 13l3.5 3.5L20 9" /><path d="M15 9h5v5" /></>,
  cap: <><path d="M2.5 9.5 12 5l9.5 4.5L12 14z" /><path d="M6.5 11.5v4.3c1.4 1.5 3.3 2.2 5.5 2.2s4.1-.7 5.5-2.2v-4.3" /><path d="M21.5 9.5v5" /></>,
  network: <><circle cx="12" cy="5.5" r="2.2" /><circle cx="5.5" cy="17.5" r="2.2" /><circle cx="18.5" cy="17.5" r="2.2" /><circle cx="12" cy="13" r="2" /><path d="M12 7.7V11M10.4 14.3 7.2 16.2M13.6 14.3l3.2 1.9" /></>,
  receipt: <><path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" /><path d="M9 8.5h6M9 12h6M9 15.5h3.5" /></>,
  chart: <><path d="M4 20h16" /><rect x="5.5" y="11" width="3" height="7" rx="1" /><rect x="10.5" y="6" width="3" height="12" rx="1" /><rect x="15.5" y="9" width="3" height="9" rx="1" /></>,
  shield: <><path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  team: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19.5c.7-3.6 3.2-5.5 6.5-5.5s5.8 1.9 6.5 5.5" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /><path d="M12 14.2v2.3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.3 12.2 2.5 2.5 5-5" /></>,
  message: <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z" />,
  wand: <><path d="M4 20 15 9" /><path d="m13.5 7.5 3 3" /><path d="M18 3v3M16.5 4.5h3M20 9v2M19 10h2M10 3v2M9 4h2" /></>,
  pen: <><path d="M15.5 5.5 18.5 8.5 9 18H6v-3z" /><path d="M13.5 7.5l3 3" /><path d="M5 21h14" /></>,
  flag: <><path d="M6 20.5V4.5" /><path d="M6 5h10.5l-2 3.5 2 3.5H6" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.6v.4" /><circle cx="12" cy="16.9" r=".6" fill="currentColor" /></>,
  rocket: <><path d="M14.5 4c3 0 5.5 2.5 5.5 5.5-2 4-5.5 6.5-8.5 7.5L7 12.5C8 9.5 10.5 6 14.5 4z" /><circle cx="14.6" cy="9.4" r="1.6" /><path d="M7 12.5 4 13l1.5 2.5M11.5 17 11 20l-2.5-1.5" /></>,
  tag: <><path d="M3.5 12V4.5H11L20 13.5 13.5 20z" /><circle cx="7.6" cy="8.6" r="1.4" /></>,
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></>,
  book: <><path d="M4.5 5.5c2.8-.9 5.3-.6 7.5 1 2.2-1.6 4.7-1.9 7.5-1V18c-2.8-.9-5.3-.6-7.5 1-2.2-1.6-4.7-1.9-7.5-1z" /><path d="M12 6.5V19" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5S9.5 6.1 12 3.5z" /></>,
  lead: <><circle cx="10" cy="9" r="3.3" /><path d="M3.5 19.5c.6-3.4 3-5.3 6.5-5.3 1.6 0 3 .4 4.1 1.2" /><path d="M18 13.5v6M15 16.5h6" /></>,
};

export function Icon({ name, size = 22, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`cc-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {P[name]}
    </svg>
  );
}
