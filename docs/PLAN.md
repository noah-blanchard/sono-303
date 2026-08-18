# Plan: SONO-303 — Docs → UI → Sound Engine (3 Milestones)

## Overview

Build SONO-303 per concept/TB303_ARCHITECTURE.md, targeting the visual design of concept/concept_art_sono303.png. The work is split so the **sound engine and UI are fully decoupled**: the engine is a framework-agnostic TypeScript class with a small imperative API + listener callback, testable in isolation; the UI is a React app holding all serializable state in a `useReducer`. The only bridge is the `useSono303` hook.

Current workspace state: fresh Vite react-ts scaffold (default App.tsx demo), `tone@^15.1.22` already installed, scripts already correct (`dev/build/lint/preview`). No src subfolders yet.

Key architectural contract (stable across both milestones):

```
React state (useReducer, serializable)
   │  dispatch actions only
   ▼
useSono303 hook  ──►  Sono303Engine (framework-free TS class)
   ◄── stepListener(stepIndex)      owns Tone.MonoSynth + Tone.Sequence
```

- UI → engine: `setPattern(pattern)`, `setParameters(params)`, `start()`, `stop()`, `dispose()`, `initialize()`
- Engine → UI: single `setStepListener((stepIndex: number | null) => void)` callback
- Engine never imports React; UI never imports Tone.js (except inside `src/audio/`).
- All musical decision logic (pitch math, slide detection, velocity, release timing) lives in **pure functions** in `src/audio/stepLogic.ts` — unit-testable without Web Audio.

---

## MILESTONE 0 — Documentation

**Phase 0.1 — Docs**
1. Rewrite `README.md`: product name SONO-303, quickstart (`bun install`, `bun run dev`), scripts table, link to docs.
2. Create `docs/ARCHITECTURE.md`: repo map (folder-by-folder), module boundaries diagram, state model, reducer action catalog, engine API contract, data-flow sequence for "user drags knob" and "sequence plays a step", rules (UI never touches Tone.js; engine never touches React; state must stay serializable).
3. Create `docs/ENGINE_API.md`: the full `Sono303EngineApi` contract — every method signature, semantics, timing guarantees, listener contract, dispose rules, and "how to connect ANY UI" guide with a minimal non-React (vanilla TS) usage example.
4. Create `AGENTS.md` at repo root: stack rules (bun, Vite, React, TS strict, Tone.js, plain CSS), architecture boundaries, naming/branding rules (SONO-303 only, never ACID BASS/Roland/TB-303 in UI), non-goals list, verification commands (`bun run lint`, `bun run build`, `bun test`), milestone roadmap.

**Verify M0**: docs render, commands listed match package.json.

---

## MILESTONE 1 — Interactive UI (no audio)

Goal: complete four-zone silver panel matching concept_art_sono303.png, fully interactive, all state working, **simulated playhead** behind a seam that M2 replaces.

**Phase 1.1 — State core (pure, testable, no rendering)**
1. `src/sequencer/types.ts` — `PitchClass`, `Step`, `Pattern`, `SynthParameters`, `Sono303State`, `Sono303Action` exactly per spec §7.2/§10.
2. `src/sequencer/defaults.ts` — `defaultStep`, `defaultParameters` (spec §4 defaults: 350 Hz, Q 8, envMod .65, decay .3, accent .6, 125 BPM, −8 dB, transpose 0), `createInitialState()` (16 steps).
3. `src/sequencer/pitch.ts` — pure: `pitchClassToSemitone`, `stepToMidi(step, transpose)`, `stepToNoteName(step)` for the readout (e.g. `C4`), `midiToFrequency`. No Tone.js imports.
4. `src/state/sono303Reducer.ts` — pure reducer with the exact narrow action set from spec §10; enforces invariants (steps.length===16, envMod/accentAmount clamped 0–1, selectedStep 0–15, octave clamped 1–5, REST resets accent/slide to false, transpose clamped ±12).
5. `src/state/Sono303Context.tsx` — `Sono303Provider` (useReducer) + `useSono303State()` + `useSono303Dispatch()` hooks so components stay decoupled from reducer wiring. *Depends on 1–4.*

**Phase 1.2 — Engine seam + simulated playhead**
6. Define the final engine contract now so M2 drops in without UI changes: `src/audio/engineApi.ts` exporting the `Sono303EngineApi` type (per spec §3.3, with `setStepListener(listener: (stepIndex: number | null) => void)`).
7. `src/audio/MockSono303Engine.ts` — class implementing `Sono303EngineApi` with zero Tone.js imports: `start()` runs a `setInterval` at `60000/(bpm*4)` ms, reads tempo from `setParameters`, calls the step listener 0→15 looping; `stop()` clears and emits `null`. This is the M1 stand-in and doubles as a reference implementation for docs/ENGINE_API.md. *Parallel with Phase 1.1.*
8. `src/hooks/useSono303.ts` — accepts an engine factory (default: mock in M1), creates the engine once (stable ref), forwards `setParameters`/`setPattern` on state change via effects, maps transport state to `start()/stop()`, subscribes the step listener to `transport/setCurrentStep`, disposes on unmount. Engine instance is injected so M2 swaps factory to the real engine with a one-line change. *Depends on 5, 6, 7.*

