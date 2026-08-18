import { Sono303Panel } from "./components/Sono303Panel";
import { useSono303 } from "./hooks/useSono303";
import "./styles/tokens.css";
import "./styles/sono303.css";

export default function App() {
  // The only bridge between React state and the sound engine.
  useSono303();

  return (
    <main className="stage">
      <Sono303Panel />
    </main>
  );
}
