import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: resolve(import.meta.dirname, "."),
  publicDir: resolve(import.meta.dirname, "public"),
  server: {
    port: 3001,
    host: true,
  },
  preview: {
    port: 4174,
    host: true,
  },
  build: {
    target: "esnext",
    outDir: resolve(import.meta.dirname, "dist"),
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        play: resolve(import.meta.dirname, "play.html"),
      },
    },
  },
});
