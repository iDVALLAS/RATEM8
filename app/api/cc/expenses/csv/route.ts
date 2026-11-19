import { NextResponse } from "next/server";
import { currentUser } from "@/lib/accounts/auth";
import { pacificToday, yearCsv } from "@/lib/expenses/service";

/** GET /api/cc/expenses/csv?year= — the year's entries for your CPA's spreadsheet (D37). */
export async function GET(req: Request) {
  const u = await currentUser().catch(() => null);
  if (!u) return new NextResponse("Not found", { status: 404 });
  const now = Number(pacificToday().slice(0, 4));
  const y = Number(new URL(req.url).searchParams.get("year"));
  const year = y >= 2020 && y <= now ? y : now;
  return new NextResponse(await yearCsv(u, year), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="loanm8-business-${year}.csv"`, "Cache-Control": "private, no-store" },
  });
}
