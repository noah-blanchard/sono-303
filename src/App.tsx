import { Workbench } from "./components/Workbench";
import { useSono303 } from "./hooks/useSono303";
import { NoteGateContext } from "./state/contexts";
import { LiveInputProvider } from "./state/LiveInputProvider";
import "./styles/tokens.css";
import "./styles/sono303.css";
import "./styles/sono-dist.css";

export default function App() {
  // The only bridge between React state and the audio rig.
  const noteGate = useSono303();

  return (
    <NoteGateContext.Provider value={noteGate}>
      <LiveInputProvider>
        <main className="stage">
          <Workbench />
        </main>
      </LiveInputProvider>
    </NoteGateContext.Provider>
  );
}
