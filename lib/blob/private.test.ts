import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blobAddress, blobOn, browserUploadOn, readMedia, signMedia, streamFile, type Getter } from "./private";

const NOW = new Date("2026-11-20T18:00:00Z");
const PRIV = "https://abc123.private.blob.vercel-storage.com/voicemail/lo1/1-x.wav";

describe("Private Blob store (D65.1)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.CC_LINK_SECRET = "test-secret";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is on with the store id or the read-write token; browser uploads need the token", () => {
    expect(blobOn()).toBe(false);
    process.env.BLOB_STORE_ID = "store_x";
    expect(blobOn()).toBe(true);
    expect(browserUploadOn()).toBe(false);
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_x";
    expect(browserUploadOn()).toBe(true);
  });

  it("reads only Vercel Blob addresses, and knows private from public", () => {
    expect(blobAddress(PRIV)).toEqual({ url: PRIV, pathname: "voicemail/lo1/1-x.wav", access: "private" });
    expect(blobAddress("https://abc123.public.blob.vercel-storage.com/videos/lo1/a.webm")?.access).toBe("public");
    for (const bad of ["http://abc.private.blob.vercel-storage.com/x", "https://evil.com/x", "https://abc.private.blob.vercel-storage.com.evil.com/x", "https://abc.private.blob.vercel-storage.com/..%2Fx", "https://u:p@abc.private.blob.vercel-storage.com/x"]) expect(blobAddress(bad)).toBeNull();
  });

  it("signs one recording's address for an hour; a changed id, signature or an expired one fails", () => {
    const q = new URLSearchParams(signMedia("vm", "vm_abc", NOW)!);
    expect(readMedia("vm", q, NOW)).toBe("vm_abc");
    expect(readMedia("vm", q, new Date(NOW.getTime() + 59 * 60_000))).toBe("vm_abc");
    expect(readMedia("vm", q, new Date(NOW.getTime() + 61 * 60_000))).toBeNull();
    expect(readMedia("video", q, NOW)).toBeNull();
    const other = new URLSearchParams(q);
    other.set("id", "vm_other");
    expect(readMedia("vm", other, NOW)).toBeNull();
    const later = new URLSearchParams(q);
    later.set("e", String(Number(q.get("e")) + 3600));
    expect(readMedia("vm", later, NOW)).toBeNull();
    const tampered = new URLSearchParams(q);
    tampered.set("s", `${q.get("s")!.slice(0, -1)}${q.get("s")!.endsWith("A") ? "B" : "A"}`);
    expect(readMedia("vm", tampered, NOW)).toBeNull();
    delete process.env.CC_LINK_SECRET;
    expect(signMedia("vm", "vm_abc", NOW)).toBeNull();
  });

  it("streams a private file with its range, asking the store as private, and never shows the address", async () => {
    const calls: { url: string; access: string; range?: string }[] = [];
    const getter: Getter = async (url, o) => {
      calls.push({ url, access: o.access, range: o.headers?.Range });
      return { stream: new Response("abc").body!, contentType: "audio/wav", length: "3", range: o.headers?.Range ? "bytes 0-2/10" : null };
    };
    const full = await streamFile(PRIV, new Request("https://x.test/a"), {}, getter);
    expect(full.status).toBe(200);
    expect(full.headers.get("cache-control")).toBe("private, no-store");
    expect(await full.text()).toBe("abc");
    const part = await streamFile(PRIV, new Request("https://x.test/a", { headers: { Range: "bytes=0-2" } }), {}, getter);
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 0-2/10");
    expect(calls).toEqual([{ url: PRIV, access: "private", range: undefined }, { url: PRIV, access: "private", range: "bytes=0-2" }]);
    expect([...full.headers.values()].join(" ")).not.toContain("blob.vercel-storage.com");
    expect((await streamFile("https://evil.com/x", null, {}, getter)).status).toBe(404);
    expect((await streamFile(PRIV, null, {}, async () => null)).status).toBe(404);
  });
});
