import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CcAuthShell from "@/app/mlo/CcAuthShell";
import { currentUser } from "@/lib/accounts/auth";
import { FACE_ID } from "@/lib/content/face-id";
import { safeNext } from "../fields";
import FaceIdSetup from "../FaceIdSetup";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Turn on Face ID", robots: { index: false, follow: false } };

/** /sign-in/face-id — D94: after a sign-in with "Use Face ID to sign in on this device" ticked. Signed in already. */
export default async function FaceIdPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!(await currentUser().catch(() => null))) redirect("/sign-in");
  return (
    <CcAuthShell>
      <h1>{FACE_ID.setupTitle}</h1>
      <p className="cc-auth__lede">{FACE_ID.setupLede}</p>
      <FaceIdSetup next={safeNext(next)} />
    </CcAuthShell>
  );
}
