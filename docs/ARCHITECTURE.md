# SONO-303 Architecture

This document describes how the repository is organized and how its modules
interact. It is the companion to the product specification
([concept/TB303_ARCHITECTURE.md](../concept/TB303_ARCHITECTURE.md)) and the
engine contract ([ENGINE_API.md](ENGINE_API.md)).

## 1. Design goals

1. **The sound engine is UI-agnostic.** `src/audio/` is framework-free
   TypeScript. It never imports React and is importable from any host
   (React, vanilla TS, tests).
2. **The UI never touches Tone.js.** Components and state only dispatch
   serializable actions and read serializable state. The single integration
   point is `useSono303`.
3. **Musical decisions are pure functions.** Pitch math, slide detection,
   velocity, and release timing live in `src/audio/stepLogic.ts` and
   `src/sequencer/pitch.ts` — unit-testable without Web Audio.
4. **State is serializable.** Everything the UI knows lives in one
   `useReducer` state tree. No Tone.js objects, no class instances.

## 2. Repo map

```
sono-303/
├── concept/                    # Product spec + visual reference (read-only inputs)
│   ├── TB303_ARCHITECTURE.md   #   Authoritative product specification
│   ├── SONO_DIST_ARCHITECTURE.md#  Distortion module specification
│   ├── concept_art_sono303.png #   Visual target for Milestone 1
│   ├── dist_concept_art.png    #   Visual target for SONO-DIST
│   └── concept_art_2.png
├── docs/
│   ├── PLAN.md                 # Milestone plan (M0 docs → M1 UI → M2 engine)
│   ├── ARCHITECTURE.md         # This file
│   └── ENGINE_API.md           # UI-agnostic engine contract
├── AGENTS.md                   # Guidelines for agent contributors
├── src/
│   ├── audio/                  # Sound engines — NO React imports allowed
│   │   ├── engineApi.ts        #   Sono303EngineApi interface + factory type
│   │   ├── MockSono303Engine.ts#   Mock engine (M1 stand-in, zero Tone.js)
│   │   ├── Sono303Engine.ts    #   Real Tone.js engine (Milestone 2)
│   │   ├── stepLogic.ts        #   Pure per-step musical decisions (M2)
│   │   ├── distEngineApi.ts    #   SonoDistEngineApi interface
│   │   ├── SonoDistEngine.ts   #   SONO-DIST effect graph + mode transitions
│   │   ├── distortionCurves.ts #   Pure transfer curves for the three voicings
│   │   └── SonoAudioRig.ts     #   Owns the whole path and the one route out
│   ├── sequencer/              # Pure data model — NO React, NO Tone.js
│   │   ├── types.ts            #   Step, Pattern, SynthParameters, State, Action
│   │   ├── defaults.ts         #   Default parameters & 16-step pattern
│   │   ├── distortionMapping.ts#   DRIVE/TONE/LEVEL → Hz, dB, compensation
│   │   └── pitch.ts            #   Pitch-class / octave / transpose math
│   ├── state/                  # React state layer
│   │   ├── sono303Reducer.ts   #   Pure reducer (serializable in/out)
│   │   ├── sonoDistReducer.ts  #   Pure sub-reducer for the module
│   │   └── Sono303Context.tsx  #   Provider + state/dispatch hooks
│   ├── hooks/
│   │   └── useSono303.ts       #   THE integration seam (rig ↔ reducer)
│   ├── components/             # Presentational React — dispatch only
│   │   ├── Workbench.tsx       #   Both units + the patch cable between them
│   │   ├── Sono303Panel.tsx    #   Four-zone instrument layout
│   │   ├── SoundControls.tsx   #   Zone 1: waveform + knobs
│   │   ├── TransportControls.tsx#  Zone 2: start/stop, mode, tempo, transpose
│   │   ├── StepSequencer.tsx   #   Zone 3: 16-step grid
│   │   ├── StepButton.tsx      #   One step button + A/S indicators
│   │   ├── StepEditor.tsx      #   Zone 4: selected-step editor
│   │   ├── MiniKeyboard.tsx    #   Two-octave pitch selector (C1–B2 … C5–B6)
│   │   ├── SonoDistPanel.tsx   #   SONO-DIST faceplate
│   │   ├── DistortionModeSelector.tsx# Exclusive four-way voicing selector
│   │   ├── JackSocket.tsx      #   Panel jack; click/keyboard patch toggle
│   │   ├── PatchCable.tsx      #   Draggable plug + drawn lead
│   │   └── RotaryKnob.tsx      #   Accessible reusable knob
│   ├── styles/
│   │   ├── tokens.css          #   Design tokens (colors, radii, sizes)
│   │   ├── sono303.css         #   Instrument-specific styling
│   │   └── sono-dist.css       #   Module, jacks and cable styling
│   ├── App.tsx                 #   Composition root
│   └── main.tsx                #   Entry: mounts App with provider
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig*.json
```

