"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { runTeam, sendDueMoves } from "@/lib/agents/runner";
import { approveGift, closeMove, importListings, importNewAgents, saveTeamSettings, sendDraft, setPlaybook } from "@/lib/agents/service";

const go = (target: string, ok: boolean, lines: string[]): never => {
  const [path, hash] = target.split("#");
  return redirect(`${path}${path.includes("?") ? "&" : "?"}f=${encodeURIComponent(encodeFlash({ ok, lines }))}${hash ? `#${hash}` : ""}`);
};
const me = async () => (await currentUser()) ?? redirect("/sign-in");

export async function runNowAction(): Promise<void> {
  const u = await me();
  const r = await runTeam(u, new Date(), { send: true });
  go("/mlo/agents", true, [`Your team found ${r.added} new thing${r.added === 1 ? "" : "s"} to do${r.sent ? `, and sent ${r.sent} message${r.sent === 1 ? "" : "s"} from approved playbooks` : ""}${r.held ? `. Compliance held ${r.held}` : ""}${r.waiting ? `. ${r.waiting} wait for sending hours` : ""}.`]);
}

export async function sendDueAction(): Promise<void> {
  const u = await me();
  const r = await sendDueMoves(u);
  go("/mlo/agents", true, [`Sent ${r.sent}. ${r.waiting ? `${r.waiting} waiting for sending hours or today's limit. ` : ""}${r.refused ? `${r.refused} couldn't be sent (now tasks, with the reason).` : ""}`]);
}

export async function moveDoneAction(id: string): Promise<void> {
  await closeMove(await me(), id, "done");
  go("/mlo/agents", true, ["Done."]);
}

export async function moveDismissAction(id: string): Promise<void> {
  await closeMove(await me(), id, "dismissed");
  go("/mlo/agents", true, ["Set aside."]);
}

export async function sendDraftAction(id: string): Promise<void> {
  const r = await sendDraft(await me(), id);
  go("/mlo/agents", r.ok, [r.ok ? "Sent." : r.error]);
}

export async function giftAction(id: string, fd: FormData): Promise<void> {
  const r = await approveGift(await me(), id, Number(String(fd.get("dollars") ?? "").replace(/[^0-9.]/g, "")), String(fd.get("what") ?? ""));
  go("/mlo/agents", r.ok, [r.ok ? `Logged${r.expense ? " and added to your expenses" : ""}.` : r.error]);
}

export async function settingsAction(fd: FormData): Promise<void> {
  const u = await me();
  const n = (k: string) => Number(String(fd.get(k) ?? "").replace(/[^0-9.]/g, ""));
  const r = await saveTeamSettings(u, {
    enabled: fd.get("enabled") === "on",
    sources: fd.getAll("sources").map(String),
    area: String(fd.get("area") ?? ""),
    dailySends: n("dailySends"),
    gifts: fd.get("gifts") === "on",
    giftCapDollars: n("giftCap"),
    goals: { yearlyIncome: n("yearlyIncome"), incomePerLoan: n("incomePerLoan"), appToClose: n("appToClose"), talkToApp: n("talkToApp"), partnerTouchesPerWeek: n("partnerTouchesPerWeek") },
  });
  go("/mlo/agents/setup", r.ok, [r.ok ? "Saved." : r.error]);
}

export async function playbookAction(id: string, on: boolean): Promise<void> {
  const r = await setPlaybook(await me(), id, on);
  go("/mlo/agents/setup#playbooks", r.ok, [r.ok ? (on ? "Approved. Your team may now send it on its own, through your contact rules." : "Approval taken back. It goes back to waiting for you each time.") : r.error]);
}

async function fileText(fd: FormData): Promise<string | null> {
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > 4 * 1024 * 1024) return "";
  return f.text();
}

export async function listingsAction(fd: FormData): Promise<void> {
  const u = await me();
  const t = await fileText(fd);
  if (!t) go("/mlo/agents/setup#lists", false, [t === "" ? "That file is over 4 MB." : "Pick a CSV file (save the spreadsheet as CSV)."]);
  const r = await importListings(u, t!);
  go("/mlo/agents/setup#lists", r.ok, [r.ok ? `Added ${r.added} listing${r.added === 1 ? "" : "s"} and ${r.agents} new agent${r.agents === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} rows skipped: no address or agent name)` : ""}. Your Partner will reach out to the listing agents.` : r.error]);
}

export async function newAgentsAction(fd: FormData): Promise<void> {
  const u = await me();
  const t = await fileText(fd);
  if (!t) go("/mlo/agents/setup#lists", false, [t === "" ? "That file is over 4 MB." : "Pick a CSV file (save the spreadsheet as CSV)."]);
  const r = await importNewAgents(u, t!);
  go("/mlo/agents/setup#lists", r.ok, [r.ok ? `Added ${r.added} new agent${r.added === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} skipped: already in your book, or no email or phone)` : ""}. Your Partner will welcome them.` : r.error]);
}
