# SONO-303

## Agent-Ready Product and Implementation Specification

This document is the single source of truth for implementing the project. The
product name displayed in the interface must be **SONO-303**. Never display
`ACID BASS`, `TB-303`, `Roland`, or another existing product or company name as
the application brand.

## 0. Agent Execution Contract

The implementing agent must:

- Build the complete MVP described in this document.
- Use the mandatory stack and architecture below.
- Treat every `must`, `required`, and `do not` statement as an implementation constraint.
- Prefer the simplest implementation that satisfies all acceptance criteria.
- Keep the audio engine independent from React rendering.
- Implement the custom interface with semantic HTML and CSS rather than a generic dashboard or component-library aesthetic.
- Avoid adding features listed under Explicit Non-Goals.
- Verify the production build, linting, core interactions, and audio cleanup before declaring completion.
- Make reasonable low-impact implementation decisions without expanding product scope.

## 1. Objective

Build **SONO-303**, a simple and responsive browser-based acid bass synthesizer
inspired by the essential musical behavior of the Roland TB-303 and implemented
with Tone.js.

The application must preserve the essential musical behavior of a TB-303:

- One monophonic bass voice
- Sawtooth and square oscillator waveforms
- Resonant low-pass filter
- Short filter envelope controlled by ENV MOD and DECAY
- Per-step ACCENT
- Per-step SLIDE
- A looping 16-step sequencer
- Pattern transposition
- PLAY and WRITE modes
- Real-time parameter manipulation during playback

This is an intentionally simplified musical simulation, not a circuit-level
emulation, visual clone, or complete reproduction of the original hardware
workflow.

## 2. Product Principle

The finished application should feel immediate:

1. Activate steps.
2. Choose their notes.
3. Add accents and slides.
4. Press Play.
5. Manipulate the filter controls in real time.

Do not reproduce the original TB-303's difficult Pitch Write and Time Write programming process. Use a modern visual step editor.

## 3. Essential Scope

The product consists of exactly three functional layers:

1. **Synth engine**: produces one TB-303-style bass voice.
2. **Sequencer engine**: schedules a looping 16-step pattern.
3. **Interface state**: edits the pattern and exposes the essential controls.

Conceptual signal flow:

```text
16-step sequencer
    -> monophonic oscillator
    -> resonant low-pass filter
    -> amplitude envelope
    -> master volume
    -> audio destination
```

The sequencer supplies pitch, gate, accent, and slide information. The filter envelope modulates the low-pass filter on every normally triggered note.

### 3.1 Mandatory Technical Stack

Use this stack:

- **Bun** for package management and scripts
- **Vite** as the development server and production bundler
- **React** for the interactive interface
- **TypeScript** with strict mode enabled
- **Tone.js** for Web Audio synthesis, transport, envelopes, and sequencing
- **Plain CSS or CSS Modules** for the complete visual implementation
- **React `useReducer`** for serializable application state

Do not use Next.js. SONO-303 is a client-only single-page application and does
not need routing, server rendering, React Server Components, API routes, a
database, authentication, or backend infrastructure.

Do not introduce Redux, Zustand, a UI component library, a CSS framework, or a
rotary-knob library for the MVP. They are unnecessary for this scope and would
make the distinctive interface harder to control.

Required initialization commands:

```bash
bun create vite sono-303 --template react-ts
cd sono-303
bun install
bun add tone
bun run dev
```

