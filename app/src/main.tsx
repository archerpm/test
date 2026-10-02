import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { EMBED } from "./env";

// В пробной версии на claude.ai шрифты подключает страница-обёртка; в обычной сборке — свои файлы
if (!EMBED) import("./fonts");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Офлайн-режим (не в пробной версии на claude.ai, где сервис-воркеры недоступны)
if (!EMBED && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
