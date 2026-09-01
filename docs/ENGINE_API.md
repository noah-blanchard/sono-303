# SONO-303 Engine API Contract

This document defines the **complete public contract** of the SONO-303 sound
engine. The engine is a framework-agnostic TypeScript module with no React
dependency. Any host — React, vanilla TS, a test harness, or a future
non-web UI — can drive it through this interface alone.

Canonical source: [src/audio/engineApi.ts](../src/audio/engineApi.ts).

## 1. Design principles

- **Imperative, minimal surface.** Seven methods total. No events besides the
  single step listener.
- **UI-agnostic.** The engine never sees React state, DOM elements, or
  reducer actions. It receives plain `Pattern` and `SynthParameters` objects.
- **One voice, one sequence.** The engine owns exactly one synthesizer voice
  and one 16-step sequence, created once and reused for the engine's lifetime.
- **Push state in, receive steps out.** The host pushes the latest pattern and
  parameters whenever they change; the engine calls back with the current
  step index so the host can render a playhead.

## 2. Types

```ts
// Re-exported from src/sequencer/types.ts — the engine and UI share these.

type Step = {
  active: boolean;
  note: PitchClass;   // "C" | "C#" | "D" | ... | "B"
  octave: number;     // 1..6 (OCT buttons reach 1..5; the keyboard's upper row reaches 6)
  accent: boolean;
  slide: boolean;     // glide INTO this step FROM the previous one
};

type Pattern = Step[]; // MUST always contain exactly 16 steps.

type SynthParameters = {
  waveform: "sawtooth" | "square";
  cutoffHz: number;            // 80..5000
  resonanceQ: number;          // 0..20
  envMod: number;              // 0..1 normalized
  decaySeconds: number;        // 0.05..1.5
  accentAmount: number;        // 0..1 normalized
  tempoBpm: number;            // 60..200
  volumeDb: number;            // -36..0
  transposeSemitones: number;  // -12..+12
};
```

## 3. The interface

```ts
export type StepListener = (stepIndex: number | null) => void;

export type Sono303EngineApi = {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): void;
  dispose(): void;
  setPattern(pattern: Pattern): void;
  setParameters(parameters: SynthParameters): void;
  setStepListener(listener: StepListener): void;
  noteOn(note: PitchClass, octave: number, velocity?: number): void;
  noteOff(note: PitchClass, octave: number): void;
  releaseAll(): void;
  previewNote(note: PitchClass, octave: number, velocity?: number): void;
  connectOutput(destination: InputNode): void;
  disconnectOutput(): void;
};

export type Sono303EngineFactory = () => Sono303EngineApi;
```

## 4. Method semantics

### `initialize(): Promise<void>`

- Creates all audio resources **exactly once**: one synth voice and one
  looping 16-step sequence.
- Must be called from within a user-gesture handler (directly or indirectly)
  because browser autoplay policies require it.
- Idempotent: calling it again after a successful call is a no-op.
- Does **not** start playback.

### `start(): Promise<void>`

- Ensures initialization (calls `initialize()` internally if needed), then
  starts the transport. The sequence begins stepping 0 → 15 in a loop.
- Idempotent: calling `start()` while running does not create a second
  sequence or a second voice.

### `stop(): void`

- Stops the transport immediately.
- Releases any held note — including a note held across a slide — so no
  sound lingers.
- Emits `stepListener(null)` so the host can clear its playhead.
- Does **not** reset the pattern, parameters, or selection.
- Idempotent.

### `dispose(): void`

- Stops playback (as `stop()`), then disposes every owned audio node.
- Idempotent and safe to call on unmount.
- After `dispose()`, the instance must not be used again; create a new one
  via the factory instead.

### `setPattern(pattern: Pattern): void`

- Replaces the pattern the sequencer reads.
- Takes effect on the **next** scheduled step callback — the sequence itself
  is never destroyed or rebuilt, so live editing during playback is glitch-free.
- `pattern.length` must be 16. The engine does not defensively copy; callers
  should pass a fresh array (React state updates do this naturally).

### `setParameters(parameters: SynthParameters): void`

- Replaces the full parameter set. Continuous parameters (cutoff, resonance,
  decay, env mod, tempo, volume) are applied with short ramps
  (`rampTo(value, 0.02..0.05)`) to avoid zipper noise.
- Discrete parameters (`waveform`) are assigned directly, never ramped.
- `tempoBpm` changes take effect while the transport keeps running and the
  loop stays synchronized.
- Safe to call at any time, including during playback and before `start()`.

### `setStepListener(listener: StepListener): void`

