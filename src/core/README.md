# SONO-303 headless core

This directory contains the existing audio implementation and pure musical
data. It has no React imports and no imports from `studio` or `modules`.

## Reuse

Copy the entire directory into another project's `src/core/`. Preserve the
relative `audio/` and `sequencer/` layout and include
`audio/tapProcessor.worklet.js`; it is required by the live recorder.

- Runtime dependency: `tone` (see the repository's package.json and lockfile).
- Test dependency: `vitest`.
- Runtime: browser audio APIs; headless here means UI-independent, not a
  standalone Node.js audio renderer.
- Bundler: Vite, or an equivalent handler for the recorder's JavaScript
  `?raw` import. With TypeScript, include `vite/client` types.
- Audio unlock: the host must initiate playback or live notes from a user
  gesture. The recorder also unlocks from its REC gesture.

There is no dependency on React or WEBMIDI.js. A host can use WEBMIDI.js to
translate MIDI notes into the existing engine note gate.

## Entry points

| File | Purpose |
| --- | --- |
| `audio/engineApi.ts` | Instrument interface and factory type |
| `audio/Sono303Engine.ts` | Synthesizer and 16-step sequencer |
| `audio/distEngineApi.ts` | Effect interface |
| `audio/SonoDistEngine.ts` | Distortion engine |
| `audio/SonoAudioRig.ts` | Current fixed instrument/effect/recorder graph and protected speaker output |
| `audio/LiveRecorder.ts` | Live recording from an assigned source |
| `audio/renderPattern.ts` | Offline rendering of the current rig |
| `audio/wavEncoder.ts` | Pure mono 24-bit WAV encoder |
| `sequencer/defaults.ts` | Initial parameters and pattern |
| `sequencer/types.ts` | Shared serializable model |

For the existing complete bench, use `SonoAudioRig`; a bare
`Sono303Engine` does not connect itself to the destination. Push parameters
and pattern into `rig.synth`, start it from a user gesture, and dispose the
rig on host teardown.

## Current limits

This is an extraction boundary, not a new generic module SDK. The rig and port
IDs still describe three fixed devices. Synth instances still control the
global Tone transport; stopping or disposing one can stop another. The pure
types also retain the existing application's state shape. Generalizing those
contracts is the next stage, documented in
[REORGANIZATION.md](../../docs/REORGANIZATION.md).

Tests remain next to their implementations. From this repository, run:

```bash
bun run test
```

In a fresh host with Vitest installed, `bunx vitest run src/core` runs just the
copied core tests.
