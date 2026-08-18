import type { InputNode } from "tone";
import type { DistortionMode, SonoDistState } from "../sequencer/types";

/**
 * Complete public contract of the SONO-DIST effect engine.
 *
 * Like `Sono303EngineApi`, implementations are framework-free: no React, no
 * DOM, no reducer actions. Every setter takes the same normalized 0..1 values
 * the reducer stores, and clamps them itself.
 */
export type SonoDistEngineApi = {
  /** Effect input. Feed the instrument here; safe to connect before playback. */
  readonly input: InputNode;
  /** Effect output, already crossfaded between the dry and processed paths. */
  readonly output: InputNode;
  /** 0..1 — pre-gain into the shaper plus the severity of the mode's curve. */
  setDrive(value: number): void;
  /** 0..1 — post-shaper low-pass, 650 Hz to 16 kHz. */
  setTone(value: number): void;
  /** 0..1 — output trim of the processed path only, -24 dB to +3 dB. */
  setLevel(value: number): void;
  /** Selects a voicing, or `bypass` for a true dry path. Anti-click. */
  setMode(mode: DistortionMode): void;
  /** Applies a whole state object at once; the React bridge uses this. */
  setState(state: SonoDistState): void;
  /** Routes the effect output onward. */
  connect(destination: InputNode): void;
  /** Detaches the effect output without destroying anything. */
  disconnect(): void;
  /** Cancels pending transitions and disposes every owned node. Idempotent. */
  dispose(): void;
};
