/**
 * lib/contacts/ask-words.ts — "Ask M8 for a list" without AI, and the
 * fair-lending check every ask goes through first (D80). Client-safe and
 * pure.
 *
 *  - `listRefusal(text)`: a request about a protected trait (age, family
 *    status, race, sex, religion, disability, national origin…) or a close
 *    proxy is refused in plain words before anything else runs. It reuses the
 *    Concierge's protected-topic lane (lib/concierge/guard.ts, D8.1) plus
 *    words that only matter for lists ("older clients", "women").
 *  - `parseListRequest(text, now)`: the common asks read by simple word
 *    matching, so the box works with no AI key: "ARM loans", "FHA and VA",
 *    "closed in 2025", "rate 7.2 to 9", "real estate agents", "past clients
 *    in WA", "not contacted in 90 days", "loans over $500k".
 *
 * Neither looks at any contact. The result is a `ListRule` the loan officer
 * sees as chips and can change before anything runs.
 */
import { protectedTopic } from "@/lib/concierge/guard";
import { US_STATES } from "@/lib/us-states";
import { cleanRule, type ListRule } from "./filter";
import type { LoanProgram } from "./loan";

/** Words that point to a protected trait in a list request (on top of the Concierge's lane). */
const LIST_PROTECTED: RegExp[] = [
  /\b(ages?|aged|age \d+|born|birth\w*|birthdays?|dob|millennials?|boomers?|gen ?[xyz]|seniors?|retirees?)\b/i,
  /\b(older|younger|young|old|elderly) (people|persons|clients|borrowers|folks|homeowners|buyers|couples|families|ones|men|women)\b/i,
  /\b(over|under) (the age of )?\d{2} (years old|yo)\b/i,
  /\b(gender|sex|male|female|wom[ae]n|ladies|gentlemen|\bmen\b|boys|girls|moms?|dads?|mothers?|fathers?)\b/i,
  /\b(marital|single (people|clients|women|men|moms?|dads?|parents?)|newlyweds?|couples? with)\b/i,
  /\b(famil(y|ies) with|familial|family size|households? with|pregnan\w*)\b/i,
  /\b(nationality|national origin|citizens?|non.?citizens?|foreign.?born|immigrants?|language|speakers?|bilingual|ethnic\w*|surnames?|sounding names?|names? that sound)\b/i,
  /\b(disabled|disabilit\w*|handicap\w*|veteran status)\b/i,
];

/** The reason a list request can't run (a protected trait), or null. Checked before any model call. */
export function listRefusal(text: string): string | null {
  const t = String(text ?? "");
  const lane = protectedTopic(t);
  if (lane) return lane;
  for (const re of LIST_PROTECTED) if (re.test(t)) return "protected trait";
  return null;
}

