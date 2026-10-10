/**
 * ArrowText — renders copy that starts or ends with "→" with the arrow in
 * its own span (`.cta-arrow`), so every "→" call to action gets the same
 * animated arrow on hover and keyboard focus (v24). The arrow is
 * decorative; the words carry the meaning.
 */
export default function ArrowText({ text }: { text: string }) {
  const lead = text.match(/^\s*→\s*/);
  const trail = text.match(/\s*→\s*$/);
  const words = text.replace(/^\s*→\s*/, "").replace(/\s*→\s*$/, "");
  return (
    <>
      {lead ? (
        <span aria-hidden="true" className="cta-arrow cta-arrow--lead">
          →{" "}
        </span>
      ) : null}
      {words}
      {trail ? (
        <span aria-hidden="true" className="cta-arrow">
          {" "}→
        </span>
      ) : null}
    </>
  );
}
