"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { disconnectThanks, discardCards, prepareCards, sendCards, setNoMail } from "@/lib/cards/service";

const go = (path: string, ok: boolean, lines: string[]): never => redirect(`${path}${path.includes("?") ? "&" : "?"}f=${encodeURIComponent(encodeFlash({ ok, lines }))}`);
const me = async () => (await currentUser()) ?? redirect("/sign-in");

/** D53: price the cards (nothing is charged), then show the review. */
export async function prepareCardsAction(fd: FormData): Promise<void> {
  const u = await me();
  const [designId, designImage] = String(fd.get("design") ?? "").split("|");
  const r = await prepareCards(u, {
    kind: fd.get("kind") === "postcard" ? "postcard" : "notecard",
    size: fd.get("size") === "6x9" ? "6x9" : "4x6",
    designId: Number(designId),
    designImage: designImage ?? "",
    styleId: Number(fd.get("style")) || null,
    message: String(fd.get("message") ?? ""),
    contactIds: fd.getAll("contactIds").map(String).filter(Boolean),
  });
  if (r.ok) redirect(`/mlo/cards?d=${encodeURIComponent(r.order.id)}`);
  go("/mlo/cards", false, [r.error, ...(r.skipped?.length ? [`Left out: ${r.skipped.slice(0, 8).map((s) => `${s.name} (${s.reason})`).join("; ")}${r.skipped.length > 8 ? ` and ${r.skipped.length - 8} more` : ""}.`] : [])]);
}

export async function sendCardsAction(orderId: string): Promise<void> {
  const r = await sendCards(await me(), orderId);
  if (!r.ok) go(`/mlo/cards?d=${encodeURIComponent(orderId)}`, false, [r.error]);
  else go("/mlo/cards", true, [`Sent ${r.count} card${r.count === 1 ? "" : "s"} to Thanks.io.${r.testMode ? " Your Thanks.io account is in test mode, so Thanks.io cancels them instead of mailing. Turn test mode off in Thanks.io to mail for real." : " Thanks.io allows about an hour to cancel from its dashboard."}`]);
}

export async function discardCardsAction(orderId: string): Promise<void> {
  await discardCards(await me(), orderId);
  go("/mlo/cards", true, ["Nothing was sent."]);
}

export async function disconnectThanksAction(): Promise<void> {
  const ok = await disconnectThanks(await me());
  go("/mlo/cards", ok, [ok ? "Disconnected. To remove Command Center's access completely, also remove it in Thanks.io under API Access." : "Nothing was connected."]);
}

/** From a contact's page: no cards by mail for them (or cards again). */
export async function noMailAction(contactId: string, noMail: boolean): Promise<void> {
  const ok = await setNoMail(await me(), contactId, noMail);
  go(`/mlo/contacts/${encodeURIComponent(contactId)}`, ok, [ok ? (noMail ? "No cards by mail for them." : "Cards by mail are back on for them.") : "Couldn't change that."]);
}
