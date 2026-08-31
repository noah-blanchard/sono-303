/**
 * Computer-keyboard note map, FL Studio layout.
 *
 * Keyed by `KeyboardEvent.code` — physical key position, not the letter
 * printed on the cap. That is what FL Studio does, and it is what keeps the
 * note rows in the same two physical bands whatever layout the OS is set to.
 * On an AZERTY board the key labelled `W` sits where QWERTY puts `Z`, so it
 * plays the low C and is labelled `Z` on screen: the position is the contract.
 *
 * Values are semitone offsets from the bottom of the keyboard window (the
 * octave the OCT −/+ buttons point at), so moving the window moves both rows.
 */

/** Lower row: base octave, C upwards, black keys on the home row above it. */
const LOWER_ROW: ReadonlyArray<readonly [string, string]> = [
  ["KeyZ", "Z"],
  ["KeyS", "S"],
  ["KeyX", "X"],
  ["KeyD", "D"],
  ["KeyC", "C"],
  ["KeyV", "V"],
  ["KeyG", "G"],
  ["KeyB", "B"],
  ["KeyH", "H"],
  ["KeyN", "N"],
  ["KeyJ", "J"],
  ["KeyM", "M"],
  ["Comma", ","],
  ["KeyL", "L"],
  ["Period", "."],
  ["Semicolon", ";"],
  ["Slash", "/"],
];

/** Upper row: one octave above the lower row, starting on Q. */
const UPPER_ROW: ReadonlyArray<readonly [string, string]> = [
  ["KeyQ", "Q"],
  ["Digit2", "2"],
  ["KeyW", "W"],
  ["Digit3", "3"],
  ["KeyE", "E"],
  ["KeyR", "R"],
  ["Digit5", "5"],
  ["KeyT", "T"],
  ["Digit6", "6"],
  ["KeyY", "Y"],
  ["Digit7", "7"],
  ["KeyU", "U"],
  ["KeyI", "I"],
  ["Digit9", "9"],
  ["KeyO", "O"],
  ["Digit0", "0"],
  ["KeyP", "P"],
];

/** Semitone the upper row starts on. */
const UPPER_ROW_OFFSET = 12;

function buildKeyToSemitone(): Record<string, number> {
  const map: Record<string, number> = {};
  LOWER_ROW.forEach(([code], index) => {
    map[code] = index;
  });
  UPPER_ROW.forEach(([code], index) => {
    map[code] = UPPER_ROW_OFFSET + index;
  });
  return map;
}

/**
 * Every playable key, as `code` → semitone offset from the window's base
 * octave. The two rows overlap at offsets 12–16, so those notes have two
 * working bindings; both sound, only the upper-row one is labelled.
 *
 * The map deliberately reaches past the 24 keys the mini keyboard shows —
 * offsets 24–28 play above the window and simply have no key to light up.
 */
export const KEY_TO_SEMITONE: Readonly<Record<string, number>> =
  buildKeyToSemitone();

function buildSemitoneToLabel(): Record<number, string> {
  const labels: Record<number, string> = {};
  // Lower row first, upper row second: where the rows overlap the upper row's
  // label wins, so the on-screen hints read as two clean, contiguous rows.
  LOWER_ROW.forEach(([, label], index) => {
    labels[index] = label;
  });
  UPPER_ROW.forEach(([, label], index) => {
    labels[UPPER_ROW_OFFSET + index] = label;
  });
  return labels;
}

const SEMITONE_TO_LABEL = buildSemitoneToLabel();

/** Key cap to print on the mini keyboard, or `null` for unmapped semitones. */
export function semitoneToKeyLabel(offset: number): string | null {
  return SEMITONE_TO_LABEL[offset] ?? null;
}

/** Semitone offset a physical key plays, or `null` if it is not a note key. */
export function codeToSemitone(code: string): number | null {
  return code in KEY_TO_SEMITONE ? KEY_TO_SEMITONE[code] : null;
}
