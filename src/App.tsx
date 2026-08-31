import { SonoTapeDrawer } from "./components/SonoTapeDrawer";
import { Workbench } from "./components/Workbench";
import { useSono303 } from "./hooks/useSono303";
import { NoteGateContext, WavExportContext } from "./state/contexts";
import { LiveInputProvider } from "./state/LiveInputProvider";
import "./styles/tokens.css";
import "./styles/sono303.css";
import "./styles/sono-dist.css";
import "./styles/sono-tape.css";

export default function App() {
  // The only bridge between React state and the audio rig.
  const { noteGate, exportWav } = useSono303();

  return (
    <NoteGateContext.Provider value={noteGate}>
      <WavExportContext.Provider value={exportWav}>
        <LiveInputProvider>
          <main className="stage">
            <Workbench />
          </main>
          {/* Outside the stage: the drawer is fixed to the viewport edge, and
              nesting it under a transformed ancestor would break that. */}
          <SonoTapeDrawer />
        </LiveInputProvider>
      </WavExportContext.Provider>
    </NoteGateContext.Provider>
  );
}