The final project must provide at least these scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  }
}
```

### 3.2 Required Source Architecture

Use this structure or a functionally equivalent structure with the same
separation of responsibilities:

```text
src/
├── audio/
│   ├── Sono303Engine.ts       # Owns all Tone.js objects and audio scheduling
│   └── audioMapping.ts        # UI-value to Tone.js-value mapping helpers
├── sequencer/
│   ├── types.ts               # Step, pattern, parameter, and action types
│   ├── defaults.ts            # Initial parameters and 16-step pattern
│   └── pitch.ts               # Pitch-class, octave, transpose conversion
├── state/
│   └── sono303Reducer.ts      # Pure serializable UI/application reducer
├── hooks/
│   └── useSono303.ts          # Connects React state to the stable audio engine
├── components/
│   ├── Sono303Panel.tsx       # Main instrument panel and layout
│   ├── SoundControls.tsx      # Waveform and six rotary controls
│   ├── TransportControls.tsx  # Start/Stop, mode, tempo, transpose
│   ├── RotaryKnob.tsx         # Accessible reusable knob
│   ├── StepSequencer.tsx      # Fixed 16-step row/grid
│   ├── StepButton.tsx         # One selectable/illuminated step
│   ├── StepEditor.tsx         # Selected-step editing region
│   └── MiniKeyboard.tsx       # One-octave pitch selector
├── styles/
│   ├── tokens.css             # Colors, spacing, radii, shadows, sizes
│   └── sono303.css            # Instrument-specific visual treatment
├── App.tsx
└── main.tsx
```

### 3.3 Architecture Boundaries

`Sono303Engine` must be a framework-independent TypeScript class or module. It
must create and own the `Tone.MonoSynth`, `Tone.Sequence`, and transport-facing
callbacks exactly once. React components must never instantiate Tone.js nodes.

The audio engine should expose a small imperative API similar to:

```ts
type Sono303EngineApi = {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): void;
  dispose(): void;
  setPattern(pattern: Pattern): void;
  setParameters(parameters: SynthParameters): void;
  setStepListener(listener: (stepIndex: number) => void): void;
};
```

React owns serializable state. The engine owns non-serializable audio objects.
Use a stable engine reference and a stable pattern reference so editing a step
does not destroy and recreate the sequence.

`useSono303` is the only integration boundary between the interface and the
engine. It must initialize audio only after a user gesture, forward parameter
changes, synchronize the latest pattern, receive playhead updates, and dispose
the engine on unmount.

## 4. Required Controls

### 4.1 Waveform

- Type: two-position selector
- Values: `sawtooth` or `square`
- Default: `sawtooth`
- Tone.js target: `synth.oscillator.type`

Expected behavior:

- Sawtooth sounds bright, buzzy, and aggressive.
- Square sounds rounder and more hollow.
- The waveform may be changed while the sequence is playing.

### 4.2 Cutoff Frequency

- UI label: `CUTOFF FREQ`
- Type: logarithmic knob or slider
- Suggested range: `80 Hz` to `5000 Hz`
- Suggested default: `350 Hz`

Expected behavior:

- Sets the base cutoff frequency of the low-pass filter.
- Low values make the sound dark and muted.
- High values make the sound bright and open.
- Changes must be audible immediately during playback.

Tone.js mapping:

```ts
synth.filterEnvelope.baseFrequency = cutoffHz;
```

Use logarithmic UI mapping because frequency is perceived logarithmically.

### 4.3 Resonance

- UI label: `RESONANCE`
- Type: knob or slider
- Suggested range: `0` to `20 Q`
- Suggested default: `8`
- Tone.js target: `synth.filter.Q.value`

Expected behavior:

- Emphasizes frequencies around the cutoff.
- High values produce the recognizable acid squelch.
- Smooth parameter changes with a very short ramp when practical to avoid zipper noise.

### 4.4 Envelope Modulation

- Correct UI label: `ENV MOD`
- Do not label it `ENV MODE`.
- Meaning: Envelope Modulation
- Type: normalized knob or slider
- UI range: `0%` to `100%`
- Internal range: approximately `0` to `5` octaves
- Suggested default: `65%`

Expected behavior:

- Controls how far above the base cutoff the filter envelope begins.
- At zero, the filter envelope has almost no effect.
- At maximum, each note begins much brighter and decays toward the base cutoff.

Tone.js mapping:

```ts
synth.filterEnvelope.octaves = envModNormalized * 5;
```

### 4.5 Decay

- UI label: `DECAY`
- Type: knob or slider
- Suggested range: `0.05` to `1.5` seconds
- Suggested default: `0.3` seconds
- Tone.js target: `synth.filterEnvelope.decay`

Expected behavior:

- Controls how quickly the filter envelope returns to the base cutoff.
- Short decay creates tight, percussive notes.
- Long decay creates longer, more liquid sweeps.
- It primarily controls the filter envelope, not the master note length.

### 4.6 Accent

- UI label: `ACCENT`
- Type: global normalized knob or slider
- Range: `0%` to `100%`
- Suggested default: `60%`

Accent has two parts:

1. Each step has an `accent: boolean` flag.
2. The global ACCENT control determines how strongly flagged steps are emphasized.

Expected behavior for an accented step:

- Louder than a normal step
- Brighter than a normal step
- More aggressive because its filter envelope is more pronounced

Tone.js implementation, in two parts.

Loudness comes from note velocity:

```ts
const normalVelocity = 0.65;
const velocity = step.accent
  ? normalVelocity + accentAmount * 0.35
  : normalVelocity;
