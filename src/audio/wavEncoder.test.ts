import { describe, expect, it } from "vitest";
import { encodeWavMono24 } from "./wavEncoder";

/**
 * The encoder is the one place where a mistake is silent: a wrong header field
 * still produces a file, it just opens as noise or refuses to load. So the
 * assertions read the bytes back rather than trusting the writer.
 */

const HEADER_BYTES = 44;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function tag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + 4));
}

/** Reads one 24-bit little-endian sample back as a signed integer. */
function readSample(bytes: Uint8Array, index: number): number {
  const offset = HEADER_BYTES + index * 3;
  const unsigned =
    bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
  // Sign-extend from 24 bits.
  return unsigned >= 0x800000 ? unsigned - 0x1000000 : unsigned;
}

describe("encodeWavMono24", () => {
  it("writes a 44-byte header followed by three bytes per sample", () => {
    const bytes = encodeWavMono24(new Float32Array(10), 48000);
    expect(bytes.byteLength).toBe(HEADER_BYTES + 10 * 3);
  });

  it("writes the RIFF/WAVE chunk tags", () => {
    const bytes = encodeWavMono24(new Float32Array(4), 48000);
    expect(tag(bytes, 0)).toBe("RIFF");
    expect(tag(bytes, 8)).toBe("WAVE");
    expect(tag(bytes, 12)).toBe("fmt ");
    expect(tag(bytes, 36)).toBe("data");
  });

  it("declares 24-bit mono PCM at the given rate", () => {
    const bytes = encodeWavMono24(new Float32Array(8), 44100);
    const dv = view(bytes);
    expect(dv.getUint32(16, true)).toBe(16); // fmt chunk body size
    expect(dv.getUint16(20, true)).toBe(1); // WAVE_FORMAT_PCM
    expect(dv.getUint16(22, true)).toBe(1); // mono
    expect(dv.getUint32(24, true)).toBe(44100);
    expect(dv.getUint32(28, true)).toBe(44100 * 3); // byte rate
    expect(dv.getUint16(32, true)).toBe(3); // block align
    expect(dv.getUint16(34, true)).toBe(24); // bits per sample
  });

  it("writes chunk sizes that agree with the payload", () => {
    const bytes = encodeWavMono24(new Float32Array(7), 48000);
    const dv = view(bytes);
    const dataBytes = 7 * 3;
    expect(dv.getUint32(40, true)).toBe(dataBytes);
    expect(dv.getUint32(4, true)).toBe(36 + dataBytes);
  });

  it("maps silence and full scale onto the 24-bit range", () => {
    const bytes = encodeWavMono24(new Float32Array([0, 1, -1]), 48000);
    expect(readSample(bytes, 0)).toBe(0);
    expect(readSample(bytes, 1)).toBe(8388607);
    expect(readSample(bytes, 2)).toBe(-8388607);
  });

  // The limiter is a fast compressor, not a brickwall, so an overshoot really
  // can arrive here. Without the clamp it would wrap into a loud click.
  it("clamps overshoot instead of wrapping", () => {
    const bytes = encodeWavMono24(new Float32Array([2, -2, 1e9]), 48000);
    expect(readSample(bytes, 0)).toBe(8388607);
    expect(readSample(bytes, 1)).toBe(-8388607);
    expect(readSample(bytes, 2)).toBe(8388607);
  });

  // Silence rather than full scale: a non-finite sample means something has
  // already gone wrong upstream, and a burst of full-scale noise is the worst
  // possible way to report it.
  it("writes silence for non-finite samples", () => {
    const bytes = encodeWavMono24(
      new Float32Array([NaN, Infinity, -Infinity]),
      48000,
    );
    expect(readSample(bytes, 0)).toBe(0);
    expect(readSample(bytes, 1)).toBe(0);
    expect(readSample(bytes, 2)).toBe(0);
  });

  it("writes samples little-endian", () => {
    // 0.5 * 8388607 = 4194303.5, rounded to 4194304 = 0x400000.
    const bytes = encodeWavMono24(new Float32Array([0.5]), 48000);
    expect(bytes[HEADER_BYTES]).toBe(0x00);
    expect(bytes[HEADER_BYTES + 1]).toBe(0x00);
    expect(bytes[HEADER_BYTES + 2]).toBe(0x40);
  });

  it("encodes an empty buffer as a valid, empty file", () => {
    const bytes = encodeWavMono24(new Float32Array(0), 48000);
    expect(bytes.byteLength).toBe(HEADER_BYTES);
    expect(view(bytes).getUint32(40, true)).toBe(0);
  });
});
