import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

// Dev-only handle for screenshot harnesses and scene diagnostics.
if (import.meta.env.DEV) {
  void import("./store/useStore").then(({ useStore }) => {
    (window as unknown as { __cxStore: typeof useStore }).__cxStore = useStore;
  });
}

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
