/**
 * ResultCard + ResultRow — display primitives for calculator outputs.
 *
 * Same border/spacing as PrincipleCard so the calculator body has
 * consistent visual language with the rest of the site. Mono label
 * on left, display value on right.
 */

export function ResultCard({
  title,
  children,
  highlight,
}: {
  title?: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border p-6"
      style={{
        borderColor: highlight ? "var(--accent)" : "var(--rule)",
        background: highlight
          ? "var(--accent-soft)"
          : "var(--bg-elevated, transparent)",
      }}
    >
      {title ? (
        <p className="principle-label mb-4">{title}</p>
      ) : null}
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

export function ResultRow({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="flex flex-col">
        <span
          className="font-mono text-[11px] tracking-widest uppercase"
          style={{ color: "var(--muted)" }}
        >
          {label}
        </span>
        {hint ? (
          <span
            className="text-xs mt-1"
            style={{ color: "var(--muted)" }}
          >
            {hint}
          </span>
        ) : null}
      </div>
      <span
        className={
          emphasis
            ? "font-display text-3xl sm:text-4xl"
            : "font-display text-xl"
        }
        style={{ color: emphasis ? "var(--accent)" : "var(--fg)" }}
      >
        {value}
      </span>
    </div>
  );
}
