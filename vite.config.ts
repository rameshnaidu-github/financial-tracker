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
    /*
     * Fonts are emitted as files, never inlined.
     *
     * Vite inlines any asset under 4KB as a `data:` URI, which catches a webfont's smaller
     * subsets -- Greek, Cyrillic, Vietnamese. The application serves a strict
     * `default-src 'self'` with no `font-src`, so the browser refused every one of them and the
     * console filled with CSP violations on each load. The Latin subset is larger, so it was
     * emitted as a file and loaded fine, which is why the page still looked right and nobody
     * noticed.
     *
     * Files are the better answer regardless of the policy: a font is immutable and
     * content-hashed, so as a file it is cached once across every later build, while inlined
     * bytes are re-downloaded with the stylesheet each time it changes.
     */
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined),
    rollupOptions: {
      output: {
        // Libraries and the icon set change rarely: separate chunks stay cached across app updates.
        manualChunks: (id) =>
          id.includes("@phosphor-icons") ? "icons" : id.includes("node_modules") ? "vendor" : undefined
      }
    }
  }
});
