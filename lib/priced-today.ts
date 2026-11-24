/**
 * lib/priced-today.ts — D92, browser side: does the main menu show
 * "Today's pricing"? Asks /api/rates/available once per page load (the
 * answer is shared by every Nav mount until a full reload) and fails
 * closed: anything but a 200 with {available: true} means no link.
 */
export const PRICED_TODAY_URL = "/api/rates/available";

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "json">>;

export async function fetchPricedToday(fetchImpl: FetchLike): Promise<boolean> {
  try {
    const res = await fetchImpl(PRICED_TODAY_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null && (body as { available?: unknown }).available === true;
  } catch {
    return false;
  }
}

let once: Promise<boolean> | null = null;

/** One request per page load; later calls share its answer. */
export function loadPricedToday(): Promise<boolean> {
  if (typeof fetch !== "function") return Promise.resolve(false);
  once ??= fetchPricedToday((input, init) => fetch(input, init));
  return once;
}
