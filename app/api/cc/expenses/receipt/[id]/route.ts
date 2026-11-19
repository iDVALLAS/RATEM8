import { NextResponse } from "next/server";
import { currentUser } from "@/lib/accounts/auth";
import { expenseStore } from "@/lib/expenses/store";

/** GET /api/cc/expenses/receipt/:id — one of your own receipts (D37). Never anyone else's. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser().catch(() => null);
  if (!u) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  const r = await expenseStore().receipt(u.id, id);
  if (!r) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(r.data, "base64"), {
    headers: {
      "Content-Type": r.type,
      "Content-Disposition": `inline; filename="${r.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
