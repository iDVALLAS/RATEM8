import SkeletonSurface from "@/components/ui/Skeleton";
import { copy } from "@/lib/copy";

/** v24: skeleton while a state page renders (per request when routing is on). */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
      <SkeletonSurface label={copy.uiStates.loadingPage} cards={3} />
    </div>
  );
}
