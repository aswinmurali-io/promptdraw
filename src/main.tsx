import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { App } from "./ui/App";
import { initCheckMode } from "./ui/state/checkMode";

// Before anything reads storage: a check link runs the page on in-memory storage.
initCheckMode(location.hash);

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
