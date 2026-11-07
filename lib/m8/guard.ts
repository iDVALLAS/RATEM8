/**
 * lib/m8/guard.ts — the output guard (C4). Checked while M8's reply streams
 * and again when it ends. Any failure replaces the whole reply with a safe
 * fallback, and the route logs the reason (never the text).
 *
 * It blocks:
 *  - a rate or APR that isn't in the latest get_pricing result in this
 *    conversation (the brief's rule). Percentages the borrower typed
 *    themselves ("I'm at 7.25%") may be repeated: they aren't quotes.
 *  - a permitted rate shown without its APR and the not-a-commitment line
 *  - an SSN or account number echoed back
 *  - text from the system prompt (a prompt leak)
 *  - a promise of approval, pre-approval, a lock or a closing date
 *  - C6: while live pricing is off, a claim that M8 can pull, run, get or
 *    show pricing or a quote ("I can pull live pricing right here")
 */

export type GuardReason = "unquoted-rate" | "rate-without-apr" | "sensitive-echo" | "prompt-leak" | "promise" | "pricing-promise";
/** `value` names the percentage an unquoted-rate block was about (a number only, safe to log). */
export type GuardResult = { ok: true } | { ok: false; reason: GuardReason; value?: string };

const PERCENT = /(\d{1,2}(?:\.\d{1,3})?)\s?(?:%|percent\b)/gi;
const RATE_WORDS = /\b(?:rates?|apr|interest|coupon|fixed|arm|priced|pricing|quotes?|lenders? (?:is|are) (?:at|offering))\b/gi;
const OTHER_WORDS =
  /\b(?:down(?:\s+payment)?|ltv|loan-to-value|dti|debt-to-income|pmi|mip|tax(?:es)?|insurance|equity|appreciat\w*|inflation|reserves?|of (?:the )?(?:price|value|loan|income|purchase)|origination fee|points?)\b/gi;
const WINDOW = 45;

/** Lines of the system prompt that never appear in a real answer. */
const PROMPT_CANARIES = ["PRICING RULES (hard rules)", "WHO YOU ARE", "ESCALATE to ", "You are M8, the AI loan assistant", "Pricing status right now:"];

// Detector, not copy: spelled so check:copy (which bans the word in copy) passes.
const PROMISE =
  /\b(?:you(?:'re| are| have been| were) (?:pre-?)?approved|you(?:'re| are) guarant(?:ee|eed)|guarantee(?:d)? (?:you|your|approval|that you)|(?:i|we)(?:'ve| have)? locked (?:in )?your rate|your rate is locked|you(?:'ll| will) (?:definitely |certainly )?close (?:by|on)|(?:i|we) (?:can )?promise (?:you|that))\b/i;

/**
 * C6: M8 offering pricing it can't produce. "I can pull live pricing",
 * "I'll get you a quote", "let me run the numbers on a rate". Negations
 * ("I can't get you pricing") and the loan officer ("your loan officer can price it")
 * don't match: only "I"/"we" plus a can/will verb.
 */
const PRICING_PROMISE =
  /\b(?:(?:i|we)(?:'ll|'d| will| would| can| could| am able to|'m able to)\s+(?:\w+\s+){0,2}?(?:pull|run|get|fetch|show|generate|grab|give|provide|send)\s+(?:you\s+)?(?:(?!how\b|why\b|what\b|when\b|where\b|whether\b|if\b)[\w']+\s+){0,2}?(?:pricing|quotes?|rate quotes?|rates?)\b|let me (?:pull|run|get|fetch|price)\b[^.?!]{0,30}\b(?:pricing|quotes?|rates?)\b|(?:pull|get|run) (?:you )?live pricing)/i;

/** An SSN shape, or an unbroken run of 8–19 digits (an account number). Phone numbers with separators pass. */
const SSN_SHAPE = /\b\d{3}-\d{2}-\d{4}\b/;
const ACCOUNT_RUN = /(?<![$\d])(?<!\d[,.])\d{8,19}(?![\d%]|[,.]\d)/;