```

Pass `velocity` to `triggerAttack`. Note that velocity alone is **not** enough:
`Tone.MonoSynth._triggerEnvelopeAttack` forwards velocity to its amplitude
envelope but calls `filterEnvelope.triggerAttack(time)` without it, so velocity
produces no brightness change whatsoever.

Brightness, snap and squelch therefore come from a dedicated **accent bus** that
the engine owns alongside the synth:

```ts
const accentDepth = new Tone.Multiply(0);
const accentEnv = new Tone.Envelope({ attack: 0.002, decay, sustain: 0, release: 0.05 });
accentEnv.connect(accentDepth);
accentDepth.connect(synth.filter.frequency);
```

Web Audio sums every connection into an AudioParam, so this envelope rides on
top of the synth's own filter envelope without disturbing it. On an accented
step the engine triggers `accentEnv` and schedules a resonance bump on
`filter.Q`, both at the step's audio time.

Do **not** implement accent by mutating `filterEnvelope.octaves`, `.decay` or
`.baseFrequency` per step. Those are plain JS properties, not `Param`s: they
cannot be scheduled at an audio time, and because the Sequence callback runs
inside the lookahead window, writing them jumps the cutoff of the note that is
still sounding.

Parameter interaction: accent depth scales with both the ACCENT knob and ENV MOD,
so a harder filter envelope also yields a harder accent. The accent envelope
decays faster than the DECAY knob (roughly 45% of it) so accented notes pop
rather than sit bright. Accent also applies to notes entered through a slide,
which never re-attack the amplitude envelope.

Required invariant:

- If no steps are accented, moving the ACCENT control must not change the sequence.
- If ACCENT is zero, accented and non-accented steps should be effectively identical.

Do not attempt to reproduce every nonlinear interaction of the original analog accent circuit.

### 4.7 Tempo

- UI label: `TEMPO`
- Type: numeric control plus slider or knob
- Suggested range: `60` to `200 BPM`
- Suggested default: `125 BPM`
- Tone.js target: `Tone.getTransport().bpm`

Tone.js mapping:

```ts
Tone.getTransport().bpm.rampTo(tempoBpm, 0.05);
```

The sequencer must remain synchronized when tempo changes during playback.

### 4.8 Volume

- UI label: `VOLUME`
- Type: knob or slider
- Suggested range: `-36 dB` to `0 dB`
- Suggested default: `-8 dB`
- Tone.js target: `synth.volume.value` or a dedicated `Tone.Volume`

Volume controls only the final output level. It must not alter the synth envelope, accent amount, or filter behavior.

### 4.9 Transpose

- UI label: `TRANSPOSE`
- Type: semitone decrement/increment buttons with a numeric value
- Suggested range: `-12` to `+12` semitones
- Default: `0`

Expected behavior:

- Transposes the complete pattern without modifying stored step notes.
- May be changed during playback.
- The new transposition takes effect on the next scheduled note.

Final pitch calculation:

```text
stored step note + step octave + global transpose
```

Use discrete semitones. A separate analog fine-tuning knob is not required.

### 4.10 Mode

- UI label: `MODE`
- Values: `PLAY` or `WRITE`
- Keep transport state separate from mode state.

#### WRITE mode

- The user may select and edit all 16 steps.
- The user may change note, octave, active/rest, accent, and slide.
- Editing may continue while the transport is running.
- Pattern changes should be used on the next relevant sequencer callback.

#### PLAY mode

- Step editing is disabled or visually de-emphasized.
- The user may still manipulate waveform, cutoff, resonance, ENV MOD, decay, accent, tempo, volume, and transpose.
- The current playback step remains visible.

Changing mode must not automatically start, stop, or reset the transport.

## 5. Synth Engine

`Sono303Engine` must use one `Tone.MonoSynth`. It already provides the essential architecture:

- One oscillator
- One low-pass filter
- One amplitude envelope
- One filter frequency envelope
- Monophonic pitch control
- Portamento support

Recommended initial configuration:

```ts
const synth = new Tone.MonoSynth({
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
}).toDestination();
```

The original TB-303 filter is commonly characterized as approximately `-18 dB/octave`. Tone.js does not expose a native `-18 dB` filter rolloff, so use `-24 dB` as the simple approximation. Do not build a custom filter model for the MVP.

## 6. Filter Envelope Behavior

Every normal note trigger must create the following movement:

1. Begin near the envelope-defined maximum filter frequency.
2. Decay toward `CUTOFF FREQ`.
3. Reach the base cutoff according to `DECAY`.

Conceptually:

```text
filter start = cutoff × 2^(envModOctaves)
filter end   = cutoff
```

`CUTOFF FREQ` defines the destination. `ENV MOD` defines the distance. `DECAY` defines the time.

## 7. Step Sequencer

### 7.1 Pattern length and timing

- Fixed pattern length: `16` steps
- Step subdivision: sixteenth note, represented as `"16n"` in Tone.js
- Playback direction: forward only
- Looping: always enabled while transport is playing
- Step 16 loops back to step 1

Do not add variable pattern length, reverse playback, shuffle, probability, or polymeter.

### 7.2 Step data model

```ts
type PitchClass =
  | "C"
  | "C#"
  | "D"
  | "D#"
  | "E"
  | "F"
  | "F#"
  | "G"
  | "G#"
  | "A"
  | "A#"
  | "B";

