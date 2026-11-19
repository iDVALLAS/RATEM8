import { NextResponse } from "next/server";
import { currentUser } from "@/lib/accounts/auth";
import { statementCsv } from "@/lib/membership/production";

/** GET /api/cc/override/csv?month=YYYY-MM — the production share statement the sponsor pays from (D40). Owner and team leads only. */
export async function GET(req: Request) {
  const u = await currentUser().catch(() => null);
  const month = new URL(req.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const csv = u ? await statementCsv(u, month) : null;
  if (!csv) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="loanm8-production-share-${month.replace(/[^\d-]/g, "")}.csv"`, "Cache-Control": "private, no-store" } });
}
