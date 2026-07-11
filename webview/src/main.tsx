import React from "react";
import { createRoot } from "react-dom/client";
import { provideVSCodeDesignSystem, vsCodeButton } from "@vscode/webview-ui-toolkit";
import { App } from "./App";
import "./styles.css";

provideVSCodeDesignSystem().register(vsCodeButton());

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
