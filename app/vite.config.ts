import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" — чтобы сборка работала на GitHub Pages и из локальной папки
export default defineConfig({ base: "./", plugins: [react()], build: { chunkSizeWarningLimit: 1100 }, test: { environment: "node" } });
