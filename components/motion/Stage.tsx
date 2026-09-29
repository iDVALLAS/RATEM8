import SheetStack from "./SheetStack";
import "./stage.css";

/**
 * Stage — the ambient green backdrop that a stack of sheets floats on.
 *
 * Usage:
 *   <Stage>
 *     <Scene className="sheet-item" background="night" … />
 *     <Sheet chapter="forest">…</Sheet>
 *   </Stage>
 *
 * Every direct child of the stack must carry `.sheet-item` (Scene via
 * `className`, or the Sheet component below). Sheets alternate chapter
 * backgrounds with the existing `.scene--night / --forest / --paper`
 * token sets, so everything inside keeps using tokens.
 */
type StageProps = {
  children: React.ReactNode;
  className?: string;
  id?: string;
};

export default function Stage({ children, className = "", id }: StageProps) {
  return (
    <div id={id} className={`stage-root ${className}`.trim()}>
      <div className="stage-backdrop" aria-hidden="true" />
      <SheetStack>{children}</SheetStack>
    </div>
  );
}

/**
 * Sheet — a non-animated sheet (no Scene timeline) for static bands.
 */
type SheetProps = {
  chapter: "night" | "forest" | "paper";
  children: React.ReactNode;
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
};

export function Sheet({ chapter, children, className = "", id, ...aria }: SheetProps) {
  return (
    <section id={id} className={`scene scene--${chapter} sheet-item ${className}`.trim()} {...aria}>
      {children}
    </section>
  );
}
