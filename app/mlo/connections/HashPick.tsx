"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * D76: a link like /mlo/connections#arive (Pipeline's "Connect your loan
 * system") picks that system, the same as tapping its button. Other
 * fragments are left to the browser.
 */
export default function HashPick({ keys, picked }: { keys: string[]; picked: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const go = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (!h || h === picked || !keys.includes(h)) return;
      router.replace(`/mlo/connections?sys=${encodeURIComponent(h)}#${encodeURIComponent(h)}`);
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [keys, picked, router]);
  return null;
}
