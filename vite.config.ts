import { resolve } from "node:path";
import { defineConfig } from "vite";

// Two pages: the marketing site (index.html) and the game (play.html).
// Each gets its own entry chunk, so visitors of the landing page never
// download the game bundle.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname!, "index.html"),
        play: resolve(import.meta.dirname!, "play.html"),
      },
    },
  },
});
