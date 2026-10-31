import { requireAdmin } from "@/lib/mlo/auth";
import { getStore } from "@/lib/pricing/store";

/**
 * GET /mlo/source/{sha256} — a private pricing screenshot or PDF, for the
 * loan officer only (v37). Middleware gates /mlo/*; this re-checks.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sniff(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x25 && b[1] === 0x50) return "application/pdf";
  return "application/octet-stream";
}

export async function GET(_req: Request, { params }: { params: Promise<{ sha: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const { sha } = await params;
  const bytes = await getStore().getSource(sha);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": sniff(bytes), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } });
}
