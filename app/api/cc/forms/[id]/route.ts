import { currentUser } from "@/lib/accounts/auth";
import { formBytes } from "@/lib/forms/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/cc/forms/[id] — one form as a PDF (D66). Signed in; only forms
 * on a loan the person can see, or in their own library. Never cached.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  const r = await formBytes(u, id).catch(() => null);
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(r.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${r.form.name.replace(/[^\w .()-]/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
