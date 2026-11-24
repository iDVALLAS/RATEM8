import { pricedToday } from "@/lib/pricing/display";

/**
 * /api/rates/available — D92: does the main menu show "Today's pricing"?
 *
 * GET → 200 {available: boolean}. True only while PRICING_MANUAL is on and
 * at least one daily scenario has a fresh snapshot (the same test /rates
 * uses to show or 404). Nothing else leaves: no prices, no lender names, no
 * scenario names. Any error answers false, so the link fails closed.
 *
 * Public in stealth (lib/public-paths.ts covers /api/*). A short shared
 * cache keeps the store from being asked on every page view.
 */
export const dynamic = "force-dynamic";

const AVAILABLE_CACHE = "public, s-maxage=60, stale-while-revalidate=300";

export async function GET(): Promise<Response> {
  let available = false;
  try {
    available = (await pricedToday()) === true;
  } catch {
    available = false;
  }
  return new Response(JSON.stringify({ available }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": AVAILABLE_CACHE },
  });
}
