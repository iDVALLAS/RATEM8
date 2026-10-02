/**
 * PrincipleCard — one of the eight. Op-ed feel: mono number, serif
 * title with the accent phrase in italic green, short body.
 */
type PrincipleCardProps = {
  number: number;
  title: string;
  body: string;
  accent?: string;
  className?: string;
};

export function AccentTitle({ title, accent }: { title: string; accent?: string }) {
  if (!accent || !title.includes(accent)) return <>{title}</>;
  const [before, after] = title.split(accent);
  return (
    <>
      {before}
      <em className="accent-word">{accent}</em>
      {after}
    </>
  );
}

export default function PrincipleCard({ number, title, body, accent, className = "" }: PrincipleCardProps) {
  return (
    <article className={`principle-card ${className}`}>
      <div className="principle-label">Principle {String(number).padStart(2, "0")}</div>
      <h3 className="principle-card__title">
        <AccentTitle title={title} accent={accent} />
      </h3>
      {body ? <p className="principle-card__body">{body}</p> : null}
    </article>
  );
}
