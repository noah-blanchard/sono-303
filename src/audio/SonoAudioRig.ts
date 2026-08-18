import * as Tone from "tone";
import { defaultSonoDistState } from "../sequencer/defaults";
import type { SonoDistState } from "../sequencer/types";
import type { Sono303EngineApi, Sono303EngineFactory } from "./engineApi";
import type { SonoDistEngineApi } from "./distEngineApi";
import { Sono303Engine } from "./Sono303Engine";
import { SonoDistEngine } from "./SonoDistEngine";

/** Cross-ramp length for plugging the cable in or out, in seconds. */
const PATCH_RAMP = 0.03;

/** Safety ceiling just below full scale — a net, not a creative stage. */
const LIMITER_THRESHOLD_DB = -1;

export type SonoAudioRigOptions = {
  createSynth?: Sono303EngineFactory;
  createDist?: () => SonoDistEngineApi;
  patched?: boolean;
  dist?: SonoDistState;
};

/**
 * Owns the complete signal path, and with it the only route to
 * `Tone.Destination`:
 *
 *     synth.output ─┬─► direct ───────────────────────────┐
 *                   │                                     ├─► master ─► limiter ─► out
 *                   └─► dist.input ► dist.output ► patched┘
 *
 * Both branches stay connected for the whole session; the patch cable only
 * cross-ramps two gains. Nothing is ever `connect`ed or `disconnect`ed while
 * audio is running, so plugging in cannot click, and the dry signal can never
 * leak out alongside the processed one.
 *
 * This class exists so no Tone.js object has to live in React: `useSono303`
 * holds one rig reference and pushes serializable state into it.
 */
export class SonoAudioRig {
  readonly synth: Sono303EngineApi;
  readonly dist: SonoDistEngineApi;

  /** Unplugged branch: the bare instrument. */
  readonly #direct = new Tone.Gain(1);
  /** Plugged branch: the instrument through SONO-DIST. */
  readonly #patched = new Tone.Gain(0);
  /** Sums both branches. Unity today; the insertion point for a master trim. */
  readonly #master = new Tone.Gain(1);
  readonly #limiter = new Tone.Limiter(LIMITER_THRESHOLD_DB);

  #isPatched: boolean;
  #disposed = false;

  constructor(options: SonoAudioRigOptions = {}) {
    const {
      createSynth = () => new Sono303Engine(),
      createDist = () => new SonoDistEngine(options.dist ?? defaultSonoDistState),
      patched = false,
    } = options;

    this.synth = createSynth();
    this.dist = createDist();
    this.#isPatched = patched;

    this.synth.connectOutput(this.#direct);
    this.synth.connectOutput(this.dist.input);
    this.dist.connect(this.#patched);

    this.#direct.connect(this.#master);
    this.#patched.connect(this.#master);
    this.#master.chain(this.#limiter, Tone.getDestination());

    this.#direct.gain.value = patched ? 0 : 1;
    this.#patched.gain.value = patched ? 1 : 0;
  }

  /**
   * Moves the patch cable. Linear opposed ramps rather than a `Tone.CrossFade`
   * on purpose: in BYPASS both branches carry the same signal, and an
   * equal-power fade would put a ~3 dB bump in the middle of every plug-in.
   */
  setPatched(patched: boolean): void {
    if (this.#disposed || patched === this.#isPatched) return;
    this.#isPatched = patched;
    this.#direct.gain.rampTo(patched ? 0 : 1, PATCH_RAMP);
    this.#patched.gain.rampTo(patched ? 1 : 0, PATCH_RAMP);
  }

  /** Disposes everything the rig owns. Never touches `Tone.Destination`. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.synth.dispose();
    this.dist.dispose();
    this.#direct.dispose();
    this.#patched.dispose();
    this.#master.dispose();
    this.#limiter.dispose();
  }
}