## 3. Module boundaries

```mermaid
flowchart TD
    subgraph UI["React (state + components)"]
        C[components/*] -- dispatch actions --> R[sono303Reducer]
        R -- new state --> C
        R --> CTX[Sono303Context]
    end
    subgraph SEAM["Integration seam"]
        H[useSono303 hook]
    end
    subgraph ENGINE["Engines (framework-free)"]
        RIG[SonoAudioRig<br/>owns the signal path]
        API[engineApi.ts<br/>Sono303EngineApi]
        MOCK[MockSono303Engine]
        REAL[Sono303Engine]
        LOGIC[stepLogic.ts<br/>pure functions]
        DIST[SonoDistEngine]
        CURVES[distortionCurves.ts<br/>pure functions]
    end
    subgraph SEQ["Pure data model"]
        T[sequencer/types.ts]
        P[sequencer/pitch.ts]
        D[sequencer/defaults.ts]
        M[sequencer/distortionMapping.ts]
    end;

    CTX --> H
    H -- setPattern / setParameters / start / stop --> RIG
    H -- dist.setState / setPatched --> RIG
    RIG --> API
    RIG --> DIST
    API -- stepListener(stepIndex | null) --> H
    REAL --> LOGIC
    DIST --> CURVES
    DIST --> M
    C --> M
    H -- dispatch transport/setCurrentStep --> R
    R --> T
    LOGIC --> P
```

`distortionMapping.ts` sits in the pure data model rather than in `src/audio/`
precisely so both the effect engine and the knob readouts can use it without
breaking the components-never-import-audio rule.

### Signal path

Exactly one route reaches `Tone.Destination`, and it is owned by
`SonoAudioRig`:

```text
Sono303Engine.output ─┬─► direct  ──────────────────────────┐
                      │                                     ├─► master ─► limiter(-1) ─► Destination
                      └─► SonoDistEngine ─────────► patched ┘
```

Both branches stay connected for the session; the patch cable only cross-ramps
the two gains, so plugging in cannot click and the dry signal can never leak
out alongside the processed one. Inside `SonoDistEngine`, BYPASS is a real dry
path through a `Tone.CrossFade`, not a distortion turned down.

Rules:

- `src/components/*` imports from `src/state/*` and `src/sequencer/types.ts`
  only. **Never** from `src/audio/*` and **never** imports `tone`.
- `src/hooks/useSono303.ts` is the **only** file allowed to import both
  `src/audio/*` and the React layer.
- `src/audio/*` never imports React.
- `src/sequencer/*` imports neither React nor Tone.js.
- The reducer is a pure function: `(state, action) => state`, no side effects.

## 4. State model

```ts
// src/sequencer/types.ts (summary — see file for the canonical definitions)
type Sono303State = {
  mode: "play" | "write";            // independent from transport
  transport: "started" | "stopped";
  selectedStep: number;              // 0..15
  currentStep: number | null;        // playhead, null when stopped
  keyboardOctave: number;            // 1..5, lowest octave the keyboard shows
  parameters: SynthParameters;       // 9 synth/transport values
  steps: Step[];                     // ALWAYS exactly 16
  patched: boolean;                  // is the cable in SONO-DIST?
  dist: SonoDistState;               // mode + three normalized knobs
};
```

Invariants enforced by the reducer:

- `steps.length === 16` at all times.
- `selectedStep` clamped to `0..15`; `currentStep` is `null` or `0..15`.
- `envMod`, `accentAmount` clamped to `0..1`.
- `keyboardOctave` clamped to `1..5` — the five two-octave windows C1–B2, C2–B3,
  … C5–B6. It moves on OCT −/+ and when a newly selected step's pitch is off
  screen; picking a key never moves it.
- Step octave clamped to `1..6`: the top window's upper row is octave 6, so a
  pitch can sit one octave above the highest OCT level. Transpose clamped to `±12`.
- Enabling REST resets `accent` and `slide` to `false` (no hidden state).
- `dist.drive`, `dist.tone`, `dist.level` clamped to `0..1`; exactly one
  `dist.mode` at a time. Knob values survive a trip through BYPASS untouched.
- Whether SONO-DIST is *active* is never stored — it is derived as
  `patched && dist.mode !== "bypass"`, so it cannot contradict either.
- Nothing non-serializable (Tone.js nodes, functions) ever enters state.

## 5. Action catalog

All reducer actions (`src/sequencer/types.ts`, `Sono303Action`):

