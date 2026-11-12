"use client";

import Image from "next/image";
import { useState } from "react";
import type { Mlo } from "@/lib/config";

/**
 * MloAvatar — a loan officer's round headshot (C1).
 *
 * The photo comes from the MLO's `photo` (config/licensing.ts, via
 * lib/config.ts) and renders only when it is a file path under /team/.
 * Anything else, or a file that doesn't load (a photo listed before it is
 * supplied), draws an initials avatar in M8 Green, so there is never a
 * broken image. Alt text carries the name and NMLS number together.
 *
 * Sizes by placement (launch brief L1): 72 on the MLO card, 56 in the chat
 * header (C14, owner 2026-11-08; was 36), 28 on rate results.
 */
export function hasPhoto(mlo: Pick<Mlo, "photo">): boolean {
  return /^\/team\/[a-z0-9-]+\.(webp|png|jpg)$/.test(mlo.photo);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

export default function MloAvatar({ mlo, size }: { mlo: Pick<Mlo, "name" | "nmls" | "photo">; size: number }) {
  const [failed, setFailed] = useState(false);
  const alt = `${mlo.name}, NMLS #${mlo.nmls}`;
  if (hasPhoto(mlo) && !failed) {
    return (
      <Image
        src={mlo.photo}
        alt={alt}
        width={size}
        height={size}
        className="mlo-avatar rounded-full"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={alt}
      className="mlo-avatar mlo-avatar--initials rounded-full"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    >
      {initials(mlo.name)}
    </span>
  );
}
