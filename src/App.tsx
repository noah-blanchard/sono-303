import { Workbench } from "./components/Workbench";
import { useSono303 } from "./hooks/useSono303";
import { AuditionContext } from "./state/contexts";
import "./styles/tokens.css";
import "./styles/sono303.css";
import "./styles/sono-dist.css";

export default function App() {
  // The only bridge between React state and the audio rig.
  const auditionNote = useSono303();

  return (
    <AuditionContext.Provider value={auditionNote}>
      <main className="stage">
        <Workbench />
      </main>
    </AuditionContext.Provider>
  );
}
