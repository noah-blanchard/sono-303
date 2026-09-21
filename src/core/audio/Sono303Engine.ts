import * as Tone from "tone";
import { STEP_COUNT, defaultParameters } from "../sequencer/defaults";
import { ACCENT_VELOCITY_NORMALIZED } from "../sequencer/velocity";
import { midiToFrequency, pitchToMidi } from "../sequencer/pitch";
import type { Pattern, PitchClass, SynthParameters } from "../sequencer/types";
import type { Sono303EngineApi, StepListener } from "./engineApi";
import { computeStepEvent, stepDurationSeconds } from "./stepLogic";

const STEP_INDICES = Array.from({ length: STEP_COUNT }, (_, index) => index);

/** Spec §5 voice configuration, verbatim. Fresh object per voice. */
function voiceOptions() {
  return {
    oscillator: {
      type: "sawtooth",
    },
    filter: {
      type: "lowpass",
      rolloff: -24,
      Q: 8,
    },
    envelope: {
      attack: 0.003,
      decay: 0.05,
      sustain: 0.8,
      release: 0.03,
    },
    filterEnvelope: {
      attack: 0.003,
      decay: 0.3,
      sustain: 0,
      release: 0.05,
      baseFrequency: 350,
      octaves: 3.25,
    },
    volume: -8,
  } as const;
}

/** ENV MOD (0..1) spans five octaves of filter-envelope range. */
const ENV_MOD_OCTAVE_RANGE = 5;

/** Cutoff (Hz) a full-depth accent adds on top of the normal filter envelope. */
const ACCENT_MAX_HZ = 4000;

/** Resonance a full-depth accent adds on top of the RESONANCE knob. */
const ACCENT_MAX_Q = 10;

/** Accent decays this much faster than DECAY, so accented notes pop. */
const ACCENT_DECAY_RATIO = 0.45;

/**
 * Shortest audible audition, in seconds. A sixteenth at a fast tempo is barely
 * a blip, so previews get a floor — long enough to judge the pitch, short
 * enough to keep up with someone typing in a pattern.
 */
const MIN_PREVIEW_SECONDS = 0.18;

/**
 * Velocity for a live note that arrives without one — a mouse click or a
 * computer key, neither of which is velocity sensitive. It matches the
 * unaccented sequencer velocity in `stepVelocity`, and sits below the accent
 * threshold so those sources never accidentally accent.
 */
const DEFAULT_VELOCITY = 0.65;

/** Normalized velocity at or above which a live note fires the accent bus. */
const ACCENT_VELOCITY_THRESHOLD = ACCENT_VELOCITY_NORMALIZED;

/**
 * The real SONO-303 sound engine (docs/ENGINE_API.md).
 *
 * Framework-free: no React, no DOM. It owns exactly one `Tone.MonoSynth`
 * voice and one looping 16-step `Tone.Sequence`, both created once in
 * `initialize()`. All musical decisions are delegated to the pure functions
 * in `stepLogic.ts`; this class only translates them into Tone.js calls.
 */
export class Sono303Engine implements Sono303EngineApi {
  /**
   * The instrument's only outlet. It exists from construction — before the
   * synth does — so the rig can wire the whole signal path up front and the
   * user's first gesture only has to resume the context.
   */
  readonly output = new Tone.Gain(1);

  #synth: Tone.MonoSynth | null = null;
  /** Audition voice — see `initialize()`. Never touched by the sequencer. */
  #previewSynth: Tone.MonoSynth | null = null;
  #sequence: Tone.Sequence<number> | null = null;
  /**
   * Accent bus: a second filter envelope summed into the cutoff.
   *
   * `Tone.MonoSynth` drops the note velocity before it reaches its own
   * `filterEnvelope`, so velocity alone makes an accent only marginally
   * louder and never brighter. Mutating `filterEnvelope.octaves`/`.decay`
   * per step is not an option either: those are plain JS properties, not
   * `Param`s, so they cannot be scheduled at an audio time and would
   * retroactively jump the cutoff of the note still sounding inside the
   * lookahead window. This independent envelope is fully schedulable and
   * rides on top of the synth's own filter envelope, because Web Audio sums
   * every connection into an AudioParam.
   */
  #accentEnv: Tone.Envelope | null = null;
  #accentDepth: Tone.Multiply | null = null;
  /**
   * The same accent bus again, for the audition voice. It has to be a second
   * pair rather than a fan-out of the first: one envelope feeding both filters
   * would mean a hard-hit live note also brightened the pattern playing
   * underneath it.
   */
  #previewAccentEnv: Tone.Envelope | null = null;
  #previewAccentDepth: Tone.Multiply | null = null;
  /**
   * MIDI numbers currently held on the audition voice, oldest first.
   *
   * The voice is monophonic, so the stack is what makes overlapping notes
   * behave: the last entry is what sounds, and releasing it falls back to the
   * one below instead of cutting to silence.
   */
  #heldNotes: number[] = [];
  #pattern: Pattern | null = null;
  #parameters: SynthParameters = { ...defaultParameters };
  #listener: StepListener | null = null;
  #disposed = false;
  /**
   * Incremented on every stop/dispose. Playhead callbacks scheduled on the
   * audio clock capture the current generation and no-op once it changes, so
   * a callback already inside the Draw lookahead window can never revive the
   * playhead after stop.
   */
  #playbackGeneration = 0;

