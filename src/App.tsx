import { Workbench } from "./components/Workbench";
import { useSono303 } from "./hooks/useSono303";
import "./styles/tokens.css";
import "./styles/sono303.css";
import "./styles/sono-dist.css";

export default function App() {
  // The only bridge between React state and the audio rig.
  useSono303();

  return (
    <main className="stage">
      <Workbench />
    </main>
  );
}
