import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// EasyTaller — app React + TypeScript 100 % en el navegador (SPA).
// El plugin de TanStack Router genera src/routeTree.gen.ts a partir de
// src/routes/ y debe ir antes del plugin de React.
export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