| Action                        | Payload                    | Effect |
| ----------------------------- | -------------------------- | ------ |
| `transport/toggle`            | —                          | started ↔ stopped |
| `transport/setCurrentStep`    | `stepIndex: number \| null`| move/clear playhead |
| `mode/set`                    | `"play" \| "write"`        | switch mode (never touches transport) |
| `parameter/set`               | `key`, `value`             | set one `SynthParameters` field |
| `step/select`                 | `stepIndex`                | choose step 0..15; re-centres the keyboard window if that step is off screen |
| `step/setPitch`               | `note`, `octave?`          | set note + `active = true`; never moves the window |
| `step/setRest`                | `rest: boolean`            | rest on/off; on ⇒ clears accent+slide |
| `step/advance`                | —                          | select the next step, wrapping 15→0; never moves the keyboard window |
| `step/changeOctave`           | `delta: -1 \| 1`           | moves window (1..5) and selected pitch (1..6) together |
| `step/toggleAccent`           | —                          | flip accent (no-op while rest) |
| `step/toggleSlide`            | —                          | flip slide (no-op while rest) |
| `patch/set`                   | `patched: boolean`         | plug/unplug the cable into SONO-DIST |
| `dist/setMode`                | `mode`                     | select one voicing, or `bypass` |
| `dist/setDrive`               | `value: number`            | DRIVE, clamped to `0..1` |
| `dist/setTone`                | `value: number`            | TONE, clamped to `0..1` |
| `dist/setLevel`               | `value: number`            | LEVEL, clamped to `0..1` |

Step-editing actions operate on `selectedStep`. The four `dist/*` actions are
delegated to `sonoDistReducer`, which owns the `dist` sub-state.

## 6. Data flow — two canonical paths

### Path A: "User drags the CUTOFF knob"

```mermaid
sequenceDiagram
    participant K as RotaryKnob
    participant D as dispatch
    participant R as sono303Reducer
    participant H as useSono303
    participant E as Sono303Engine

    K->>D: parameter/set { key: "cutoffHz", value: 1820 }
    D->>R: pure reducer update
    R-->>H: state.parameters changed
    H->>E: setParameters(parameters)
    E->>E: synth.filterEnvelope.baseFrequency = 1820 (ramped)
```

1. The knob computes a value and dispatches `parameter/set`.
2. Reducer returns new state; React re-renders.
3. `useSono303` observes `state.parameters` and calls `engine.setParameters`.
4. The engine applies short ramps for continuous parameters
   (`param.rampTo(next, 0.02)`). Discrete values (waveform) are assigned
   directly without ramping.

### Path B: "Transport plays step 7"

```mermaid
sequenceDiagram
    participant T as Tone.Transport
    participant E as Sono303Engine
    participant H as useSono303
    participant R as sono303Reducer
    participant S as StepButton[7]

    T->>E: sequence callback(time, 7)
    E->>E: computeStepEvent(prev, cur, next, params)
    E->>T: triggerAttack / setNote / triggerRelease
    E->>H: stepListener(7) via Tone.Draw.schedule
    H->>R: dispatch transport/setCurrentStep { stepIndex: 7 }
    R-->>S: currentStep === 7 ⇒ red playhead styling
```

1. Tone.js Transport owns timing and fires the sequence callback.
2. The engine reads the **latest** pattern from a stable mutable reference —
   live edits need no sequence rebuild.
3. All musical decisions come from the pure `computeStepEvent` function.
4. The visual playhead is scheduled at audio time through `Tone.Draw`.
5. The engine's ONLY back-channel to the UI is `stepListener(stepIndex)`.

## 7. Milestone architecture status

| Layer                    | M0 | M1                         | M2                      |
| ------------------------ | -- | -------------------------- | ----------------------- |
| Docs                     | ✅ | —                          | updated                 |
| `sequencer/*`            | —  | pure data model            | + pitch tests           |
| `state/*`                | —  | reducer + context          | + reducer tests         |
| `audio/engineApi.ts`     | —  | interface defined          | unchanged               |
| Engine implementation    | —  | `MockSono303Engine` (timer)| `Sono303Engine` (Tone.js) ✅ |
| `audio/stepLogic.ts`     | —  | —                          | pure logic + tests ✅   |
| `components/*`           | —  | full four-zone UI          | unchanged               |
| `hooks/useSono303.ts`    | —  | wired to mock factory      | real engine factory ✅  |

The mock and the real engine implement the **same** `Sono303EngineApi`.
Milestone 2 changed nothing in `components/`, `state/`, or `sequencer/` —
only which factory `useSono303` uses by default. The mock remains in the
repo as a test/demo artifact and as a reference implementation of the
engine contract.
