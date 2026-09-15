import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@talent-signal/workspace-ui/theme.css";
import "./styles.css";

import { App } from "./App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing app root");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
