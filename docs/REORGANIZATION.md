# Source reorganization

This migration reorganizes the existing application in place. It prepares the
project for a movable module table without changing the current audio graph,
instrument behavior or panel design. React Flow and a generic multi-instance
host are follow-up work, not features of this migration.

## Current responsibilities

| Location | Owns |
| --- | --- |
| `src/core/audio/` | Framework-free Tone.js engines, current rig, recording, WAV export, worklet and audio tests |
| `src/core/sequencer/` | Pure musical data, mappings, current patch rules and their tests |
| `src/studio/audio/` | `useSono303`, the sole React-to-core-audio bridge |
| `src/studio/state/` | Serializable application state, pure reducers, React contexts and hooks |
| `src/studio/input/` | Keyboard/MIDI sources, note routing and their provider |
| `src/studio/canvas/` | Current fixed workbench, patchbay, jack positions and cable rendering |
| `src/studio/styles/` | Existing global theme and panel styles, in their original cascade order |
| `src/modules/sono303/` | Synthesizer panel, sound/transport controls, sequence editor and keyboard |
| `src/modules/distortion/` | Distortion panel and mode selector |
| `src/modules/tape/` | Live capture and bounce panel |
| `src/modules/shared/` | Shared module chassis, rotary control and readout formatters |

The engines stay together in `core` so the whole headless implementation can be
copied without React. The module folders currently contain React views; they
are not yet independently installable plugins.

## Previous paths

| Before | Now |
| --- | --- |
| `src/audio/` | `src/core/audio/` |
| `src/sequencer/` | `src/core/sequencer/` |
| `src/state/` | `src/studio/state/`, except `LiveInputProvider` in `studio/input/` |
| `src/hooks/useSono303.ts` | `src/studio/audio/useSono303.ts` |
| Other `src/hooks/` | `src/studio/input/` |
| `src/components/Workbench.tsx`, `PatchBay.tsx`, `patchBayContext.ts`, `JackSocket.tsx` | `src/studio/canvas/` |
| Other `src/components/` | The corresponding `src/modules/` folder above |
| `src/styles/`, `src/index.css` | `src/studio/styles/` |

The concept specifications keep their historical source trees as design inputs.
Use this map and ARCHITECTURE.md when locating the current implementation.

## Extract only the headless code

Copy **all of `src/core/`**, including the worklet, into the new Vite project's
`src/core/`. The `audio` and `sequencer` directories must stay next to one
another. No import in the core reaches into `studio` or `modules`.

The only external runtime package imported by the core is `tone`; its tests
use `vitest`. See [the core README](../src/core/README.md) for bundler
requirements and entry points. React and WEBMIDI.js are host dependencies,
not core dependencies.

Keep the copied tests and verify the new host separately in a real browser:
passing mocked audio tests does not prove autoplay, recording or audible sound.

## Next stage: the movable table

1. Put the workbench behind React Flow, keeping panel views separate from the
   audio instances. Moving or unmounting a view must not dispose its sound.
2. Introduce instance IDs and per-instance ports instead of the fixed
   `sono303.out`, `dist.in`, `dist.out` and `tape.in` IDs.
3. Replace the fixed rig with a host that owns the shared clock and destination.
   The current synth still starts/stops the global transport, including when
   disposed, so it cannot yet be duplicated safely.
4. Add per-instance serializable state and a module registry. Validate cable
   compatibility in the project model before applying audio routing.
5. Add a visible output module and project save/load. No `modules/output/`
   placeholder is created here because there is no such panel yet.

## Verification

```bash
bun run lint
bun run build
bun run test
bun run dev
```

`bun run test` invokes the project's Vitest script. Bare `bun test` invokes
Bun's own runner, which is not the runner used by the existing mocked-Tone tests.

Migration checks completed:

- ESLint and the production build pass; all 237 tests in 17 files pass.
- The production JavaScript and CSS bundle hashes match the pre-migration build.
- A headless Chrome smoke test against the development server verifies the
  three panels, 24 keyboard keys, 16 steps and two initial cables; note entry,
  transport start/stop, distortion mode selection and AudioWorklet recording
  initialization pass without JavaScript runtime errors.

The browser check does not replace listening to the output or testing physical
MIDI devices. The existing bundle-size warning remains unchanged.
