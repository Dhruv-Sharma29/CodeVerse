import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import OrbitGame from "./OrbitGame";

// Leaving reloads the page: closes the socket and returns to the lobby in one step.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OrbitGame onExit={() => location.reload()} />
  </StrictMode>,
);
