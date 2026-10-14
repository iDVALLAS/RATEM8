"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/mlo/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { NICHES, type Niche, type PlaybookEntry } from "@/lib/pricing/playbook";
import { publishSnapshot, saveSettings } from "@/lib/pricing/publish";
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

export async function publishSnapshotAction(fd: FormData): Promise<void> {
  const actor = await requireAdmin();
  const tenantId = str(fd, "tenantId");
  const scenarioId = str(fd, "scenarioId");
  const quotes: QuoteInput[] = [];
  const parseErrors: string[] = [];
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
      if (v !== null && Number.isNaN(v)) parseErrors.push(`Row ${i + 1}: ${k} is not a number.`);
    }
    quotes.push(q);
  }
  let source: { bytes: Uint8Array; mime: string } | null = null;
  const file = fd.get("source");
  if (file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0) {
    source = { bytes: new Uint8Array(await (file as File).arrayBuffer()), mime: (file as File).type };
  }
  const res = parseErrors.length
    ? { ok: false as const, errors: parseErrors }
    : await publishSnapshot({ tenantId, scenarioId, quotes, source, actor });
  const flash = res.ok ? { ok: true, lines: [`Published. Inputs hash ${res.inputsHash.slice(0, 12)}.`] } : { ok: false, lines: res.errors };
  redirect(`/mlo/pricing?t=${encodeURIComponent(tenantId)}&s=${encodeURIComponent(scenarioId)}&f=${encodeFlash(flash)}`);
}