type Step = {
  active: boolean;
  note: PitchClass;
  octave: number;
  accent: boolean;
  slide: boolean;
};

type Pattern = Step[]; // Must always contain exactly 16 steps.
```

Suggested default step:

```ts
const defaultStep: Step = {
  active: false,
  note: "C",
  octave: 3,
  accent: false,
  slide: false,
};
```

### 7.3 Step editor

The sequencer grid and the selected-step editor are separate controls.

#### Step grid behavior

- Render exactly 16 identical metallic step buttons.
- Number them `1` through `16`.
- Group them visually into four groups of four.
- Do not print pitch names or `REST` inside the step buttons.
- Do not use black buttons to represent rests.
- Clicking a step in WRITE mode selects it; clicking it must not directly toggle note/rest state.
- The selected step uses a thin dark outline.
- The current transport step uses a red illuminated rim or red LED treatment.
- Selection and playhead are independent states. If the selected step is also the current step, both states must remain understandable through a dark inner outline plus red outer glow.
- During playback, every time position receives the playhead illumination, including a rest. A rest advances time but produces no sound.
- Small `A` and `S` labels may appear below steps as read-only status indicators.
- `A` means that step has Accent enabled.
- `S` means that step has Slide enabled.
- `A` and `S` are never separate buttons in the grid.

#### Selected-step editor behavior

The editor must show a readout in this exact format:

```text
SELECTED STEP 5 · C4
```

For a rest, use:

```text
SELECTED STEP 5 · REST
```

The editor contains only:

1. A compact one-octave chromatic mini keyboard with seven white keys and five black keys.
2. A `REST` toggle.
3. An `OCT −` button.
4. An `OCT +` button.
5. An `ACCENT` toggle.
6. A `SLIDE` toggle.

Interaction rules:

- Clicking a mini-keyboard key sets the selected step's pitch class and sets `active = true`.
- The selected pitch key receives a restrained red outline or indicator.
- `REST` sets `active = false`. The previously stored pitch and octave may remain in state for convenient restoration, but audio must ignore them while the step is a rest.
- Disable or visually mute ACCENT and SLIDE while the selected step is a rest. Their stored values should be reset to `false` when REST is enabled to avoid hidden state.
- `OCT −` and `OCT +` change only the selected step octave and clamp it to the supported range `1` through `5`.
- `ACCENT` toggles only `step.accent`.
- `SLIDE` toggles only `step.slide` and means glide into this step from the immediately preceding active step.
- Editing is available in WRITE mode, including while the transport is running.
- In PLAY mode, retain the visual state but disable the mini keyboard and all selected-step editing controls.

Responsive layout:

- Wide desktop: all 16 step buttons in one row.
- Tablet: two rows of 8 if required to maintain touch-target size.
- Mobile: two rows of 8, followed by a full-width editor; the mini keyboard may occupy its own row.
- Never create horizontal page scrolling merely to preserve the one-row desktop arrangement.

## 8. Slide Behavior

Slide is essential and must be implemented as legato portamento, not as two separately attacked notes.

The flag lives on the **destination** step:

> `slide: true` means the immediately preceding step glides into this step.

So marking step 4 as SLIDE makes step 3 glide into step 4. If both hold the same
pitch, the pair sounds as one continuous, longer note.

Slide applies only when the flagged step is active AND the step before it is an
active note. A slide flag on a rest, or on a step preceded by a rest, is ignored.

When slide applies:

- Keep the previous note's gate open across the step boundary.
- Glide to the new pitch.
- Do not retrigger the amplitude envelope.
- Do not retrigger the filter envelope.

Suggested behavior:

```ts
synth.portamento = stepDurationSeconds * 0.6;
synth.setNote(slideTargetFrequency, slideTargetStepTime);
```

Keeping the gate open is the load-bearing part and applies to freshly triggered
notes too, not just to notes already inside a slide chain. `Monophonic.setNote`
only glides while `getLevelAtTime(time) > 0.05`; if the source note has been
released it falls through to `setValueAtTime` — a hard pitch jump — and
`MonoSynth` will already have scheduled `oscillator.stop`, silencing the target.

When slide does not apply:

- Set portamento to zero.
- Trigger the note normally.
- Release it after approximately `80%` of the step duration.

The slide from step 16 to step 1 must work because the pattern loops.

Exact analog slide timing is not required. The musical requirements are an audible pitch glide and no envelope retrigger at the linked boundary.

## 9. Sequencer Scheduling

Tone.js Transport must own musical timing. Do not use `setInterval` or animation frames to schedule audio.

Recommended sequence:

```ts
const stepIndices = Array.from({ length: 16 }, (_, index) => index);