- Registers the engine's single output callback. Replaces any previous
  listener.
- Called with the current step index (`0..15`) once per step while playing,
  scheduled on the audio clock (not a wall-clock timer) so the UI playhead
  stays synchronized with sound.
- Called with `null` exactly when playback stops.
- The engine never calls the listener at any other time; it never emits
  pattern, parameter, or error events.
- **An engine rendering offline must never be given a listener.** The callback
  is scheduled through `Tone.getDraw()`, which runs on `requestAnimationFrame`:
  meaningless faster than real time, and absent outside a browser. See §10.

### The live note gate

Four methods drive every note played by hand — the mini keyboard, the computer
keyboard and MIDI all arrive here. They share one set of properties:

- All use the **separate audition voice**, never the sequencer's. Playing live
  while a pattern runs must never steal or cut the running note.
- That voice shares the output bus, so live notes are heard through SONO-DIST
  exactly as a written step will be, and it tracks every sound knob.
- All apply the current transposition, so a note played live is honest about
  what the same pitch would sound like in the pattern.
- All are scheduled with `Tone.immediate()`, deliberately skipping the
  context's ~100 ms scheduling lookAhead. That headroom is what keeps the
  sequencer steady, but on a note played by hand it is pure latency.

#### `noteOn(note, octave, velocity?): void`

- Starts a note and holds it until the matching `noteOff`.
- Fire-and-forget: it unlocks audio and initializes on its own, because the
  gesture that triggers it is itself a valid user gesture. The first note
  played should sound without pressing START first. Because that unlock is
  async, a note released before it completes must never end up stranded.
- `velocity` is normalized 0..1. It scales loudness, and at or above the accent
  threshold (MIDI 100) also fires a **second accent bus** wired into the
  audition voice's filter — never the sequencer's, so a hard-hit live note
  cannot brighten the pattern underneath it. Omitting it means no accent: the
  mouse and the computer keyboard are not velocity sensitive.

#### `noteOff(note, octave): void`

- Releases a held note. Releasing one that is not held is a no-op.
- The audition voice is monophonic, so overlapping notes follow **last-note
  priority**: releasing the note that owns the voice hands it back to whichever
  note is still held, via `setNote` rather than a fresh attack. Releasing a note
  buried in the stack changes nothing audible.

#### `releaseAll(): void`

- Releases everything at once. Called on window blur, on `stop()` and on
  `dispose()` — a note held across any of those would drone with nothing left
  to end it.

#### `previewNote(note, octave, velocity?): void`

- `noteOn` plus a release scheduled on Tone's own clock, for a gesture with no
  natural end: a click, or a key activated with Enter/Space.
- Never shorter than 180 ms, so it stays audible at fast tempos.

### `connectOutput(destination: InputNode): void` / `disconnectOutput(): void`

- The engine **never** reaches `Tone.Destination` on its own. It exposes one
  output bus, and the host decides where it goes.
- That is what makes an insert effect possible: if the voice also went straight
  to the destination, the dry signal would sound alongside the processed one
  and BYPASS would be indistinguishable from active.
- `connectOutput` may be called more than once to fan out to several
  destinations; `SonoAudioRig` uses this to feed the dry branch and the effect
  branch from the same voice.
- The output bus exists from construction, before `initialize()`, so a host can
  wire the full path up front and leave the user's first gesture to do nothing
  but resume the audio context.

## 5. Timing guarantees

- Step callbacks fire on the **audio clock**. The real engine uses
  `Tone.Draw.schedule` so visual updates align with audible steps.
- Parameter changes pushed via `setParameters` are audible on the next
  scheduled note at the latest.
- The sequence loops 16 → 0 seamlessly, including a slide from step 16
  into step 1 (flag step 1).

## 6. Lifecycle recipe

```text
factory()          → create instance (cheap, no audio yet)
setPattern(p)      → may be called any time, in any order
setParameters(p)   → may be called any time, in any order
setStepListener(l) → register once
[gesture] start()  → initializes (once) + starts transport
start()/stop()     → any number of times; no leaked nodes or duplicate voices
dispose()          → once, on teardown
```

## 7. Connecting ANY UI

The engine needs nothing UI-specific. A minimal vanilla-TypeScript host:

