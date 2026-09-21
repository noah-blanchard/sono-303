import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { Sono303Provider } from "./studio/state/Sono303Context.tsx";
import "./studio/styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sono303Provider>
      <App />
    </Sono303Provider>
  </StrictMode>,
);
