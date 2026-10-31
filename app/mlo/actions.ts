"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/mlo/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { NICHES, type Niche, type PlaybookEntry } from "@/lib/pricing/playbook";
import { publishSnapshot, saveSettings, SOURCE_MAX_BYTES, SOURCE_TYPES } from "@/lib/pricing/publish";
import { buildPostedWeek, savePostedWeek, withdrawPostedWeek } from "@/lib/pricing/posted-rate";
import { getStore } from "@/lib/pricing/store";
import { approveQuote, priceQuote, rejectQuote } from "@/lib/quotes/service";
import { NO_RISKY_FEATURES, type QuoteInput } from "@/lib/pricing/types";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string, d = 0) => {
  const v = str(fd, k);
  if (v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const pick = <T extends string>(v: string, allowed: readonly T[]): T | "" => ((allowed as readonly string[]).includes(v) ? (v as T) : "");

export async function saveSettingsAction(fd: FormData): Promise<void> {
  const actor = await requireAdmin();
  const tenantId = str(fd, "tenantId");
  const active = fd.getAll("active").map(String);
  const playbook: PlaybookEntry[] = active.map((k) => ({
    lenderKey: k,
    turnTimes: pick(str(fd, `pb.${k}.turnTimes`), ["fast", "typical", "slow"] as const),
    conditionStyle: pick(str(fd, `pb.${k}.conditionStyle`), ["light", "standard", "heavy"] as const),
    exceptionAppetite: pick(str(fd, `pb.${k}.exceptionAppetite`), ["low", "medium", "high"] as const),
    commsQuality: pick(str(fd, `pb.${k}.commsQuality`), ["excellent", "good", "fair"] as const),
    niches: fd.getAll(`pb.${k}.niches`).map(String).filter((n): n is Niche => (NICHES as readonly string[]).includes(n)),
    note: str(fd, `pb.${k}.note`),
  }));
  const res = await saveSettings({ tenantId, activeLenderKeys: active, playbook, actor });
  const flash = res.ok
    ? { ok: true, lines: [`Saved version ${res.settings.version}.`, ...res.warnings] }
    : { ok: false, lines: res.errors };
  redirect(`/mlo/setup?t=${encodeURIComponent(tenantId)}&f=${encodeFlash(flash)}`);
}

function parseRows(fd: FormData): { quotes: QuoteInput[]; errors: string[] } {
  const quotes: QuoteInput[] = [];
  const errors: string[] = [];
  for (let i = 0; i < 12; i++) {
    const lenderKey = str(fd, `r${i}.lender`);
    if (!lenderKey) continue;
    const eligible = str(fd, `r${i}.status`) !== "ineligible";
    const io = num(fd, `r${i}.io`, 0);
    const q: QuoteInput = {
      lenderKey,
      productLabel: str(fd, `r${i}.product`) || "30-year fixed",
      eligible,
      ineligibleReason: eligible ? undefined : str(fd, `r${i}.reason`),
      noteRate: eligible ? num(fd, `r${i}.rate`, NaN) : null,
      pointsPct: eligible ? num(fd, `r${i}.points`, 0) : 0,
      originationFee: eligible ? num(fd, `r${i}.orig`, 0) : 0,
      lenderFees: eligible ? num(fd, `r${i}.fees`, 0) : 0,
      lockDays: num(fd, `r${i}.lock`, 30),
      interestOnlyMonths: eligible ? io : 0,
      features: {
        ...NO_RISKY_FEATURES,
        interestOnly: eligible && (io > 0 || fd.get(`r${i}.f.io`) === "on"),
        prepaymentPenalty: fd.get(`r${i}.f.prepay`) === "on",
        balloonFirst7Years: fd.get(`r${i}.f.balloon`) === "on",
        negativeAmortization: fd.get(`r${i}.f.negam`) === "on",
        demandFeature: fd.get(`r${i}.f.demand`) === "on",
        sharedEquityOrAppreciation: fd.get(`r${i}.f.shared`) === "on",
      },
    };
    for (const [k, v] of Object.entries({ rate: q.noteRate, points: q.pointsPct, origination: q.originationFee, fees: q.lenderFees, lock: q.lockDays })) {
      if (v !== null && Number.isNaN(v)) errors.push(`Row ${i + 1}: ${k} is not a number.`);
    }
    quotes.push(q);
  }
  return { quotes, errors };
}

async function parseSource(fd: FormData, name = "source"): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const file = fd.get(name);
  if (file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0) {
    return { bytes: new Uint8Array(await (file as File).arrayBuffer()), mime: (file as File).type };
  }
  return null;
}

export async function publishSnapshotAction(fd: FormData): Promise<void> {
  const actor = await requireAdmin();
  const tenantId = str(fd, "tenantId");
  const scenarioId = str(fd, "scenarioId");
  const { quotes, errors: parseErrors } = parseRows(fd);
  const source = await parseSource(fd);
  const res = parseErrors.length
    ? { ok: false as const, errors: parseErrors }
    : await publishSnapshot({ tenantId, scenarioId, quotes, source, actor });
  const flash = res.ok ? { ok: true, lines: [`Published. Inputs hash ${res.inputsHash.slice(0, 12)}.`] } : { ok: false, lines: res.errors };
  redirect(`/mlo/pricing?t=${encodeURIComponent(tenantId)}&s=${encodeURIComponent(scenarioId)}&f=${encodeFlash(flash)}`);
}

// ── v37 (L4): personal estimates ─────────────────────────────────────

const back = (id: string, flash: { ok: boolean; lines: string[] }) => `/mlo/quotes?q=${encodeURIComponent(id)}&f=${encodeFlash(flash)}`;

export async function priceQuoteAction(fd: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = str(fd, "id");
  const { quotes, errors } = parseRows(fd);
  const res = errors.length ? { ok: false as const, errors } : await priceQuote({ id, quotes, source: await parseSource(fd), actor });
  redirect(back(id, res.ok ? { ok: true, lines: ["Priced. Review the three options, then approve or reject."] } : { ok: false, lines: res.errors }));
}

export async function approveQuoteAction(fd: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = str(fd, "id");
  if (fd.get("confirm") !== "on") redirect(back(id, { ok: false, lines: ["Tick the box to confirm you reviewed these numbers."] }));
  const res = await approveQuote(id, actor, str(fd, "note"));
  redirect(back(id, res.ok ? { ok: true, lines: [res.emailed ? "Approved and emailed to the borrower." : "Approved. Email isn't configured, so it was not sent; the borrower's link shows the estimate."] } : { ok: false, lines: res.errors }));
}

export async function rejectQuoteAction(fd: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = str(fd, "id");
  const res = await rejectQuote(id, actor, str(fd, "reason"));
  redirect(back(id, res.ok ? { ok: true, lines: ["Rejected. The borrower's link says it couldn't be priced as sent."] } : { ok: false, lines: res.errors }));
}

// ── v37 (L4): Thursday posted rates ──────────────────────────────────

export async function publishPostedAction(fd: FormData): Promise<void> {
  const actor = await requireAdmin();
  const weekOf = str(fd, "weekOf");
  const source = await parseSource(fd, "evidence");
  let evidenceSha256: string | null = null;
  const built = buildPostedWeek({ weekOf, pmms30: num(fd, "pmms30", NaN), pmms15: num(fd, "pmms15", NaN), confirmed: fd.get("confirm") === "on", actor });
  let flash: { ok: boolean; lines: string[] };
  if (!built.ok) flash = { ok: false, lines: built.errors };
  else {
    try {
      if (source) {
        if (!SOURCE_TYPES.includes(source.mime) || source.bytes.length > SOURCE_MAX_BYTES) throw new Error("Evidence must be a PNG, JPEG or PDF under 5 MB.");
        evidenceSha256 = await getStore().putSource(source.bytes, source.mime, actor, "posted-rates");
      }
      await savePostedWeek({ ...built.week, evidenceSha256 });
      flash = { ok: true, lines: [`Published: 30-yr ${built.week.lines[0].rate.toFixed(3)}%, 15-yr ${built.week.lines[1].rate.toFixed(3)}%, through ${built.week.honorUntil.slice(0, 10)}.`] };
    } catch (e) {
      flash = { ok: false, lines: [(e as Error).message] };
    }
  }
  redirect(`/mlo/thursday?f=${encodeFlash(flash)}`);
}

export async function withdrawPostedAction(fd: FormData): Promise<void> {
  const actor = await requireAdmin();
  const ok = await withdrawPostedWeek(str(fd, "weekOf"), actor);
  redirect(`/mlo/thursday?f=${encodeFlash(ok ? { ok: true, lines: ["Withdrawn. The posted rates no longer show."] } : { ok: false, lines: ["Nothing to withdraw for that week."] })}`);
}
