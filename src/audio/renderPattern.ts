import * as Tone from "tone";
import { EXPORT_SAMPLE_RATE, barsToSamples } from "../sequencer/tape";
import type {
  Connection,
  Pattern,
  SonoDistState,
  SynthParameters,
} from "../sequencer/types";
import { SonoAudioRig } from "./SonoAudioRig";

/**
 * Offline bounce of the step phrase (SONO-TAPE).
 *
 * The whole trick is that nothing in `src/audio/` captures an AudioContext at
 * import time: every touchpoint goes through `Tone.getContext()`,
 * `getTransport()` or `getDestination()`, resolved when it is called. So
 * building a *fresh* `SonoAudioRig` inside a `Tone.Offline` callback binds the
 * entire signal path — voice, accent bus, SONO-DIST, master, limiter — to an
 * `OfflineAudioContext`, and `SonoAudioRig`'s one route to `Tone.getDestination()`
 * becomes the route into the rendered buffer. No engine code changes.
 */

/**
 * Pattern passes rendered and thrown away before the kept region.
 *
 * This is what makes the export loop seamlessly. The render is deterministic,
 * so once the parameter ramps have settled the signal is periodic with a period
 * of one pass: `s(t) === s(t + T)`. Slicing exactly one period out of that
 * settled region yields a file whose last sample joins its first exactly as it
 * did mid-render, with the previous pass's decay tail already ringing at sample
 * zero instead of a chopped note and a click. One bar is ample cover — the amp
 * release is 30 ms and the longest parameter ramp is 50 ms.
 */
const PRE_ROLL_BARS = 1;

export type RenderRequest = {
  steps: Pattern;
  parameters: SynthParameters;
  dist: SonoDistState;
  /** The bench's patching, so a bounce matches what the cables say. */
  connections: Connection[];
  bars: number;
  /** Defaults to `EXPORT_SAMPLE_RATE`; overridable for tests. */
  sampleRate?: number;
};

export type RenderResult = {
  samples: Float32Array;
  /** The rate actually rendered at, which is not always the one requested. */
  sampleRate: number;
};

/** Renders `bars` passes of the phrase and returns the loop-ready samples. */
export async function renderPattern(
  request: RenderRequest,
): Promise<RenderResult> {
  const { steps, parameters, dist, connections, bars } = request;
  const rate = request.sampleRate ?? EXPORT_SAMPLE_RATE;

  const keepSamples = barsToSamples(bars, parameters.tempoBpm, rate);
  const preRollSamples = barsToSamples(PRE_ROLL_BARS, parameters.tempoBpm, rate);
  // Derived from the integer sample count rather than the other way round:
  // OfflineAudioContext coerces its length to a whole number of frames, and the
  // slice below has to land on exactly the boundary we computed.
  const duration = (preRollSamples + keepSamples) / rate;

  let rig: SonoAudioRig | null = null;

  const buffer = await Tone.Offline(
    async () => {
      // The distortion state goes in through the *constructor*. `setState` can
      // reach `SonoDistEngine.setMode`, which cross-fades an active-to-active
      // voicing swap around a real `setTimeout(18)` — that timer would fire long
      // after this render has finished, leaving the buffer faded to dry with the
      // wrong curve. The constructor path applies the voicing with no timer.
      rig = new SonoAudioRig({ connections, dist });
      rig.synth.setPattern(steps);
      rig.synth.setParameters(parameters);

      // `setParameters` ramps the transport BPM over 50 ms from Tone's default
      // 120. Integrating that ramp shifts the phase of *every* step for the rest
      // of the render — roughly 20 samples at 48 kHz — which would pull the whole
      // bounce off the DAW grid. Overwrite it with a hard value before the
      // transport starts.
      Tone.getTransport().bpm.value = parameters.tempoBpm;

      // Deliberately no `setStepListener`. The playhead callback in `#playStep`
      // is guarded by `listener !== null` and goes through `Tone.getDraw()`,
      // which schedules on `requestAnimationFrame` — meaningless faster than
      // real time, and absent entirely outside a browser.
      await rig.synth.start();
    },
    duration,
    1, // mono: the instrument is one voice with no stereo width anywhere
    rate,
  );

  // Safe to dispose only now: tearing the graph down inside the callback would
  // do it before a single sample had been rendered.
  (rig as SonoAudioRig | null)?.dispose();

  return {
    samples: buffer.getChannelData(0).slice(preRollSamples, preRollSamples + keepSamples),
    // Read the rate back off the buffer instead of trusting `rate`. Safari has
    // historically ignored the requested OfflineAudioContext rate and rendered
    // at the hardware rate; declaring the real one keeps the file honest.
    sampleRate: buffer.sampleRate,
  };
}
