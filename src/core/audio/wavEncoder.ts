/**
 * Minimal 24-bit mono WAV encoder.
 *
 * Pure and framework-free, like `stepLogic.ts` and `distortionCurves.ts`, so it
 * is unit-testable without an AudioContext. It deliberately returns raw bytes
 * rather than a `Blob`: `Blob` is a DOM type, and keeping it out lets the whole
 * encoder run in the node test environment. The caller wraps the result.
 *
 * The output is canonical `WAVE_FORMAT_PCM` (format tag 1) with 24-bit samples,
 * which every major DAW reads. `WAVE_FORMAT_EXTENSIBLE` buys nothing here.
 */

/** Header size for canonical PCM: RIFF + fmt (16) + data chunk headers. */
const HEADER_BYTES = 44;

/** 24-bit samples are three bytes each. */
const BYTES_PER_SAMPLE = 3;

const CHANNELS = 1;

/** Largest positive value a 24-bit two's-complement sample can hold. */
const PEAK = 8388607; // 2^23 - 1

/**
 * Converts one float sample to a 24-bit integer.
 *
 * Clamping is not optional even though a `Tone.Limiter(-1)` guards the bus: a
 * limiter is a very fast compressor, not a brickwall, and a sharp transient can
 * still overshoot full scale. Without the clamp the wrap-around would come back
 * as a loud click. Non-finite input is mapped to silence before the comparison,
 * because `NaN` survives `Math.min`/`Math.max` and then `NaN & 0xff` is a
 * silent zero at one byte and garbage at the next.
 */
function toInt24(sample: number): number {
  const finite = Number.isFinite(sample) ? sample : 0;
  const clamped = finite > 1 ? 1 : finite < -1 ? -1 : finite;
  return Math.round(clamped * PEAK);
}

/** Writes four ASCII characters at `offset`. */
function writeTag(bytes: Uint8Array, offset: number, tag: string): void {
  for (let i = 0; i < tag.length; i += 1) {
    bytes[offset + i] = tag.charCodeAt(i);
  }
}

/**
 * Encodes mono float samples as a 24-bit PCM WAV file.
 *
 * @param samples    Audio in the usual −1..1 float range.
 * @param sampleRate Rate to declare in the header. Pass the rate the audio was
 *                   actually rendered at, not the one that was requested.
 */
export function encodeWavMono24(
  samples: Float32Array,
  sampleRate: number,
): Uint8Array<ArrayBuffer> {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  // Explicitly a plain ArrayBuffer, never shared: the bytes go straight into a
  // Blob, and `BlobPart` will not accept a SharedArrayBuffer-backed view.
  const bytes = new Uint8Array(new ArrayBuffer(HEADER_BYTES + dataBytes));
  const view = new DataView(bytes.buffer);

  writeTag(bytes, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true); // everything after this field
  writeTag(bytes, 8, "WAVE");

  writeTag(bytes, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk body size
  view.setUint16(20, 1, true); // WAVE_FORMAT_PCM
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * CHANNELS * BYTES_PER_SAMPLE, true); // byte rate
  view.setUint16(32, CHANNELS * BYTES_PER_SAMPLE, true); // block align
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true); // bits per sample

  writeTag(bytes, 36, "data");
  view.setUint32(40, dataBytes, true);

  // Little-endian three-byte two's complement. Taking the low 24 bits of the
  // 32-bit representation is already the correct encoding for negatives.
  let offset = HEADER_BYTES;
  for (let i = 0; i < samples.length; i += 1) {
    const value = toInt24(samples[i]);
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >> 8) & 0xff;
    bytes[offset + 2] = (value >> 16) & 0xff;
    offset += BYTES_PER_SAMPLE;
  }

  return bytes;
}
