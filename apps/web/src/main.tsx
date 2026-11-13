import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { installDeployRefresh } from "./deployRefresh";

declare const __BUILD_VERSION__: string;
if (__BUILD_VERSION__ !== "development") installDeployRefresh(__BUILD_VERSION__);

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
          renderButton(element: HTMLElement, options: { theme: string; size: string; width: number }): void;
        };
      };
    };
  }
}

if (__BUILD_VERSION__ !== "development" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(error => console.warn("Offline app installation failed", error)));
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
