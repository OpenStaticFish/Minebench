import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { screenshotAssets } from "./scripts/site-images";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(async () => ({
  base: "./",
  plugins: [await screenshotAssets(root)],
  build: {
    rollupOptions: {
      input: {
        website: `${root}index.html`,
        game: `${root}play/index.html`,
      },
    },
  },
}));
