/**
 * Where a note stops being "played" and starts being "accented".
 *
 * The threshold lives here, in the shared data layer, because three places
 * need to agree on it: the engine (which fires the accent bus), the note input
 * (which writes `accent: true` on the step) and any UI that explains it.
 */

/** MIDI velocity at or above which a note counts as accented. */
export const ACCENT_VELOCITY = 100;

/** The same threshold on the normalized 0..1 scale the engine speaks. */
export const ACCENT_VELOCITY_NORMALIZED = ACCENT_VELOCITY / 127;

/** Whether a raw MIDI velocity (0..127) should sound and write an accent. */
export function isAccentVelocity(velocity: number): boolean {
  return velocity >= ACCENT_VELOCITY;
}