**Phase 1.3 — Shared controls**
9. `src/components/RotaryKnob.tsx` — accessible custom knob: `role="slider"` with `aria-valuemin/max/now/valuetext` + visible label; vertical drag (pointer capture, ~150 px full range, shift = fine), ArrowUp/Down ±step (Shift = coarse), Home/End, double-click reset to default; normalized 0–1 internal model with `toDisplay`/`fromDisplay` formatter props (log mapping for cutoff/tempo happens here via props, keeping knob generic); CSS-drawn tick ring + indicator line, tooltip readout while dragging/focused.
10. `src/components/LedButton.tsx`-style primitives as needed (small presentational button w/ LED slot) — keep inside individual components if simpler.

**Phase 1.4 — Panel zones (per concept art)**
11. `src/components/Sono303Panel.tsx` — four-zone layout shell, brand block `SONO-303`, metallic zone separators.
12. `src/components/SoundControls.tsx` (Zone 1) — waveform SAW/SQUARE segmented toggle + 6 knobs: CUTOFF FREQ (log 80–5000 Hz), RESONANCE (0–20), ENV MOD (0–100%), DECAY (0.05–1.5 s), ACCENT (0–100%), separator, VOLUME (−36–0 dB). Each knob dispatches `parameter/set`.
13. `src/components/TransportControls.tsx` (Zone 2) — START/STOP button with red LED (lit only while running), MODE PLAY/WRITE segmented control (`aria-pressed`), black inset digital tempo display (`NNN BPM`, tabular numerals), TEMPO knob (60–200 BPM), TRANSPOSE −/value/+ (value click resets to 0).
14. `src/components/StepSequencer.tsx` + `src/components/StepButton.tsx` (Zone 3) — dark charcoal `16 STEP SEQUENCER` header strip; exactly 16 identical silver buttons numbered 1–16, grouped 4×4 with separators; selection = thin dark outline; playhead = red rim/glow; both = dark inner outline + red outer glow; read-only `A`/`S` status letters below steps; playhead element `aria-hidden`; clicking selects in WRITE mode (and selection still allowed in PLAY; editing controls disabled in PLAY per spec).
15. `src/components/StepEditor.tsx` + `src/components/MiniKeyboard.tsx` (Zone 4) — readout `SELECTED STEP {n} · {NOTE|REST}`; one-octave chromatic keyboard (7 white + 5 black CSS keys) that sets pitch + `active=true`, selected key gets restrained red outline; REST toggle; OCT −/+ (clamp 1–5); ACCENT and SLIDE toggles with red LEDs; all editor controls disabled/visually muted in PLAY mode and ACCENT/SLIDE muted while step is a rest.

**Phase 1.5 — Styling**
16. `src/styles/tokens.css` — spec §11.6 tokens verbatim as starting point.
17. `src/styles/sono303.css` — panel surface (subtle brushed-metal gradient per spec), knob faces (metallic depth, tick marks, indicator), buttons, inset display (dark bg, segmented/numeric feel via letter-spacing + tabular numerals, no decorative font), mini-keyboard, LED glows, all six control states (default/hover/active/selected/focus-visible/disabled), `prefers-reduced-motion` handling.
18. Responsive: desktop 4 zones + one-row 16 steps (max panel ~1440–1520 px); tablet wrap controls + steps may go 2×8; mobile stacked, 2×8 steps, full-width editor; ≥44 px touch targets; no horizontal overflow.
19. Replace `src/App.tsx` (drop Vite demo + App.css), update `src/index.css` (page bg, font stack per §11.7), `index.html` title `SONO-303`.

**Verify M1**: `bun run lint`, `bun run build` clean; every control interactive via mouse/touch/keyboard; START animates simulated playhead at correct tempo; WRITE/PLAY edit gating works; matches concept art layout.

---

## MILESTONE 2 — Real sound engine

**Phase 2.1 — Pure step logic (unit-tested, zero Tone.js)**
20. `src/audio/stepLogic.ts` — pure functions consumed by the engine AND unit tests:
    - `computeStepEvent(prev, cur, next, params, stepDuration)` → `{ kind: "rest" | "trigger" | "slideIn", frequency, velocity, releaseAfter: number | null, portamento }` implementing spec §9.1 rules 1–9 (slide-in detection via prev.slide && prev.active && cur.active; slide-out hold; 80% release; velocity = 0.65 + accentAmount*0.35 when accented; portamento = 0.6×stepDuration on slide entry else 0).
    - `stepDurationSeconds(bpm)` = `60 / bpm / 4`.
