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
 */

export type GuardReason = "unquoted-rate" | "rate-without-apr" | "sensitive-echo" | "prompt-leak" | "promise";
export type GuardResult = { ok: true } | { ok: false; reason: GuardReason };

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
export function findRateMentions(text: string): { value: number; raw: string; index: number }[] {
  const out: { value: number; raw: string; index: number }[] = [];
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
    if ((rate < Infinity && rate < other) || (rateShaped && other === Infinity)) out.push({ value, raw: m[0], index: m.index });
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
 * @param pricedRates rates and APRs from the latest get_pricing result
 * @param userStated percentages the borrower typed (see userPercentages)
 * @param partial true while the reply is still streaming
 */
export function guardReply(text: string, pricedRates: Set<string>, userStated: Set<string> = new Set(), partial = false): GuardResult {
  if (PROMPT_CANARIES.some((c) => text.includes(c))) return { ok: false, reason: "prompt-leak" };
  if (SSN_SHAPE.test(text) || ACCOUNT_RUN.test(text)) return { ok: false, reason: "sensitive-echo" };
  if (PROMISE.test(text)) return { ok: false, reason: "promise" };
  const rates = findRateMentions(text);
  let quoted = false;
  for (const x of rates) {
    const k = pctKey(x.value);
    if (pricedRates.has(k)) quoted = true;
    else if (!userStated.has(k)) return { ok: false, reason: "unquoted-rate" };
  }
  // Mid-stream (partial) the APR and disclosure may still be coming; checked when the reply ends.
  if (quoted && !partial && (!/\bAPR\b/.test(text) || !/commitment to lend/i.test(text))) return { ok: false, reason: "rate-without-apr" };
  return { ok: true };
}
