import { NextResponse } from "next/server";
import { signOut } from "@/lib/accounts/auth";

/** POST /api/cc/signout — ends this browser's Command Center session (D1). */
export async function POST(req: Request) {
  await signOut().catch(() => {});
  return NextResponse.redirect(new URL("/sign-in?e=out", req.url), 303);
}
