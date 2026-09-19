import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4000"
    }
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        // Libraries and the icon set change rarely: separate chunks stay cached across app updates.
        manualChunks: (id) =>
          id.includes("@phosphor-icons") ? "icons" : id.includes("node_modules") ? "vendor" : undefined
      }
    }
  }
});
