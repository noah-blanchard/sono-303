import { Workbench } from "./studio/canvas/Workbench";
import { useSono303 } from "./studio/audio/useSono303";
import {
  LiveRecordContext,
  NoteGateContext,
  WavExportContext,
} from "./studio/state/contexts";
import { LiveInputProvider } from "./studio/input/LiveInputProvider";
import "./studio/styles/tokens.css";
import "./studio/styles/sono303.css";
import "./studio/styles/sono-dist.css";
import "./studio/styles/sono-tape.css";

export default function App() {
  // The only bridge between React state and the audio rig.
  const { noteGate, exportWav, liveRecord } = useSono303();

  return (
    <NoteGateContext.Provider value={noteGate}>
      <WavExportContext.Provider value={exportWav}>
        <LiveRecordContext.Provider value={liveRecord}>
          <LiveInputProvider>
            <main className="stage">
              <Workbench />
            </main>
          </LiveInputProvider>
        </LiveRecordContext.Provider>
      </WavExportContext.Provider>
    </NoteGateContext.Provider>
  );
}
