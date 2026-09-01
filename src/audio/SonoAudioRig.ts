import * as Tone from "tone";
import { defaultConnections, defaultSonoDistState } from "../sequencer/defaults";
import { isConnected, isDistPatched } from "../sequencer/patchbay";
import type { Connection, SonoDistState } from "../sequencer/types";
import type { Sono303EngineApi, Sono303EngineFactory } from "./engineApi";
import type { SonoDistEngineApi } from "./distEngineApi";
import { LiveRecorder } from "./LiveRecorder";
import { Sono303Engine } from "./Sono303Engine";
import { SonoDistEngine } from "./SonoDistEngine";

/** Cross-ramp length for plugging a lead in or out, in seconds. */
const PATCH_RAMP = 0.03;

/** Safety ceiling just below full scale — a net, not a creative stage. */
const LIMITER_THRESHOLD_DB = -1;

export type SonoAudioRigOptions = {
  createSynth?: Sono303EngineFactory;
  createDist?: () => SonoDistEngineApi;
  connections?: Connection[];
  dist?: SonoDistState;
};

/**
 * Owns the complete signal path, and with it the only route to
 * `Tone.Destination`.
 *
 * Every module's output is a permanent bus, and the patchbay is nothing but a
 * set of gains between those buses:
 *
 *     synth ─► #dry ─┬─► #dryToDist ──► dist ─► #wet ─┬─► #wetToMonitor ─┐
 *                    ├─► #dryToMonitor ──────────────────────────────────┼─► #monitor ─► limiter ─► out
 *                    └─► #dryToTape ─┐                └─► #wetToTape ─┐  │
 *                                    └──────────────► #tapeBus ◄─────┘
 *                                                        └─► live recorder
 *
 * Nothing is ever `connect`ed or `disconnect`ed while audio may be running —
 * repatching only cross-ramps gains, so moving a lead cannot click.
 *
 * What you hear is the end of the chain: SONO-DIST when it is patched in, the
 * bare instrument otherwise. What SONO-TAPE captures is whatever is plugged
 * into its own IN, which is deliberately allowed to differ — patching the
 * instrument straight to the recorder while monitoring through the distortion
 * is a real thing to want.
 */
export class SonoAudioRig {
  readonly synth: Sono303EngineApi;
  readonly dist: SonoDistEngineApi;
  /**
   * SONO-TAPE's live capture tap.
   *
   * It does not break the one-route-out rule: the tap is an
   * `AudioWorkletNode` with zero outputs, so it is a leaf that listens rather
   * than a second path to the destination. It also stays dormant — no worklet
   * is even loaded — until the first REC press.
   */
  readonly recorder = new LiveRecorder();

  /** SONO-303's OUT jack, as a bus. */
  readonly #dry = new Tone.Gain(1);
  /** SONO-DIST's OUT jack, as a bus. */
  readonly #wet = new Tone.Gain(1);

  /** One gain per possible lead. 1 means plugged, 0 means not. */
  readonly #dryToDist = new Tone.Gain(0);
  readonly #dryToMonitor = new Tone.Gain(0);
  readonly #dryToTape = new Tone.Gain(0);
  readonly #wetToMonitor = new Tone.Gain(0);
  readonly #wetToTape = new Tone.Gain(0);

  /** Sums whatever reaches the speakers. */
  readonly #monitor = new Tone.Gain(1);
  /** Sums whatever reaches SONO-TAPE's IN. */
  readonly #tapeBus = new Tone.Gain(1);
  readonly #limiter = new Tone.Limiter(LIMITER_THRESHOLD_DB);

  #disposed = false;

  constructor(options: SonoAudioRigOptions = {}) {
    const {
      createSynth = () => new Sono303Engine(),
      createDist = () => new SonoDistEngine(options.dist ?? defaultSonoDistState),
      connections = defaultConnections,
    } = options;

    this.synth = createSynth();
    this.dist = createDist();

    this.synth.connectOutput(this.#dry);
    this.dist.connect(this.#wet);

    this.#dry.connect(this.#dryToDist);
    this.#dryToDist.connect(this.dist.input);

    this.#dry.connect(this.#dryToMonitor);
    this.#dry.connect(this.#dryToTape);
    this.#wet.connect(this.#wetToMonitor);
    this.#wet.connect(this.#wetToTape);

    this.#dryToMonitor.connect(this.#monitor);
    this.#wetToMonitor.connect(this.#monitor);
    this.#dryToTape.connect(this.#tapeBus);
    this.#wetToTape.connect(this.#tapeBus);

    this.#monitor.chain(this.#limiter, Tone.getDestination());
    this.recorder.setSource(this.#tapeBus);

    this.#applyRouting(connections, 0);
  }

  /** Re-derives every routing gain from the connection list. */
  setConnections(connections: Connection[]): void {
    if (this.#disposed) return;
    this.#applyRouting(connections, PATCH_RAMP);
  }

  /** Disposes everything the rig owns. Never touches `Tone.Destination`. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.recorder.dispose();
    this.synth.dispose();
    this.dist.dispose();
    for (const node of [
      this.#dry,
      this.#wet,
      this.#dryToDist,
      this.#dryToMonitor,
      this.#dryToTape,
      this.#wetToMonitor,
      this.#wetToTape,
      this.#monitor,
      this.#tapeBus,
      this.#limiter,
    ]) {
      node.dispose();
    }
  }

  /**
   * Opposed linear ramps rather than a `Tone.CrossFade`: in BYPASS both
   * branches carry the same signal, and an equal-power fade would put a ~3 dB
   * bump in the middle of every repatch.
   */
  #applyRouting(connections: Connection[], ramp: number): void {
    const distPatched = isDistPatched(connections);

    const set = (gain: Tone.Gain, on: boolean): void => {
      const value = on ? 1 : 0;
      if (ramp <= 0) gain.gain.value = value;
      else gain.gain.rampTo(value, ramp);
    };

    set(this.#dryToDist, distPatched);
    // The speakers hear the end of the chain: SONO-DIST when the instrument
    // runs through it, the bare instrument otherwise. Never both, or the dry
    // signal would double the processed one and BYPASS would mean nothing.
    set(this.#wetToMonitor, distPatched);
    set(this.#dryToMonitor, !distPatched);

    // SONO-TAPE hears only what is plugged into its own IN. Nothing plugged in
    // means it genuinely records silence — the cable is the truth.
    set(this.#dryToTape, isConnected(connections, "sono303.out", "tape.in"));
    set(this.#wetToTape, isConnected(connections, "dist.out", "tape.in"));
  }
}
