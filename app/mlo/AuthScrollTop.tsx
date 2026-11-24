"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * D91.1: the sign-in and sign-up pages always open at the top. Moving from a
 * long page (the bottom of /sign-up, where "Sign in" is) to a shorter one
 * could leave some browsers part-way down the new page. A link to a spot on
 * the page (#…) still goes to that spot.
 */
export default function AuthScrollTop() {
  const path = usePathname();
  useLayoutEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [path]);
  return null;
}