  async initialize(): Promise<void> {
    if (this.#disposed || this.#synth !== null) return;

    this.#synth = new Tone.MonoSynth(voiceOptions());
    // Never `.toDestination()`: the voice feeds the rig's output bus, which is
    // what lets SONO-DIST sit in the path without the dry signal doubling it.
    this.#synth.connect(this.output);

    // A second, identical voice used only for auditioning notes as they are
    // written. It shares the output bus — so previews are heard through
    // SONO-DIST exactly as the step will be — but not the sequencer's voice,
    // which would otherwise be stolen mid-pattern on every key press.
    this.#previewSynth = new Tone.MonoSynth(voiceOptions());
    this.#previewSynth.connect(this.output);

    this.#accentDepth = new Tone.Multiply(0);
    this.#accentEnv = new Tone.Envelope({
      attack: 0.002,
      decay: defaultParameters.decaySeconds * ACCENT_DECAY_RATIO,
      sustain: 0,
      release: 0.05,
    });
    this.#accentEnv.connect(this.#accentDepth);
    this.#accentDepth.connect(this.#synth.filter.frequency);

    // Created after the sequencer's pair so the audition bus is always the
    // second envelope/multiply the engine owns.
    this.#previewAccentDepth = new Tone.Multiply(0);
    this.#previewAccentEnv = new Tone.Envelope({
      attack: 0.002,
      decay: defaultParameters.decaySeconds * ACCENT_DECAY_RATIO,
      sustain: 0,
      release: 0.05,
    });
    this.#previewAccentEnv.connect(this.#previewAccentDepth);
    this.#previewAccentDepth.connect(this.#previewSynth.filter.frequency);

    this.#sequence = new Tone.Sequence<number>(
      (time, stepIndex) => {
        this.#playStep(time, stepIndex);
      },
      STEP_INDICES,
      "16n",
    ).start(0);
    this.#sequence.loop = true;

    // Push any parameters that arrived before initialization.
    this.#applyParameters(this.#parameters);
  }

  async start(): Promise<void> {
    if (this.#disposed) return;
    await Tone.start();
    await this.initialize();
    Tone.getTransport().start();
  }

  stop(): void {
    if (this.#disposed) return;
    this.#playbackGeneration += 1;
    Tone.getTransport().stop();
    // Silence any note held across a slide, then clear the playhead.
    this.#synth?.triggerRelease();
    // A live note held through a stop would drone on with nothing to end it.
    this.releaseAll();
    this.#listener?.(null);
  }

  connectOutput(destination: Tone.InputNode): void {
    if (this.#disposed) return;
    this.output.connect(destination);
  }

  disconnectOutput(): void {
    if (this.#disposed) return;
    this.output.disconnect();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.stop();
    this.#sequence?.dispose();
    this.#synth?.dispose();
    this.#previewSynth?.dispose();
    this.#accentEnv?.dispose();
    this.#accentDepth?.dispose();
    this.#previewAccentEnv?.dispose();
    this.#previewAccentDepth?.dispose();
    this.output.dispose();
    this.#sequence = null;
    this.#synth = null;
    this.#previewSynth = null;
    this.#accentEnv = null;
    this.#accentDepth = null;
    this.#previewAccentEnv = null;
    this.#previewAccentDepth = null;
    this.#heldNotes = [];
    this.#listener = null;
    this.#pattern = null;
    this.#disposed = true;
  }

  setPattern(pattern: Pattern): void {
    // Swap the reference only — the sequence is never rebuilt, so live edits
    // during playback are glitch-free.
    this.#pattern = pattern;
  }

  setParameters(parameters: SynthParameters): void {
    this.#parameters = parameters;
    this.#applyParameters(parameters);
  }

  setStepListener(listener: StepListener): void {
    this.#listener = listener;
  }

  noteOn(
    note: PitchClass,
    octave: number,
    velocity: number = DEFAULT_VELOCITY,
  ): void {
    if (this.#disposed) return;
    const midi = pitchToMidi(note, octave);
    // Re-pressing a sounding note moves it to the top rather than stacking a
    // duplicate, so one release can never leave a phantom entry behind.
    this.#heldNotes = this.#heldNotes.filter((held) => held !== midi);
    this.#heldNotes.push(midi);
    // Fire-and-forget: the caller is an event handler, not an async function.
    void this.#attackHeldNote(midi, velocity);
  }

  noteOff(note: PitchClass, octave: number): void {
    if (this.#disposed) return;
    const midi = pitchToMidi(note, octave);
    // Only the note actually holding the voice changes what is heard;
    // releasing one buried in the stack just removes it from the fallbacks.
    const wasSounding = this.#topHeldNote() === midi;
    this.#heldNotes = this.#heldNotes.filter((held) => held !== midi);
    if (!wasSounding) return;

    const synth = this.#previewSynth;
    if (synth === null) return;

    // Released by hand, so it skips the scheduling lookAhead exactly as the
    // attack does — see `#attackHeldNote`.
    const now = Tone.immediate();
    const next = this.#topHeldNote();
    if (next === null) {
      synth.triggerRelease(now);
      return;
    }
    // Last-note priority: hand the voice back to the note still held without
    // re-attacking, so a released overlap doesn't retrigger the envelope.
    synth.portamento = 0;
    synth.setNote(
      midiToFrequency(next + this.#parameters.transposeSemitones),
      now,
    );
  }

  releaseAll(): void {
    if (this.#heldNotes.length === 0) return;
    this.#heldNotes = [];
    this.#previewSynth?.triggerRelease(Tone.immediate());
  }

  previewNote(
    note: PitchClass,
    octave: number,
    velocity: number = DEFAULT_VELOCITY,
  ): void {
    if (this.#disposed) return;
    this.noteOn(note, octave, velocity);
    void this.#releaseAfterPreview(note, octave);
  }

  /** Newest held note, or `null` when nothing is held. */
  #topHeldNote(): number | null {
    return this.#heldNotes.length === 0
      ? null
      : this.#heldNotes[this.#heldNotes.length - 1];
  }

  /**
   * Attacks a live note on the audition voice.
   *
   * It unlocks and initializes audio itself: the first note played is often
   * the first gesture of the session, and it should sound rather than needing
   * START pressed once to "arm" the instrument. Because that unlock is async,
   * the key may already be back up by the time we get here — hence the
   * re-check against the stack, which `noteOff` updates synchronously.
   */
  async #attackHeldNote(midi: number, velocity: number): Promise<void> {
    await Tone.start();
    await this.initialize();
    const synth = this.#previewSynth;
    if (synth === null || this.#disposed) return;
    if (this.#topHeldNote() !== midi) return;

    // Transposed like playback, so a live note is honest about what the same
    // pitch would sound like in the pattern.
    //
    // `immediate()` rather than the default time, which is Tone's `now()` —
    // the context clock plus its 100 ms scheduling lookAhead. That headroom is
    // what keeps the sequencer rock steady, but on a note played by hand it is
    // pure latency, and 100 ms is enough to make the keyboard feel broken.
    synth.portamento = 0;
    synth.triggerAttack(
      midiToFrequency(midi + this.#parameters.transposeSemitones),
      Tone.immediate(),
      velocity,
    );
    if (velocity >= ACCENT_VELOCITY_THRESHOLD) this.#applyPreviewAccent();
  }

  /**
   * Releases a preview note after a short, tempo-related time.
   *
   * Scheduled on Tone's own clock rather than a window timer, so it cannot
   * fire while the audio context is suspended.
   */
  async #releaseAfterPreview(note: PitchClass, octave: number): Promise<void> {
    await Tone.start();
    await this.initialize();
    if (this.#disposed) return;
    const step = stepDurationSeconds(this.#parameters.tempoBpm);
    Tone.getContext().setTimeout(() => {
      this.noteOff(note, octave);
    }, Math.max(MIN_PREVIEW_SECONDS, step * 0.8));
  }

  /** Applies the full parameter set; no-ops until the synth exists. */
  #applyParameters(parameters: SynthParameters): void {
    const synth = this.#synth;
    if (synth === null || this.#disposed) return;

    this.#applyVoiceParameters(synth, parameters);
    // The audition voice tracks every knob too, so a preview always sounds
    // like the step it is previewing.
    if (this.#previewSynth !== null) {
      this.#applyVoiceParameters(this.#previewSynth, parameters);
    }

    Tone.getTransport().bpm.rampTo(parameters.tempoBpm, 0.05);

    // Accent depth tracks ENV MOD so the two knobs reinforce each other: the
    // harder the filter envelope already swings, the harder an accent hits.
    // At accentAmount 0 the factor is 0, so accented steps stay identical to
    // their neighbours.
    const accentDepth =
      parameters.accentAmount * ACCENT_MAX_HZ * (0.35 + 0.65 * parameters.envMod);
    this.#accentDepth?.factor.rampTo(accentDepth, 0.02);
    // The audition accent bus tracks the same knobs, so a hard-hit live note
    // pops exactly as much as an accented step would.
    this.#previewAccentDepth?.factor.rampTo(accentDepth, 0.02);

    const accentDecay = parameters.decaySeconds * ACCENT_DECAY_RATIO;
    if (this.#accentEnv !== null) this.#accentEnv.decay = accentDecay;
    if (this.#previewAccentEnv !== null) {
      this.#previewAccentEnv.decay = accentDecay;
    }
  }

  /** Applies the per-voice half of the parameter set to one synth. */
  #applyVoiceParameters(
    synth: Tone.MonoSynth,
    parameters: SynthParameters,
  ): void {
    // Continuous parameters ramp to avoid zipper noise (spec §12).
    synth.filterEnvelope.baseFrequency = parameters.cutoffHz;
    synth.filter.Q.rampTo(parameters.resonanceQ, 0.02);
    synth.filterEnvelope.decay = parameters.decaySeconds;
    synth.filterEnvelope.octaves = parameters.envMod * ENV_MOD_OCTAVE_RANGE;
    synth.volume.rampTo(parameters.volumeDb, 0.05);

    // Discrete parameters are assigned directly, never ramped.
    synth.oscillator.type = parameters.waveform;
  }

  /**
   * Fires the accent hit for one step, scheduled on the audio clock.
   *
   * Both the extra filter envelope and the resonance bump are scheduled at
   * `time`, so they never bleed backwards onto the note currently sounding.
   * The Q ramp returns to the RESONANCE knob value over the accent decay;
   * a later knob turn calls `Q.rampTo` in `#applyParameters`, which cancels
   * whatever is pending and takes over.
   */
  #applyAccent(time: number): void {
    this.#fireAccent(this.#accentEnv, this.#synth, time);
  }

  /**
   * The same accent hit on the audition voice, for a hard-hit live note.
   *
   * There is no scheduled step time here — the note is played by hand — so it
   * lands at the context's current time.
   */
  #applyPreviewAccent(): void {
    this.#fireAccent(
      this.#previewAccentEnv,
      this.#previewSynth,
      Tone.immediate(),
    );
  }

  /** Shared accent hit: extra filter envelope plus a decaying resonance bump. */
  #fireAccent(
    accentEnv: Tone.Envelope | null,
    synth: Tone.MonoSynth | null,
    time: number,
  ): void {
    if (accentEnv === null || synth === null) return;
    // ACCENT at 0 means accented steps are indistinguishable from their
    // neighbours; bail out so we never touch the Q automation timeline.
    if (this.#parameters.accentAmount === 0) return;

    accentEnv.triggerAttack(time); // sustain 0 ⇒ self-decaying, no release needed
    const decay = this.#parameters.decaySeconds * ACCENT_DECAY_RATIO;
    const base = this.#parameters.resonanceQ;
    const q = synth.filter.Q;
    q.cancelScheduledValues(time);
    q.setValueAtTime(base + this.#parameters.accentAmount * ACCENT_MAX_Q, time);
    q.linearRampToValueAtTime(base, time + decay);
  }

  /** Executes one scheduled step on the audio clock (spec §9.1). */
  #playStep(time: number, stepIndex: number): void {
    const synth = this.#synth;
    const pattern = this.#pattern;
    if (synth === null || pattern === null || this.#disposed) return;

    const prev = pattern[(stepIndex + STEP_COUNT - 1) % STEP_COUNT];
    const cur = pattern[stepIndex];
    const next = pattern[(stepIndex + 1) % STEP_COUNT];
    const event = computeStepEvent(
      prev,
      cur,
      next,
      this.#parameters,
      stepDurationSeconds(this.#parameters.tempoBpm),
    );

    switch (event.kind) {
      case "rest":
        synth.triggerRelease(time);
        break;
      case "trigger":
        synth.portamento = 0;
        synth.triggerAttack(event.frequency, time, event.velocity);
        // A null release means the next step slides in: leave the gate open so
        // the glide lands on a sounding note instead of a dying one.
        if (event.releaseAfter !== null) {
          synth.triggerRelease(time + event.releaseAfter);
        }
        break;
      case "slideIn":
        synth.portamento = event.portamento;
        synth.setNote(event.frequency, time);
        if (event.releaseAfter !== null) {
          synth.triggerRelease(time + event.releaseAfter);
        }
        break;
    }

    // Accent is independent of the amp gate, so it hits on slid-into notes too.
    if (event.accent) this.#applyAccent(time);

    // Rule 10: the visual playhead follows the audio clock, not a timer.
    const listener = this.#listener;
    if (listener !== null) {
      const generation = this.#playbackGeneration;
      Tone.getDraw().schedule(() => {
        if (generation === this.#playbackGeneration) listener(stepIndex);
      }, time);
    }
  }
}
