import { describe, expect, it } from "vitest";
import { KEY_TO_SEMITONE, codeToSemitone, semitoneToKeyLabel } from "./keyMap";

/** The 24 semitones the mini keyboard actually shows. */
const VISIBLE = Array.from({ length: 24 }, (_, index) => index);

describe("KEY_TO_SEMITONE", () => {
  it("starts the lower row on C and the upper row an octave up", () => {
    expect(KEY_TO_SEMITONE.KeyZ).toBe(0);
    expect(KEY_TO_SEMITONE.KeyM).toBe(11);
    expect(KEY_TO_SEMITONE.KeyQ).toBe(12);
    expect(KEY_TO_SEMITONE.KeyU).toBe(23);
  });

  it("puts the black keys where a piano does", () => {
    // S/D sit above Z/X — C#/D# over C/D — with nothing above E.
    expect(KEY_TO_SEMITONE.KeyS).toBe(1);
    expect(KEY_TO_SEMITONE.KeyD).toBe(3);
    expect(KEY_TO_SEMITONE.KeyG).toBe(6);
    expect(KEY_TO_SEMITONE.Digit2).toBe(13);
    expect("KeyF" in KEY_TO_SEMITONE).toBe(false);
    expect("KeyA" in KEY_TO_SEMITONE).toBe(false);
  });

  it("lets both rows reach the notes where they overlap", () => {
    // Comma and Q are the same note: the lower row runs five semitones past
    // the point the upper row starts.
    expect(KEY_TO_SEMITONE.Comma).toBe(KEY_TO_SEMITONE.KeyQ);
    expect(KEY_TO_SEMITONE.Slash).toBe(KEY_TO_SEMITONE.KeyE);
  });

  it("reaches above the window the keyboard shows", () => {
    expect(KEY_TO_SEMITONE.KeyP).toBe(28);
  });
});

describe("codeToSemitone", () => {
  it("returns null for keys that are not notes", () => {
    expect(codeToSemitone("Space")).toBeNull();
    expect(codeToSemitone("ArrowUp")).toBeNull();
    expect(codeToSemitone("KeyZ")).toBe(0);
  });
});

describe("semitoneToKeyLabel", () => {
  it("labels every key the mini keyboard shows", () => {
    for (const semitone of VISIBLE) {
      expect(semitoneToKeyLabel(semitone)).not.toBeNull();
    }
  });

  it("gives each visible key a distinct cap", () => {
    const labels = VISIBLE.map(semitoneToKeyLabel);
    expect(new Set(labels).size).toBe(VISIBLE.length);
  });

  it("prefers the upper row where the two rows overlap", () => {
    // Offset 12 is both `,` and `Q`; the hints should read as two clean rows.
    expect(semitoneToKeyLabel(12)).toBe("Q");
    expect(semitoneToKeyLabel(16)).toBe("E");
  });

  it("has nothing to print for an unmapped semitone", () => {
    expect(semitoneToKeyLabel(29)).toBeNull();
    expect(semitoneToKeyLabel(-1)).toBeNull();
  });

  it("prints a cap that really plays that note", () => {
    // The hint is only useful if pressing the key it names produces the note
    // it is printed on. Letters and digits map back to `Key…`/`Digit…` codes.
    for (const semitone of VISIBLE) {
      const label = semitoneToKeyLabel(semitone);
      const code = /[0-9]/.test(label!) ? `Digit${label}` : `Key${label}`;
      expect(codeToSemitone(code)).toBe(semitone);
    }
  });
});
