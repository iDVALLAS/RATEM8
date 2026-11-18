/** lib/pipeline/keys.ts — per-loan-officer keys for the loan intake (D6). SERVER-ONLY. */
import { createHash, randomBytes } from "node:crypto";
import { pipelineStore } from "./store";

export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

/** A new key, shown once; only its hash is kept. */
export async function createKey(ownerUserId: string, label: string, now = new Date()): Promise<string> {
  const key = `cck_${randomBytes(24).toString("base64url")}`;
  await pipelineStore().putKey({ hash: hashKey(key), ownerUserId, label: label.trim().slice(0, 60) || "Loan system", createdAt: now.toISOString() });
  return key;
}

export async function ownerForKey(key: string | null): Promise<string | null> {
  if (!key || !/^cck_[A-Za-z0-9_-]{32}$/.test(key)) return null;
  return pipelineStore().keyOwner(hashKey(key));
}