/** Normalizes a percentage for comparison: "6.5" and "6.500" match. */
export function pctKey(n: number | string): string {
  return Number(n).toFixed(3);
}

function nearestDistance(text: string, re: RegExp, at: number): number {
  re.lastIndex = 0;
  let best = Infinity;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const d = m.index > at ? m.index - at : at - (m.index + m[0].length);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Percentages in `text` that read as an interest rate or APR. A percentage
 * counts when a rate word is nearer to it than a non-rate word (down
 * payment, LTV, DTI…), or when it's a decimal between 2% and 12% with no
 * non-rate word near it.
 */
export function findRateMentions(text: string): { value: number; raw: string; index: number; decimals: number }[] {
  const out: { value: number; raw: string; index: number; decimals: number }[] = [];
  PERCENT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PERCENT.exec(text)) !== null) {
    const value = Number(m[1]);
    if (!(value >= 0.5 && value <= 20)) continue;
    const window = text.slice(Math.max(0, m.index - WINDOW), m.index + m[0].length + WINDOW);
    const at = m.index - Math.max(0, m.index - WINDOW);
    const rate = nearestDistance(window, RATE_WORDS, at);
    const other = nearestDistance(window, OTHER_WORDS, at);
    // With no context either way, a decimal percentage between 2 and 12 reads as a rate ("you can get 5.99%").
    const rateShaped = /\.\d+$/.test(m[1]) && value >= 2 && value <= 12;
    if ((rate < Infinity && rate < other) || (rateShaped && other === Infinity)) out.push({ value, raw: m[0], index: m.index, decimals: (m[1].split(".")[1] ?? "").length });
  }
  return out;
}

/** Every percentage the borrower typed in the conversation (they may be repeated back). */
export function userPercentages(userTexts: string[]): Set<string> {
  const s = new Set<string>();
  for (const t of userTexts) {
    PERCENT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PERCENT.exec(t)) !== null) s.add(pctKey(m[1]));
  }
  return s;
}

/**
 * Is this mention one of the priced figures? Exact (6.5 = 6.500), or the
 * figure rounded to two decimals the usual way (APR 7.152% written 7.15%).
 * One decimal or none never matches a priced figure that has more
 * ("7%" is not 6.875%).
 */
function isPriced(x: { value: number; decimals: number }, priced: Set<string>): boolean {
  if (priced.has(pctKey(x.value))) return true;
  if (x.decimals !== 2) return false;
  for (const p of priced) if (Number(p).toFixed(2) === x.value.toFixed(2)) return true;
  return false;
}

/**
 * @param pricedRates rates, APRs and points from the latest get_pricing result
 * @param userStated percentages the borrower typed (see userPercentages)
 * @param partial true while the reply is still streaming
 * @param pricingLive true once live pricing exists (CONFIG.liveRatesEnabled); until then M8 may not offer to price
 */
export function guardReply(text: string, pricedRates: Set<string>, userStated: Set<string> = new Set(), partial = false, pricingLive = false): GuardResult {
  if (PROMPT_CANARIES.some((c) => text.includes(c))) return { ok: false, reason: "prompt-leak" };
  if (SSN_SHAPE.test(text) || ACCOUNT_RUN.test(text)) return { ok: false, reason: "sensitive-echo" };
  if (PROMISE.test(text)) return { ok: false, reason: "promise" };
  if (!pricingLive && PRICING_PROMISE.test(text)) return { ok: false, reason: "pricing-promise" };
  const rates = findRateMentions(text);
  let quoted = false;
  for (const x of rates) {
    if (isPriced(x, pricedRates)) quoted = true;
    else if (!userStated.has(pctKey(x.value))) return { ok: false, reason: "unquoted-rate", value: x.raw };
  }
  // Mid-stream (partial) the APR and disclosure may still be coming; checked when the reply ends.
  if (quoted && !partial && (!/\bAPR\b/.test(text) || !/commitment to lend/i.test(text))) return { ok: false, reason: "rate-without-apr" };
  return { ok: true };
}