21. Add `vitest` (bun add -d vitest) + `src/audio/stepLogic.test.ts` + `src/sequencer/pitch.test.ts` — cover: rest releases held note; slide only when prev+cur active; slide 16→1 wrap; accent velocity bounds (accent=0 ⇒ identical velocities); transpose math; envMod/clamp invariants in reducer tests (`src/state/sono303Reducer.test.ts`). Add `"test": "vitest run"` script.

**Phase 2.2 — Engine implementation**
22. `src/audio/Sono303Engine.ts` — framework-free class implementing `Sono303EngineApi`:
    - Lazy-creates one `Tone.MonoSynth` (spec §5 config verbatim) + one `Tone.Sequence` over indices 0–15 at `"16n"`, `.start(0)`, loop — created exactly once in `initialize()`.
    - Holds latest `Pattern`/`SynthParameters` in private mutable refs (`setPattern`/`setParameters` just swap refs — sequence never recreated on edit).
    - `playStep(time, i)` reads refs, calls `computeStepEvent`, executes against Tone: `triggerAttack(freq, time, velocity)` / `setNote(freq, time)` / `triggerRelease(time + releaseAfter)`; schedules playhead via `Tone.getDraw().schedule(() => listener(i), time)`.
    - `start()`: `await Tone.start()` then transport start. `stop()`: transport stop + `synth.triggerRelease()` + listener(null).
    - `setParameters`: ramps continuous params (cutoff→`filterEnvelope.baseFrequency`, Q, decay, envMod→`octaves` ×5, tempo→`bpm.rampTo(bpm, 0.05)`, volume); waveform assigned directly (`synth.oscillator.type`).
    - `dispose()`: sequence.dispose(), synth.dispose(), transport stop — idempotent.
23. Engine unit test with a mocked `tone` module (`vitest` `vi.mock`): assert one synth/sequence created, trigger/setNote/release calls match `computeStepEvent` output for scripted patterns (slide chain, rest, accent, wrap). *Depends on 20–22.*

**Phase 2.3 — Wiring**
24. Swap engine factory in `useSono303` default (or App) from `MockSono303Engine` to `Sono303Engine` — one-line change; hook API untouched. Keep mock for tests/demos.
25. Delete mock's usage from production path; verify first START requires user gesture (it does — button click), audio init happens in `initialize()` called from the first start.

**Verify M2**: all spec §14 audio criteria — audible waveform switch, cutoff/res/envmod/decay sweeps, accent affects only flagged steps, slide glides with no retrigger (incl. 16→1), transpose live, tempo live, stop silences held note, repeated start/stop leaves no duplicate sequences/leaks; `bun test`, `bun run lint`, `bun run build` all clean; update docs (README status, ARCHITECTURE engine section now real).

---

## Relevant files

**To create (M0):** `README.md` (rewrite), `docs/ARCHITECTURE.md`, `docs/ENGINE_API.md`, `AGENTS.md`

**To create (M1):**
- `src/sequencer/types.ts`, `src/sequencer/defaults.ts`, `src/sequencer/pitch.ts`
- `src/state/sono303Reducer.ts`, `src/state/Sono303Context.tsx`
- `src/audio/engineApi.ts`, `src/audio/MockSono303Engine.ts`
- `src/hooks/useSono303.ts`
- `src/components/RotaryKnob.tsx`, `Sono303Panel.tsx`, `SoundControls.tsx`, `TransportControls.tsx`, `StepSequencer.tsx`, `StepButton.tsx`, `StepEditor.tsx`, `MiniKeyboard.tsx`
- `src/styles/tokens.css`, `src/styles/sono303.css`

**To create (M2):** `src/audio/stepLogic.ts`, `src/audio/Sono303Engine.ts`, tests (`*.test.ts`), `vitest` dev dep

**To modify:** `src/App.tsx` (replace demo), `src/main.tsx` (wrap provider), `src/index.css`, `index.html` (title), `package.json` (test script), delete `src/App.css`, `src/assets/*` demo files

**Reference:** `concept/TB303_ARCHITECTURE.md` (spec), `concept/concept_art_sono303.png` (visual target)

## Decisions

- Docs = full set (README, ARCHITECTURE, ENGINE_API, AGENTS.md).
- Engine testability via pure `stepLogic.ts` + vitest, plus a mocked-Tone engine test. Mock engine from M1 stays as test/demo artifact.
- M1 includes simulated playhead via `MockSono303Engine` behind the real engine API — so M2 wiring is a one-line factory swap, not a refactor.
- Knob = vertical drag + full keyboard support + double-click reset; log mapping passed as props (knob stays generic).
- Engine contract adds `null` to the step listener payload (vs spec's `number`) to represent "stopped/cleared playhead".
- `Sono303Context` added to spec's file list — keeps components from importing reducer/dispatch directly (cleaner seam, still `useReducer` underneath).
- Out of scope: everything in spec §13 non-goals.

## Further considerations

1. Dev-server smoke test: after implementation, run `bun run dev` and verify audio unlock in a real browser (autoplay policies can't be verified by build/lint alone).
