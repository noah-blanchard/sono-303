# AGENTS.md — Guidelines for Agent Contributors

These rules apply to any agent (human or AI) working in this repository.
The product specification in [concept/TB303_ARCHITECTURE.md](concept/TB303_ARCHITECTURE.md)
is the single source of truth; this file summarizes the operational rules.

## Stack (mandatory)

- **Bun** for package management and scripts (`bun install`, `bun add`, `bun run …`)
- **Vite** dev server and bundler
- **React 19** for the interface
- **TypeScript** strict mode
- **Tone.js** for all audio
- **Plain CSS** (no CSS frameworks)
- **React `useReducer`** for application state

Do **not** introduce: Next.js or any backend, routing, Redux/Zustand, UI
component libraries, CSS frameworks (Tailwind etc.), knob libraries, or
anything from the spec's Explicit Non-Goals (§13).

## Branding

- The product name displayed in the interface is exactly **`SONO-303`**.
- Never display `ACID BASS`, `TB-303`, `Roland`, or other existing product
  or company names as the application brand.

## Architecture boundaries (enforced)

1. `src/audio/` — framework-free TypeScript. **No React imports.** Owns all
   Tone.js objects. See [docs/ENGINE_API.md](docs/ENGINE_API.md).
2. `src/components/` — presentational React. **No Tone.js imports, no
   `src/audio/` imports.** Communicate only by dispatching reducer actions.
3. `src/sequencer/` — pure data model. No React, no Tone.js.
4. `src/state/sono303Reducer.ts` — pure function. No side effects, no
   Tone.js, no audio calls. State must stay serializable.
5. `src/hooks/useSono303.ts` — the **only** file allowed to bridge React and
   `src/audio/`.
6. Musical decision logic lives in pure functions (`src/audio/stepLogic.ts`,
   `src/sequencer/pitch.ts`) so it is unit-testable without Web Audio.

## State invariants

- `steps` always has exactly 16 entries.
- `envMod` / `accentAmount` stay in `0..1`; step octave in `1..5`;
  transpose in `±12`; `selectedStep` in `0..15`.
- Enabling REST on a step resets its `accent` and `slide` to `false`.
- Mode (`play`/`write`) and transport (`started`/`stopped`) are independent —
  changing one must never change the other.

## Audio rules

- Audio initializes only from an explicit user gesture.
- Exactly one synth voice and one sequence exist at a time.
- `start()`/`stop()` are idempotent; repeated cycles must not leak nodes or
  create duplicate sequences.
- `stop()` releases held notes and clears the playhead.
- Continuous parameters ramp (`rampTo(v, 0.02..0.05)`); discrete ones don't.
- Tone.js Transport owns timing — never `setInterval`/rAF for audio
  scheduling (the M1 mock uses a timer but produces no audio).

## Verification commands

Run all of these before declaring any milestone complete:

```bash
bun run lint    # ESLint — must exit clean
bun run build   # tsc -b && vite build — must exit clean
bun test        # Vitest (from Milestone 2) — must pass
```

Also smoke-test `bun run dev` in a real browser for anything audio-related;
build/lint cannot verify autoplay policies or sound.

## Milestone roadmap

See [docs/PLAN.md](docs/PLAN.md) for the full plan.

- **M0 — Docs**: README, docs/ARCHITECTURE.md, docs/ENGINE_API.md, AGENTS.md
- **M1 — Interactive UI**: full four-zone silver panel, reducer state,
  mock engine with simulated playhead. No sound.
- **M2 — Sound engine**: pure step logic + tests, real `Sono303Engine`,
  one-line factory swap in `useSono303`.

## Working agreements

- Prefer the simplest implementation satisfying the spec.
- Make focused changes; don't refactor beyond the task.
- Keep docs in sync when architecture decisions change.
- Do not claim completion while build, lint, test, or interaction failures
  remain.