```ts
import { Sono303Engine } from "./src/audio/Sono303Engine";
import { createInitialState } from "./src/sequencer/defaults";

const state = createInitialState();
const engine = new Sono303Engine();

engine.setPattern(state.steps);
engine.setParameters(state.parameters);
engine.setStepListener((stepIndex) => {
  playheadEl.dataset.step = stepIndex === null ? "" : String(stepIndex + 1);
});

playButton.addEventListener("click", async () => {
  if (running) engine.stop();
  else await engine.start(); // user gesture ⇒ audio unlock is legal
  running = !running;
});

cutoffSlider.addEventListener("input", (e) => {
  params.cutoffHz = Number((e.target as HTMLInputElement).value);
  engine.setParameters({ ...params });
});

window.addEventListener("beforeunload", () => engine.dispose());
```

The React host in this repo does exactly the same thing inside
`useSono303`, mapping reducer state onto `setPattern`/`setParameters` and
mapping `stepListener` back onto a `transport/setCurrentStep` dispatch. It
returns two capabilities, which `App` publishes through their contexts:

```ts
type Sono303Host = {
  noteGate: NoteGate;      // NoteGateContext    — live play
  exportWav: WavExport;    // WavExportContext   — the SONO-TAPE bounce
  liveRecord: LiveRecord;  // LiveRecordContext  — SONO-TAPE live capture
};
```

## 8. Implementations

| Implementation         | File                              | Purpose |
| ---------------------- | --------------------------------- | ------- |
| `MockSono303Engine`    | `src/audio/MockSono303Engine.ts`  | M1 stand-in: tempo-driven `setInterval` playhead, zero Tone.js, no sound. Also a reference implementation of this contract. |
| `Sono303Engine`        | `src/audio/Sono303Engine.ts`      | Real Tone.js engine (Milestone 2): one `Tone.MonoSynth` + one `Tone.Sequence`, audio-clock playhead. |

Both implement `Sono303EngineApi` exactly. Hosts select one via a
`Sono303EngineFactory`; swapping implementations must never require host
changes.

## 9. The effect engine — `SonoDistEngineApi`

SONO-DIST (`concept/SONO_DIST_ARCHITECTURE.md`) follows the same rules: no
React, no DOM, every node created once, and all musical decisions delegated to
pure functions the browser is not needed to test.

```ts
export type SonoDistEngineApi = {
  readonly input: InputNode;
  readonly output: InputNode;
  setDrive(value: number): void;   // 0..1, clamped by the engine
  setTone(value: number): void;    // 0..1
  setLevel(value: number): void;   // 0..1
  setMode(mode: DistortionMode): void;
  setState(state: SonoDistState): void;
  connect(destination: InputNode): void;
  disconnect(): void;
  dispose(): void;
};
```

Contract notes:

- **BYPASS is a real dry path**, an unprocessed `Tone.CrossFade` input — not a
  drive of zero. Even a gentle curve and a wide-open filter colour the signal.
- **Mode changes never rebuild the graph.** They swap a curve, an oversampling
  factor and two gains behind a short dip to the dry path, and a revision
  counter makes a stale transition abort rather than reinstate the wrong
  voicing.
- **Every setter clamps to `0..1`** before mapping, and ramps rather than jumps
  (20 ms for gains, 20–30 ms for the tone filter).
- Knob values are kept through BYPASS, so re-engaging a voicing is instant.

| Unit                    | File                              | Purpose |
| ----------------------- | --------------------------------- | ------- |
| `distortionCurves.ts`   | `src/audio/distortionCurves.ts`   | Pure transfer curves for CLASSIC / TURBO / O-DRIVE. The character of the module, testable with no AudioContext. |
| `distortionMapping.ts`  | `src/sequencer/distortionMapping.ts` | Knob → Hz / dB / compensation. Lives in the data model so the UI can print readouts without importing `src/audio/`. |
| `SonoDistEngine`        | `src/audio/SonoDistEngine.ts`     | The Tone.js graph, smoothing and anti-click mode transitions. |
| `SonoAudioRig`          | `src/audio/SonoAudioRig.ts`       | Owns instrument + effect + master + limiter, and the only route to `Tone.Destination`. |

## 10. Offline export — `renderPattern`

SONO-TAPE bounces the phrase by reusing the whole instrument rather than
re-implementing it. No module in `src/audio/` captures an AudioContext at
import time, so building a **fresh `SonoAudioRig` inside a `Tone.Offline`
callback** binds the entire graph to an `OfflineAudioContext`, and the rig's one
route to `Tone.getDestination()` becomes the route into the rendered buffer.

```ts
// src/audio/renderPattern.ts
type RenderRequest = {
  steps: Pattern;
  parameters: SynthParameters;
  dist: SonoDistState;
  connections: Connection[];   // the bench's patching
  bars: number;
  sampleRate?: number;      // defaults to EXPORT_SAMPLE_RATE (48000)
};
type RenderResult = {
  samples: Float32Array;
  sampleRate: number;       // the rate rendered at, not the one requested
};

function renderPattern(request: RenderRequest): Promise<RenderResult>;
```

