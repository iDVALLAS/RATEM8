"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/accounts/auth";
import { encodeFlash } from "@/lib/mlo/flash";
import { answerWithM8, removeTemplate, saveTemplate, writeWithM8, type AnswerResult, type WriteResult } from "@/lib/templates/service";

async function me() {
  const u = await currentUser();
  if (!u) redirect("/sign-in");
  return u;
}

export async function answerAction(said: string, who: string): Promise<AnswerResult> {
  return answerWithM8(said, who, { user: await me() });
}

export async function writeAction(what: string, kind: string, channel: string): Promise<WriteResult> {
  return writeWithM8({ what, kind, channel }, { user: await me() });
}

/** Bound to the template id (null for a new one). */
export async function saveTemplateAction(templateId: string | null, fd: FormData): Promise<void> {
  const r = await saveTemplate(await me(), templateId, {
    kind: String(fd.get("kind") ?? ""),
    channel: String(fd.get("channel") ?? ""),
    title: String(fd.get("title") ?? ""),
    subject: String(fd.get("subject") ?? ""),
    body: String(fd.get("body") ?? ""),
    objection: String(fd.get("objection") ?? ""),
    shared: fd.get("shared") === "yes",
  });
  redirect(`/mlo/templates?f=${encodeFlash({ ok: r.ok, lines: [r.ok ? "Saved. It's at the top of the list." : r.error] })}${r.ok ? "#list" : "#make"}`);
}

export async function removeTemplateAction(templateId: string): Promise<void> {
  await removeTemplate(await me(), templateId);
  redirect(`/mlo/templates?f=${encodeFlash({ ok: true, lines: ["Removed."] })}#list`);
}