const STATE_BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s.code]));
const STATE_CODES = new Set(US_STATES.map((s) => s.code));
const PROGRAM_WORDS: [RegExp, LoanProgram][] = [
  [/\bfha\b/i, "fha"],
  [/\bvas?\b/i, "va"],
  [/\busda\b/i, "usda"],
  [/\bjumbos?\b/i, "jumbo"],
  [/\bhelocs?\b/i, "heloc"],
  [/\bnon.?qm\b|\bdscr\b|\bbank.?statement/i, "non_qm"],
  [/\bconv(entional)?\b|\bconforming\b/i, "conventional"],
];
const DAY = 86_400_000;
const COMMON_WORDS = new Set(["in", "on", "or", "at", "to", "me", "ok", "hi", "de", "id", "oh", "pa", "ma", "la", "co", "al", "ar", "as", "us", "so", "no", "go", "do", "be", "he", "we", "it", "is", "an", "am", "of", "by", "my", "up", "mo", "ne", "nd", "sd"]);
const n = (s: string) => Number(s.replace(/,/g, ""));
/** "$500k", "500,000", "1.2m" as dollars. */
function dollars(raw: string): number | null {
  const m = /^\$?\s*([\d,]+(?:\.\d+)?)\s*(k|m|mm|million|thousand)?$/i.exec(raw.trim());
  if (!m) return null;
  const v = n(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  const out = unit === "k" || unit === "thousand" ? v * 1000 : unit.startsWith("m") ? v * 1_000_000 : v;
  return Number.isFinite(out) && out >= 1000 ? Math.round(out) : null;
}
const rateish = (v: number) => Number.isFinite(v) && v > 0 && v < 20;
const yearOk = (y: number, now: Date) => y >= 1970 && y <= now.getUTCFullYear() + 1;

/**
 * The no-AI reading of a request. `understood` is false when nothing in it
 * could be read as a rule (the box then says so instead of showing everyone).
 */
export function parseListRequest(text: string, now = new Date()): { rule: ListRule; understood: boolean } {
  const raw = String(text ?? "").slice(0, 300);
  const t = raw.toLowerCase().replace(/[“”"]/g, '"').replace(/\s+/g, " ").trim();
  const r: ListRule = {};
  if (!t) return { rule: {}, understood: false };

  // Who: agents are their own kind; otherwise past clients, leads or sphere when named.
  const agents = /\b(real estate|realtors?|agents?|brokers?)\b/.test(t) && !/\bloan officers?\b/.test(t);
  if (agents) r.kind = "agent";
  else if (/\bpast clients?\b|\bformer clients?\b/.test(t)) r.relationship = "past_client";
  else if (/\bleads?\b/.test(t)) r.relationship = "lead";
  else if (/\bsphere\b/.test(t)) r.relationship = "sphere";

  // Rates: "7.2% to 9%", "from 7.2 to 9 percent", "between 7 and 8", "7% and up", "over 7%", "under 6%".
  const pct = "(\\d{1,2}(?:\\.\\d{1,3})?)\\s*(?:%|percent)?";
  const rateWords = /\brates?\b|%|percent/.test(t);
  const range = new RegExp(`(?:from |between )?${pct}\\s*(?:-|–|—|to|and|through|thru)\\s*${pct}`).exec(t);
  if (rateWords && range && rateish(Number(range[1])) && rateish(Number(range[2])) && !/\$|\bk\b/.test(range[0])) {
    r.rateMin = Number(range[1]);
    r.rateMax = Number(range[2]);
  } else if (rateWords) {
    const up = new RegExp(`(?:above|over|at least|greater than|more than|higher than|>=?)\\s*${pct}|${pct}\\s*(?:and up|or (?:higher|more|above)|\\+)`).exec(t);
    const down = new RegExp(`(?:below|under|at most|less than|lower than|<=?)\\s*${pct}|${pct}\\s*(?:or (?:lower|less|below))`).exec(t);
    const u = up ? Number(up[1] ?? up[2]) : NaN;
    const d = down ? Number(down[1] ?? down[2]) : NaN;
    if (rateish(u)) r.rateMin = u;
    if (rateish(d)) r.rateMax = d;
  }

  // Amounts: "over $500k", "under 300,000", "$400k to $600k".
  const amtRange = /\$\s*([\d,.]+\s*(?:k|m|mm)?)\s*(?:-|–|to|and)\s*\$?\s*([\d,.]+\s*(?:k|m|mm)?)/i.exec(t);
  if (amtRange && dollars(amtRange[1]) && dollars(amtRange[2])) {
    r.amountMin = dollars(amtRange[1])!;
    r.amountMax = dollars(amtRange[2])!;
  } else {
    const over = /(?:over|above|at least|more than|bigger than)\s*(\$\s*[\d,.]+\s*(?:k|m|mm|million)?|[\d,.]+\s*(?:k|m|mm|million))/i.exec(t);
    const under = /(?:under|below|at most|less than|smaller than)\s*(\$\s*[\d,.]+\s*(?:k|m|mm|million)?|[\d,.]+\s*(?:k|m|mm|million))/i.exec(t);
    if (over && dollars(over[1])) r.amountMin = dollars(over[1])!;
    if (under && dollars(under[1])) r.amountMax = dollars(under[1])!;
  }

  // Closed dates: "2025", "2023 to 2024", "since 2022", "before 2020", "in the last 2 years".
  const years = [...t.matchAll(/\b(19[7-9]\d|20\d{2})\b/g)].map((m) => Number(m[1])).filter((y) => yearOk(y, now));
  const yRange = /\b(19[7-9]\d|20\d{2})\s*(?:-|–|to|through|thru|and)\s*(19[7-9]\d|20\d{2})\b/.exec(t);
  if (yRange && yearOk(Number(yRange[1]), now) && yearOk(Number(yRange[2]), now)) {
    r.closedFrom = `${Math.min(Number(yRange[1]), Number(yRange[2]))}-01-01`;
    r.closedTo = `${Math.max(Number(yRange[1]), Number(yRange[2]))}-12-31`;
  } else if (years.length) {
    const y = years[0];
    if (new RegExp(`(since|after|from) ${y}`).test(t)) r.closedFrom = `${/after/.test(t) ? y + 1 : y}-01-01`;
    else if (new RegExp(`(before|until|through|prior to) ${y}`).test(t)) r.closedTo = /before|prior/.test(t) ? `${y - 1}-12-31` : `${y}-12-31`;
    else {
      r.closedFrom = `${y}-01-01`;
      r.closedTo = `${y}-12-31`;
    }
  } else {
    const last = /\b(?:in |within )?the (?:last|past) (\d{1,2}) (months?|years?)\b/.exec(t);
    if (last && /\bclos(ed|ing)\b|\bfunded\b/.test(t)) {
      const back = new Date(now.getTime() - Number(last[1]) * (last[2].startsWith("y") ? 365 : 30) * DAY);
      r.closedFrom = back.toISOString().slice(0, 10);
    } else if (/\blast year\b/.test(t)) {
      const y = now.getUTCFullYear() - 1;
      r.closedFrom = `${y}-01-01`;
      r.closedTo = `${y}-12-31`;
    } else if (/\bthis year\b/.test(t) && /\bclos(ed|ing)\b/.test(t)) r.closedFrom = `${now.getUTCFullYear()}-01-01`;
  }
  if (/\b(no|without( a)?|missing( a)?|blank) (clos(ed|ing) )?dates?\b|\bno closing date\b/.test(t)) {
    r.hasClosedDate = false;
    delete r.closedFrom;
    delete r.closedTo;
  } else if (/\bclosed\b|\bfunded\b|\bclosings?\b/.test(t) && !r.closedFrom && !r.closedTo && !agents) r.hasClosedDate = true;

  // Programs, fixed or ARM, the ARM's change.
  if (!agents) {
    // "in VA" is the state (Virginia), not the program.
    const words = t.replace(/\b(in|from) va\b/g, " ");
    const progs = PROGRAM_WORDS.filter(([re]) => re.test(words)).map(([, p]) => p);
    if (progs.length) r.program = [...new Set(progs)];
    if (/\barms?\b|\badjustable/.test(t)) r.rateType = "arm";
    else if (/\bfixed\b/.test(t)) r.rateType = "fixed";
    const adj = /\b(adjust\w*|chang\w*|reset\w*)\b/.test(t);
    if (adj && (r.rateType === "arm" || /\barm/.test(t))) {
      r.rateType = "arm";
      const within = /\b(?:next|within|in the next|coming) (\d{1,3}) (days?|months?|years?)\b/.exec(t);
      if (within) {
        const k = Number(within[1]);
        r.armChangeWithinDays = within[2].startsWith("y") ? k * 365 : within[2].startsWith("m") ? (k % 12 === 0 ? (k / 12) * 365 : k * 30) : k;
      }
      else if (/\bnext year\b|\bcoming year\b|\bnext 12 months\b|\bthis year\b/.test(t)) r.armChangeWithinDays = 365;
      else r.armChangeWithinDays = 365;
    }
    if (/\bcash.?out\b/.test(t)) r.purpose = "cash_out";
    else if (/\brefi(nance)?s?\b|\brefinanc/.test(t)) r.purpose = "refi";
    else if (/\bpurchases?\b|\bbought\b|\bhome ?buyers?\b|\bbuyers?\b/.test(t)) r.purpose = "purchase";
    const lender = /\blender (?:is |was |named |called )?"?([a-z0-9&.' -]{2,40}?)"?(?:$|,| in | with | and | who | that )/.exec(t);
    if (lender) r.lender = lender[1].trim();
  }

  // State: a full name, or a two-letter code after "in" ("VA loans in WA").
  for (const [name, code] of STATE_BY_NAME) {
    if (new RegExp(`\\b(in|from) ${name}\\b`).test(t)) {
      r.state = code;
      break;
    }
  }
  if (!r.state) {
    // Capitals always count ("in OR"); in small letters only codes that aren't everyday words ("in wa", not "in me").
    for (const m of raw.matchAll(/\b(?:in|from) ([A-Za-z]{2})\b/g)) {
      const code = m[1].toUpperCase();
      if (STATE_CODES.has(code) && (m[1] === code || !COMMON_WORDS.has(m[1].toLowerCase()))) {
        r.state = code;
        break;
      }
    }
  }

  // Contact and tags.
  const quiet = /\b(?:haven'?t|have not|not|didn'?t|did not|no one i'?ve|never) (?:talked|spoken|contacted|reached|texted|called|heard from)\w*(?: (?:to|with|out to|from))?(?: them)?(?: in| for)?(?: the last| over)? (\d{1,4}) (days?|weeks?|months?)\b/.exec(t);
  if (quiet) r.quietDays = Number(quiet[1]) * (quiet[2].startsWith("w") ? 7 : quiet[2].startsWith("m") ? 30 : 1);
  else if (/\bnever (contacted|texted|called|reached)\b/.test(t)) r.neverContacted = true;
  if (/\bnever (replied|wrote back|responded|answered)\b|\bno replies?\b/.test(t)) r.neverReplied = true;
  if (/\b(new|added) this week\b|\badded in the last 7 days\b/.test(t)) r.addedWithinDays = 7;
  else if (/\badded this month\b|\badded in the last 30 days\b/.test(t)) r.addedWithinDays = 30;
  const tag = /\btagged\s+"([^"]{1,60})"|\btagged\s+([a-z0-9][\w-]{0,40})/.exec(t);
  if (tag) {
    const word = (tag[1] ?? tag[2]).trim();
    // The tag as the loan officer typed it (case kept), found in the original text.
    const at = raw.toLowerCase().indexOf(word);
    r.tagsAny = [at >= 0 ? raw.slice(at, at + word.length) : word];
  }

  const rule = cleanRule(r);
  const understood = Object.keys(rule).length > 0;
  return { rule, understood };
}
