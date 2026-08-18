# SONO-303

A browser-based acid bass synthesizer: one monophonic bass voice, a resonant
low-pass filter, per-step accent and slide, and a looping 16-step sequencer.
Built with React, TypeScript, and Tone.js.

## Quickstart

```bash
bun install
bun run dev
```

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
