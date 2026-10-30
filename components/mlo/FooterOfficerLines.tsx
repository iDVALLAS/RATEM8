"use client";

import { useNamedMlo } from "@/components/mlo/MloContext";
import { officerFooterLines } from "@/lib/licensing";

/**
 * The footer's loan officer paragraph (L2). Every name and number comes
 * from lib/config.ts through officerFooterLines(). A visitor matched to
 * another loan officer (Oregon → that state's MLO) sees only theirs;
 * everyone else sees the operator plus each state-specific MLO.
 */
export default function FooterOfficerLines() {
  const named = useNamedMlo();
  return <>{officerFooterLines(named?.id ?? null).join(" ")}</>;
}
