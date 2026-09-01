import { Workbench } from "./components/Workbench";
import { useSono303 } from "./hooks/useSono303";
import {
  LiveRecordContext,
  NoteGateContext,
  WavExportContext,
} from "./state/contexts";
import { LiveInputProvider } from "./state/LiveInputProvider";
import "./styles/tokens.css";
import "./styles/sono303.css";
import "./styles/sono-dist.css";
import "./styles/sono-tape.css";

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
