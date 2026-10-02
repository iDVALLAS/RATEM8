import CTAButton from "@/components/CTAButton";
import { Sheet } from "@/components/motion/Stage";
import SlideHeadline, { splitLines } from "@/components/motion/SlideHeadline";
import { copy } from "@/lib/copy";
import { homeContent } from "@/lib/content/home";

/**
 * MloBand — one short paper chapter for licensed MLOs, linking to
 * /join. The last sheet on the stage; accent phrase underlined. No
 * earnings claims.
 */
export default function MloBand() {
  return (
    <Sheet id="mlos" chapter="paper" className="hm-sheet">
      <div className="hm-sheet__inner sheet-fill mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="hm-mlo">
          <div>
            <div className="code-label">{copy.mloBand.eyebrow}</div>
            <SlideHeadline as="h2" lines={splitLines(copy.mloBand.heading)} accent={copy.mloBand.accent} underline className="hm-h2 mt-4" />
            <p className="sr-only">{homeContent.mlo.textEquivalent}</p>
            <p className="hm-sub max-w-xl">{copy.mloBand.body}</p>
          </div>
          <div className="md:justify-self-end w-full max-w-sm">
            <CTAButton href="/join" variant="secondary" icon="//">
              {copy.mloBand.cta}
            </CTAButton>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
