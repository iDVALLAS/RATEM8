import SkeletonSurface from "@/components/ui/Skeleton";
import { copy } from "@/lib/copy";

/** v24: /rates renders per request; this skeleton shows while it does. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
      <SkeletonSurface label={copy.uiStates.loadingPricing} cards={3} />
    </div>
  );
}