const sequence = new Tone.Sequence(
  (time, stepIndex) => {
    playStep(time, stepIndex);
  },
  stepIndices,
  "16n",
).start(0);

sequence.loop = true;
```

Pass indices to `Tone.Sequence`, then read the latest pattern data from a stable mutable reference or audio-engine store inside `playStep`. This allows live edits without constantly destroying and recreating the sequence.

### 9.1 Required playback rules

For each step callback:

1. Read the current, previous, and next steps using modulo-16 indices.
2. If the current step is a rest, release any held note.
3. Calculate its final pitch using octave and global transpose.
4. Determine whether the previous step slides into the current step, i.e. the current step is flagged and the previous step is an active note.
5. If entering through a valid slide, change pitch with `setNote` and do not retrigger envelopes.
6. Otherwise, trigger a new note with the calculated accent velocity.
7. Determine whether the current step slides into the next step, i.e. the next step is flagged and active.
8. If it does, keep the note held — schedule no release at all. This applies to both cases above.
9. Otherwise, schedule release at approximately `80%` of the current step duration.
10. If the current step is accented, fire the accent bus at the step's audio time.
11. Schedule the visual current-step update at the supplied audio time.

Use `Tone.Draw.schedule` or an equivalent audio-time-aware UI update for the playback indicator.

### 9.2 Transport controls

Provide separate `Start/Stop` or `Play/Stop` transport controls.

On the first user-initiated start:

```ts
await Tone.start();
Tone.getTransport().start();
```

On stop:

```ts
Tone.getTransport().stop();
synth.triggerRelease();
```

Stopping must silence any held slide note and reset the visible playhead to step 1.

## 10. Application State

Use a serializable state shape similar to:

```ts
type SynthParameters = {
  waveform: "sawtooth" | "square";
  cutoffHz: number;
  resonanceQ: number;
  envMod: number;
  decaySeconds: number;
  accentAmount: number;
  tempoBpm: number;
  volumeDb: number;
  transposeSemitones: number;
};

type Sono303State = {
  mode: "play" | "write";
  transport: "started" | "stopped";
  selectedStep: number;
  currentStep: number | null;
  parameters: SynthParameters;
  steps: Step[];
};
```

State constraints:

- `steps.length` must always equal `16`.
- `envMod` and `accentAmount` must remain between `0` and `1`.
- `selectedStep` must remain between `0` and `15`.
- Audio nodes must not be stored in serializable UI state.
- The synth and sequence must be created once and disposed when the application unmounts.

Use reducer actions with narrow intent rather than replacing arbitrary state:

```ts
type Sono303Action =
  | { type: "transport/toggle" }
  | { type: "transport/setCurrentStep"; stepIndex: number | null }
  | { type: "mode/set"; mode: "play" | "write" }
  | { type: "parameter/set"; key: keyof SynthParameters; value: number | string }
  | { type: "step/select"; stepIndex: number }
  | { type: "step/setPitch"; note: PitchClass }
  | { type: "step/setRest"; rest: boolean }
  | { type: "step/changeOctave"; delta: -1 | 1 }
  | { type: "step/toggleAccent" }
  | { type: "step/toggleSlide" };
