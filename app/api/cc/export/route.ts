import { NextResponse } from "next/server";
import { currentUser } from "@/lib/accounts/auth";
import { accountStore } from "@/lib/accounts/store";
import { incr } from "@/lib/m8/kv";
import { buildExport } from "@/lib/export/service";
import { resendMail } from "@/lib/pilot/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const EXPORTS_PER_HOUR = 5;

/** POST /api/cc/export — "Download everything": your whole book as one zip (D53.1). */
export async function POST() {
  const u = await currentUser().catch(() => null);
  if (!u) return new NextResponse("Not found", { status: 404 });
  if (u.role === "assistant") return new NextResponse("Assistants can't download a loan officer's book. Ask the loan officer.", { status: 403 });
  const n = await incr(`export:${u.id}:${new Date().toISOString().slice(0, 13)}`, 3700).catch(() => 1);
  if (n > EXPORTS_PER_HOUR) return new NextResponse("That's several downloads this hour. Try again later.", { status: 429 });
  const now = new Date();
  const r = await buildExport(u, now);
  await accountStore().audit({ at: now.toISOString(), actor: u.email, action: "export.download", detail: { ...r.counts, bytes: r.file.length } });
  // A heads-up, in case it wasn't them.
  void resendMail({ to: u.email, subject: "Your Command Center data was downloaded", text: `A full download of your Command Center book (contacts, messages, notes and more) was made on ${now.toUTCString()}.\n\nIf that was you, there's nothing to do. If it wasn't, sign in, turn on Sign-in security, and tell the owner right away.` }).catch(() => false);
  return new NextResponse(new Uint8Array(r.file), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${r.filename}"`, "Cache-Control": "private, no-store" },
  });
}
