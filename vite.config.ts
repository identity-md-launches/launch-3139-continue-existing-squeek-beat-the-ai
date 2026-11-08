import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/src/schemas/") || id.includes("/src/validation/") || id.includes("/ajv")) return "api-schemas";
        },
      },
    },
  },
});