```

Reducer actions that edit a step operate on `selectedStep`. Keep the reducer
pure. Tone.js calls belong in the integration hook or engine, never in the
reducer.

## 11. Interface Structure

Create a single-page, front-facing instrument interface named `SONO-303`.
It should feel like a realistic physical silver bass synthesizer translated
carefully into a web application. It must not look like a generic SaaS
dashboard, a plugin window floating inside a DAW, or a photograph pasted onto a
web page.

### 11.1 Page and panel composition

- Use a dark studio-room page background: a near-black floor gradient, a soft
  overhead spotlight behind the instrument, and a corner vignette. The room is
  the environment, not the instrument — **the panel itself stays silver.**
- Center one large instrument panel horizontally and vertically when viewport height permits.
- Target a maximum panel width around `1440px` to `1520px`.
- Use a compact wide landscape proportion similar to the visual reference.
- Present the panel front-on with no perspective transform.
- Wrap the panel in a chamfered metal shell carrying the corner hardware and a
  soft floor reflection beneath the machine.
- Use deep external shadow and rim highlights so the machine reads as a solid
  object standing in the room rather than a card on a page.
- Build every surface, highlight, tick, LED, and shadow with HTML/CSS or small inline SVG where appropriate. Do not use a photograph as the implemented interface.
- Organize the panel into four horizontal zones separated by thin metallic borders.

### 11.2 Zone 1: brand and sound controls

Left-to-right layout:

1. Brand block displaying exactly `SONO-303` in large uppercase dark-charcoal type.
2. `WAVEFORM` two-position control with `SAW` and `SQUARE` labels.
3. Rotary knob labelled `CUTOFF FREQ`.
4. Rotary knob labelled `RESONANCE`.
5. Rotary knob labelled `ENV MOD`.
6. Rotary knob labelled `DECAY`.
7. Rotary knob labelled `ACCENT`.
8. A subtle vertical separator.
9. Rotary knob labelled `VOLUME`.

All six knobs use the same visual component. VOLUME may be slightly separated,
but should not use a different style. Knobs need visible tick marks, a strong
indicator line, metallic depth, and a darker base shadow.

### 11.3 Zone 2: transport and global pitch

Left-to-right layout:

1. Large rectangular `START / STOP` button with a small red transport LED.
2. `MODE` segmented control containing `PLAY` and `WRITE`.
3. Black inset digital display showing the current tempo, for example `125 BPM`.
4. Rotary knob labelled `TEMPO`.
5. A subtle vertical separator.
6. `TRANSPOSE` group with `−`, numeric value, and `+` buttons.

Interaction requirements:

- START / STOP is the only transport button.
- The transport LED is red only while running.
- PLAY and WRITE are modes, not transport actions.
- The active mode uses the lighter pressed/selected treatment.
- Transpose `−` and `+` change one semitone at a time.
- The central transpose button/value resets transposition to `0` when clicked.

### 11.4 Zone 3: 16-step sequencer

- Use a dark charcoal header strip labelled exactly `16 STEP SEQUENCER`.
- Under it, render the 16 identical silver step buttons specified in section 7.3.
- Preserve visible grouping into `1–4`, `5–8`, `9–12`, and `13–16` with spacing or thin separators.
- Buttons remain neutral silver regardless of whether they contain a note or rest.
- The moving red illumination represents the playhead only.
- A thin dark outline represents selection only.
- Place the read-only `A` and `S` status letters below their steps without turning them into controls.

### 11.5 Zone 4: selected-step editor

Left-to-right desktop layout:

1. Selected-step readout such as `SELECTED STEP 5 · C4`.
2. Compact one-octave mini keyboard.
3. `REST` toggle.
4. `OCT −` button.
5. `OCT +` button.
6. `ACCENT` toggle with red LED when active.
7. `SLIDE` toggle with red LED when active.

The editor should be visually subordinate to the 16-step row. The mini keyboard
is a pitch selector, not a playable polyphonic instrument. It must not produce a
second independent synth voice.

### 11.6 Visual design tokens

Use CSS custom properties and keep all colors centralized. Suggested starting
tokens:

```css
:root {
  --page-bg: #eef1f3;
  --panel-silver-light: #f2f3f1;
  --panel-silver: #c9ccca;
  --panel-silver-dark: #969b9c;
  --control-face: #d7d8d5;
  --control-edge: #74797b;
  --ink: #191b1d;
  --muted-ink: #555a5d;
  --inset-dark: #17191a;
  --accent-red: #d52024;
  --accent-red-glow: rgb(213 32 36 / 45%);
  --panel-radius: 10px;
  --control-radius: 4px;
  --touch-target: 44px;

  /* Room — the dark environment the machine stands in */
  --room-bg: #0a0c0d;
  --room-bg-lift: #191e20;
  --room-floor: #050708;
  --rim-light: rgb(255 255 255 / 55%);

  /* Texture — one shared inline-SVG noise field, reused by every material */
  --noise: url("data:image/svg+xml,…feTurbulence fractalNoise…");
}
```

The values may be tuned while implementing, but the **instrument** palette must
remain cool silver, off-white, charcoal, graphite, and restrained red, standing
on a near-black room. Do not add neon colors, blue LEDs, colorful gradients,
wood, or leather, and do not recolor the panel itself dark — the contrast of a
silver machine against a dark room is the intended look.

Suggested panel surface:

```css
background:
  repeating-linear-gradient(
    0deg,
    rgb(255 255 255 / 3%) 0,
    rgb(255 255 255 / 3%) 1px,
    rgb(0 0 0 / 2%) 2px
  ),
  linear-gradient(180deg, var(--panel-silver-light), var(--panel-silver));