Contract notes:

- **Rendered mono.** The instrument is one voice with no stereo width anywhere
  in the graph, so a second channel would be a duplicate.
- **One extra pass is rendered and discarded.** The render is deterministic and
  therefore periodic once the ramps settle, so a slice taken from the settled
  region loops seamlessly — the previous pass's decay tail is already ringing at
  sample zero instead of the note being chopped.
- **Never `setStepListener`** on the offline engine (§4).
- **The distortion state goes through the `SonoAudioRig` constructor**, never
  `dist.setState`: `SonoDistEngine.setMode` cross-fades an active-to-active swap
  around a real `setTimeout`, which would fire after the render finished.
- **`transport.bpm.value` is hard-set after `setParameters`.** The 50 ms tempo
  ramp from Tone's default 120 integrates into a permanent phase offset that
  would pull the bounce off the DAW grid.
- **The returned `sampleRate` is read back off the buffer.** Safari has
  historically ignored the requested offline rate.
- Live-note methods are meaningless offline: they schedule at `Tone.immediate()`,
  which is `0` on an unstarted offline context. Use `setPattern` + transport.

| Unit               | File                          | Purpose |
| ------------------ | ----------------------------- | ------- |
| `renderPattern.ts` | `src/audio/renderPattern.ts`  | The offline bounce, and the four rules above. |
| `wavEncoder.ts`    | `src/audio/wavEncoder.ts`     | Float32 → 24-bit mono PCM RIFF/WAVE bytes. Pure and DOM-free, so it returns `Uint8Array`, not a `Blob`. |
| `tape.ts`          | `src/sequencer/tape.ts`       | Bar/second/sample math and the file name. In the data model so the panel can print the duration without importing `src/audio/`. |

## 11. Live capture — `LiveRecorder`

The offline bounce replays the pattern against one frozen snapshot of the
parameters, so a knob swept during playback cannot exist in it. `LiveRecorder`
records the real-time graph instead: knob moves, hand-played notes, MIDI, and
the cable going into SONO-DIST mid-phrase all end up in the take.

```ts
// src/audio/LiveRecorder.ts
type LiveRecordState = "idle" | "armed" | "recording";
type LiveTake = {
  samples: Float32Array;
  sampleRate: number;
  snappedBars: number | null;   // null when the take was not bar-snapped
};

class LiveRecorder {
  setSource(source: Tone.ToneAudioNode): void;   // the rig's tape bus
  arm(tempoBpm: number, maxSeconds?: number): Promise<void>;
  stop(): Promise<LiveTake | null>;              // null when cancelled while armed
  onAutoStop(callback: () => void): void;        // the length cap fired
  get state(): LiveRecordState;
  get frames(): number;                          // captured since the take opened
  dispose(): void;
}
```

Contract notes:

- **Lossless.** An `AudioWorkletNode` with **zero outputs** taps the tape bus
  and posts raw Float32 in 4096-frame chunks; the same 24-bit encoder writes the
  file. `MediaRecorder` would give lossy webm-opus or mp4-aac depending on the
  browser. Being a zero-output leaf is also what keeps the rig's "exactly one
  route to `Tone.Destination`" guarantee intact.
- **The worklet is loaded from a blob URL**, not a `?url` import: the file is
  under Vite's 4 KB inline limit, so `?url` yields a `data:` URL and
  `audioWorklet.addModule` refuses those. Created lazily on the first REC press,
  which is also the user gesture that unlocks the context.
- **Use `context.createAudioWorkletNode(...)`**, never
  `new AudioWorkletNode(context.rawContext, …)` — `rawContext` is a wrapper and
  the native constructor rejects it.
- **Bar snapping is sample-exact.** The worklet stamps its first chunk with
  `currentFrame`; `Transport.schedule` hands back the *audio-context time* of
  each bar boundary; the take is trimmed to `[beginFrame, endFrame)`.
- **Snapping is conditional on there being a grid.** With the transport running
  the take opens on the next downbeat and closes on a boundary. With it stopped
  there is nothing to snap to — the live-keyboard case — so it opens and closes
  at once.
- **The rate is the hardware's.** Unlike the offline bounce, live capture cannot
  insist on 48 kHz; the header declares whatever the context gave.
- **Capped at five minutes** (~57 MB of Float32), after which it stops itself
  and reports through `onAutoStop` rather than growing until the tab dies.
