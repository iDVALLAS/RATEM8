import { describe, expect, it } from "vitest";
import { downsample, MAX_LISTEN_BYTES, peak, toPcm16 } from "./pcm";

describe("microphone audio (C16)", () => {
  it("joins chunks and averages 48 kHz down to 16 kHz", () => {
    const out = downsample([new Float32Array([0.3, 0.3, 0.3]), new Float32Array([0.6, 0.6, 0.6])], 48_000);
    expect(Array.from(out).map((x) => Math.round(x * 10) / 10)).toEqual([0.3, 0.6]);
  });

  it("passes 16 kHz through unchanged", () => {
    expect(Array.from(downsample([new Float32Array([0.5, -0.5])], 16_000))).toEqual([0.5, -0.5]);
  });

  it("writes little-endian 16-bit samples, clipped", () => {
    const b = toPcm16(new Float32Array([0, 1, -1, 2]));
    const v = new DataView(b.buffer);
    expect([v.getInt16(0, true), v.getInt16(2, true), v.getInt16(4, true), v.getInt16(6, true)]).toEqual([0, 32767, -32768, 32767]);
  });

  it("measures the loudest sample and caps uploads at 30 seconds", () => {
    expect(peak(new Float32Array([0.1, -0.4, 0.2]))).toBeCloseTo(0.4);
    expect(MAX_LISTEN_BYTES).toBe(16_000 * 2 * 30);
  });
});
