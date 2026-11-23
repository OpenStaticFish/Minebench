import { defineConfig } from "vite"
import { mediaPlugin } from "./website/media-plugin.ts"

/**
 * Extra hostnames the preview server may answer to (comma-separated), for when
 * it sits behind a proxy such as `tailscale serve` or an ngrok-style tunnel.
 *   LOAMLANDS_ALLOWED_HOSTS=hypr-nix.example.ts.net bun run preview
 */
const allowedHosts = (process.env.LOAMLANDS_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean)

export default defineConfig({
  // Relative base so `dist/` works from any static path or sub-folder.
  base: "./",
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true, allowedHosts },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    // Two pages: the website at `/` and the game at `/play/` (paths are relative to the project root).
    rolldownOptions: {
      input: { site: "index.html", play: "play/index.html" },
    },
  },
  plugins: [mediaPlugin()],
})
