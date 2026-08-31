# SONO-303

A browser-based acid bass synthesizer: one monophonic bass voice, a resonant
low-pass filter, per-step accent and slide, and a looping 16-step sequencer —
playable live from the computer keyboard or a MIDI controller.
Built with React, TypeScript, Tone.js and WEBMIDI.js.

## Quickstart

```bash
bun install
bun run dev
```

## Playing it

The instrument has two modes, selected with the MODE buttons.

- **WRITE** — build a pattern. Every note you play is written into the selected
  step, which then advances, so you can fill sixteen steps in sixteen
  keystrokes. START/STOP runs the pattern.
- **PLAY** — a live monosynth. The sequencer stops and its controls lock; the
  keyboard, OCT −/+ and every sound knob stay live.

### Computer keyboard

Two rows of keys form two octaves, laid out like FL Studio. They are mapped by
**physical key position**, not by the letter printed on the cap, so the note
rows stay in the same place on any layout — on AZERTY the key labelled `W`
plays the low C. OCT −/+ moves what both rows play.

```
upper octave    2 3   5 6 7      (black)
                Q W E R T Y U    (white)

lower octave   S D   G H J       (black)
               Z X C V B N M     (white)
```

The KEYS button prints these caps on the on-screen keyboard; turn it off for a
clean panel.

### MIDI

Press **ENABLE** under MIDI, accept the browser prompt, then pick an input
(default: all of them). Notes sound at their true pitch across the controller's
full range, and velocity drives both loudness and accent — hit at 100 or harder
and the note accents, which in WRITE is written onto the step.

Web MIDI needs Chrome, Edge or Firefox; Safari does not implement it and the
control shows `N/A`. If it shows `BLOCKED`, the permission was refused for this
origin — re-allow it under the site settings icon in the address bar
(`chrome://settings/content/midiDevices`), since no page-level code can undo a
stored refusal.

## Scripts

| Command          | Description                        |
| ---------------- | ---------------------------------- |
| `bun run dev`    | Start the Vite development server  |
| `bun run build`  | Type-check and produce a static build |
| `bun run lint`   | Run ESLint                         |
| `bun run preview`| Preview the production build       |
| `bun test`       | Run unit tests (Vitest, from Milestone 2) |

## Documentation

- [docs/PLAN.md](docs/PLAN.md) — milestone plan (docs → UI → sound engine)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — repo map, module boundaries, state model, data flow
- [docs/ENGINE_API.md](docs/ENGINE_API.md) — UI-agnostic sound engine contract
- [AGENTS.md](AGENTS.md) — guidelines for agent contributors
- [concept/TB303_ARCHITECTURE.md](concept/TB303_ARCHITECTURE.md) — product specification (source of truth)

## Status

All milestones are complete: the panel is fully interactive and the real
Tone.js sound engine (`src/audio/Sono303Engine.ts`) is wired in. Audio only
ever starts from an explicit user gesture (the START button).

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
