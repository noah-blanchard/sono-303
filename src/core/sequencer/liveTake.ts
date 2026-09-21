import { barsToSeconds } from "./tape";

/**
 * Pure timing and formatting for a live SONO-TAPE take.
 *
 * Framework-free and Web-Audio-free, so the bar-snapping arithmetic — the part
 * that decides whether a recording lands on the grid — is unit-testable.
 */

/**
 * Longest take the recorder will hold, in seconds.
 *
 * Live capture accumulates Float32 in memory at 192 KB/s, so five minutes is
 * about 57 MB. Past that the recorder stops itself rather than growing until
 * the tab dies.
 */
export const LIVE_MAX_SECONDS = 300;

/**
 * How far ahead of the transport a boundary must sit to be schedulable.
 *
 * `Transport.schedule` silently drops an event in the past, and pressing a
 * button a millisecond before a downbeat is exactly how that happens. A
 * boundary closer than this is skipped in favour of the next one.
 */
export const MIN_LEAD_SECONDS = 0.05;

/**
 * The first bar boundary comfortably after `transportSeconds`.
 *
 * Used for both ends of a snapped take: capture opens on one boundary and runs
 * to another, so a take is always a whole number of bars.
 */
export function nextBarSeconds(
  transportSeconds: number,
  tempoBpm: number,
  minLeadSeconds: number = MIN_LEAD_SECONDS,
): number {
  const bar = barsToSeconds(1, tempoBpm);
  const elapsedBars = Math.floor(transportSeconds / bar);
  let boundary = (elapsedBars + 1) * bar;
  // Landing inside the lead window means the event would very likely be dropped
  // as already past; take the following bar instead.
  if (boundary - transportSeconds < minLeadSeconds) boundary += bar;
  return boundary;
}

/** Whole bars spanned by a take, for the file name and the readout. */
export function barsBetween(
  beginSeconds: number,
  endSeconds: number,
  tempoBpm: number,
): number {
  const bar = barsToSeconds(1, tempoBpm);
  return Math.max(1, Math.round((endSeconds - beginSeconds) / bar));
}

/** `MM:SS.T` — the running time on the recorder's display. */
export function framesToClock(frames: number, sampleRate: number): string {
  if (sampleRate <= 0 || !Number.isFinite(frames) || frames < 0) return "00:00.0";
  const totalSeconds = frames / sampleRate;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds * 10) % 10);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}.${tenths}`;
}

/**
 * Name for a live take, e.g. `SONO-303_live_125bpm_20260831-1955.wav`.
 *
 * `live` sits in the name so a take and a bounce are distinguishable at a
 * glance in a sample folder, where they otherwise look identical.
 */
export function liveFileName(tempoBpm: number, stamp: string): string {
  return `SONO-303_live_${Math.round(tempoBpm)}bpm_${stamp}.wav`;
}
