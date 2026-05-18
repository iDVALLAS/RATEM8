type PrincipleCardProps = {
  number: number;
  title: string;
  body: string;
};

export default function PrincipleCard({
  number,
  title,
  body,
}: PrincipleCardProps) {
  return (
    <article className="group relative p-7 border border-[var(--rule)] rounded-2xl bg-[color-mix(in_srgb,var(--bg)_70%,var(--color-m8-forest))] hover:border-[var(--color-m8-green)] transition-colors">
      <div className="principle-label">
        Principle {String(number).padStart(2, "0")}
      </div>
      <h3 className="font-display text-2xl mt-4 leading-snug">{title}</h3>
      <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">{body}</p>
    </article>
  );
}
