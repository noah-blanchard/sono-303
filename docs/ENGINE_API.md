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
  octave: number;     // 1..5
  accent: boolean;
  slide: boolean;     // glide FROM this step INTO the next
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

## 5. Timing guarantees

- Step callbacks fire on the **audio clock**. The real engine uses
  `Tone.Draw.schedule` so visual updates align with audible steps.
- Parameter changes pushed via `setParameters` are audible on the next
  scheduled note at the latest.
- The sequence loops 16 → 0 seamlessly, including a slide from step 16
  into step 1.

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
mapping `stepListener` back onto a `transport/setCurrentStep` dispatch.

## 8. Implementations

| Implementation         | File                              | Purpose |
| ---------------------- | --------------------------------- | ------- |
| `MockSono303Engine`    | `src/audio/MockSono303Engine.ts`  | M1 stand-in: tempo-driven `setInterval` playhead, zero Tone.js, no sound. Also a reference implementation of this contract. |
| `Sono303Engine`        | `src/audio/Sono303Engine.ts`      | Real Tone.js engine (Milestone 2): one `Tone.MonoSynth` + one `Tone.Sequence`, audio-clock playhead. |

Both implement `Sono303EngineApi` exactly. Hosts select one via a
`Sono303EngineFactory`; swapping implementations must never require host
changes.