```

Surface grain may be added with a small inline-SVG `feTurbulence` noise field
delivered as a CSS data URI (the `--noise` token), blended at low opacity over
the panel, knob caps and button faces. No raster image files — §13 still stands.

Keep the texture subtle. Legibility is more important than material simulation:
the panel stays silver and labels stay dark charcoal, so no contrast pair
changes when the room goes dark.

### 11.7 Typography

- Use a condensed grotesk-style sans-serif stack such as `"Arial Narrow", "Roboto Condensed", Inter, system-ui, sans-serif`.
- Labels are uppercase, compact, and strongly legible.
- Use dark charcoal text on silver.
- Use tabular numerals for BPM, transpose, and step numbers.
- Do not use decorative techno fonts or imitate an existing Roland wordmark.

### 11.8 Rotary knob interaction

Implement `RotaryKnob` as an accessible range control with a custom visual face.

- Pointer drag vertically or radially changes the value.
- Arrow keys change the value when focused.
- Home and End move to minimum and maximum.
- Double-click or an explicit reset behavior may restore the default.
- Provide an accessible label and `aria-valuetext`.
- Display the numeric value in a small tooltip/readout while focused or actively dragged; it does not need to remain permanently visible.
- Use short Tone.js ramps for continuous audio parameters.
- Draw tick marks with CSS/SVG; do not use raster knob images.

### 11.9 Control states

Every interactive control must define:

- Default
- Hover
- Active/pressed
- Selected/on
- Keyboard focus-visible
- Disabled

Use red only for live transport/playhead and enabled Accent/Slide states. Use a
dark outline for selection and a high-contrast neutral outline for keyboard
focus. Do not rely on red alone to distinguish focus from playback.

### 11.10 Responsive behavior

- Desktop: preserve the four horizontal hardware-like zones and one-row 16-step sequencer.
- Tablet: allow sound and transport controls to wrap into balanced groups; the step grid may become two rows of 8.
- Mobile: use a vertically stacked panel, two rows of 8 steps, and a full-width selected-step editor.
- Maintain at least `44px` touch targets.
- Knobs may reduce in diameter but must remain controllable.
- Do not hide required controls on small screens.
- Do not create horizontal page overflow.

### 11.11 Accessibility

- Use actual `button` and `input` semantics.
- All controls must work with keyboard navigation.
- Every knob needs a visible label and accessible current value.
- MODE, WAVEFORM, and other paired controls should expose selected state with `aria-pressed` or appropriate radio semantics.
- Current step announcements must not spam screen readers on every sixteenth note. Keep the visual playhead `aria-hidden` or update it without a live region.
- Respect `prefers-reduced-motion` by reducing LED glow animation and transition duration.
- Maintain readable contrast despite the metallic aesthetic.

## 12. Real-Time Interaction Requirements

The following controls must remain usable during playback:

- Waveform
- Cutoff Frequency
- Resonance
- ENV MOD
- Decay
- Accent amount
- Tempo
- Volume
- Transpose

Prefer short parameter ramps for continuously changing audio parameters:

```ts
parameter.rampTo(nextValue, 0.02);
```

Do not ramp discrete settings such as waveform, step active state, accent flag, slide flag, or stored note.

## 13. Explicit Non-Goals

Do not implement any of the following in the initial version:

- Polyphony
- Multiple oscillators
- Multiple pattern banks
- Pattern chaining or song mode
- The original Pitch Write and Time Write processes
- Variable step count
- Swing or shuffle
- Reverse, random, or alternate playback directions
- Probability or generative sequencing
- MIDI input or output
- Automation recording
- Presets or cloud persistence
- Distortion, overdrive, delay, chorus, or reverb
- Audio export
- Oscilloscope or spectrum analyzer
- Circuit-level analog modeling
- Custom `AudioWorklet` DSP
- Next.js, server rendering, API routes, or backend services
- Client-side routing
- Redux, Zustand, or another global-state package
- Tailwind CSS or a general-purpose UI component library
- Raster images used as functional knobs, buttons, or the panel surface

These features must not complicate the first implementation.

## 14. Acceptance Criteria

The implementation is complete when all of the following are true:

1. A user can create and edit a 16-step pattern.
2. Every step can independently be a note or rest.
3. Every active step can store a pitch and octave.
4. Every step can independently enable accent and slide.
5. The pattern loops in sixteenth notes at the selected tempo.
6. Only one synth voice can sound at a time.
7. Sawtooth and square waveforms sound visibly and audibly selectable.
8. Cutoff, resonance, ENV MOD, and decay produce clearly audible changes.
9. The global ACCENT control affects only accented steps.
10. A valid slide glides into the next note without an audible envelope retrigger.
11. Global transpose changes playback pitch without modifying stored notes.
12. PLAY and WRITE modes behave independently from Start/Stop.
13. Parameters can be manipulated while the pattern plays.
14. The current step indicator remains synchronized with audio playback.
15. Stopping playback releases any held note.
16. The app works with mouse, touch, and keyboard focus.
17. No non-goal feature is required for the core experience to function.
18. The visible product name is exactly `SONO-303`; `ACID BASS` and existing manufacturer branding do not appear.
19. The 16 step buttons are visually identical silver controls; rests are never represented by black buttons.
20. The current playhead uses red illumination and selected-step state uses a separate dark outline.
21. The mini keyboard assigns pitch only to the selected step and does not create polyphony.
22. REST, octave, Accent, and Slide controls update only the selected step.
23. `A` and `S` appear only as read-only step-status indicators.
24. The desktop interface matches the four-zone silver hardware-inspired composition described in section 11.
25. The responsive layout remains usable without horizontal page scrolling.
26. `bun run lint` exits successfully.
27. `bun run build` exits successfully and produces a static Vite build.
28. Starting and stopping repeatedly does not create duplicate sequences, overlapping voices, or leaked Tone.js nodes.

## 15. Implementation Priority

Implement in this order:

1. Scaffold the Bun + Vite + React + TypeScript project and install Tone.js.
2. Create the types, defaults, reducer, and fixed 16-step state model.
3. Implement `Sono303Engine` independently of React.
4. Initialize Tone.js safely from a user gesture.
5. Create and verify the monophonic synth voice.
6. Create the fixed 16-step Tone.js sequence and synchronized playhead callback.
7. Implement notes, rests, step selection, and the mini-keyboard pitch editor.
8. Implement waveform and the six rotary controls.
9. Implement per-step Accent and its global amount.
10. Implement per-step Slide without envelope retrigger.
11. Implement global transpose and its reset control.
12. Implement PLAY/WRITE rules independently from Start/Stop.
13. Build the complete four-zone SONO-303 visual interface from CSS/SVG primitives.
14. Add responsive layouts and accessible control semantics.
15. Test transport cleanup, loop-boundary slide, live editing, and repeated Start/Stop.
16. Run lint and production build; resolve all failures and TypeScript errors.

Do not begin optional enhancements until every acceptance criterion passes.

## 16. Reference Links

- Vite guide and React TypeScript template: <https://vite.dev/guide/>
- React application guidance: <https://react.dev/learn/creating-a-react-app>
- Roland TB-303 product and specification overview: <https://www.roland.com/global/products/rc_tb-303/>
- Tone.js `MonoSynth`: <https://tonejs.github.io/docs/15.0.4/classes/MonoSynth.html>
- Tone.js `Sequence`: <https://tonejs.github.io/docs/15.0.4/classes/Sequence.html>
- Tone.js `Filter`: <https://tonejs.github.io/docs/15.0.4/classes/Filter.html>

## 17. Final Agent Handoff Checklist

Before completion, the implementing agent must confirm all of the following:

- The project starts with `bun run dev`.
- The production build succeeds with `bun run build`.
- Linting succeeds with `bun run lint`.
- The interface displays `SONO-303` exactly.
- No Next.js or backend code exists.
- There is only one Tone.js synth voice and one active sequence.
- Audio starts only from an explicit user gesture.
- Audio stops cleanly and the engine disposes on unmount.
- All 16 steps are present and loop correctly.
- Notes, rests, octave, Accent, Slide, and transpose behave according to this specification.
- Current-step and selected-step indicators remain visually distinct.
- Desktop, tablet, and mobile layouts remain usable.
- All required controls have keyboard focus and accessible names.
- No feature from Explicit Non-Goals was added.

When all checks pass, provide a concise implementation summary, the commands to
run the project, and any deliberate deviations from this specification. Do not
claim completion while known build, lint, audio, or interaction failures remain.
