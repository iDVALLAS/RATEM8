import { headers } from "next/headers";
import { CONFIG } from "./config";
import { NO_MLO, type MloContextValue } from "./mlo-match";
import { decodeRoute, ROUTE_HEADER } from "./routing";

/**
 * lib/route-context.ts — the per-request MloContext value (v15, Patch B),
 * read from the header middleware.ts sets. Server-only.
 *
 * With MLO_ROUTING off this returns NO_MLO without touching headers(), so
 * pages keep rendering statically. With it on, every page renders per
 * request so a page never shows one visitor's match to another.
 */
export async function routeContext(): Promise<MloContextValue> {
  if (!CONFIG.pricing.mloRouting) return NO_MLO;
  const h = await headers();
  return decodeRoute(h.get(ROUTE_HEADER));
}
