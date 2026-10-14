import SkeletonSurface from "@/components/ui/Skeleton";
import { copy } from "@/lib/copy";

/** v24: skeleton while the scripted demo route renders. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16">
      <SkeletonSurface label={copy.uiStates.loadingDemo} cards={2} />
    </div>
  );
}
