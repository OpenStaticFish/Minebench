/**
 * Shared helpers for the screenshot and e2e scripts: find a Chrome binary,
 * launch it with software WebGL enabled (so headless runs work everywhere),
 * and start a production preview server to test against.
 */
import { type Browser, chromium } from "playwright"

/** Launch headless Chrome. SwiftShader flags make WebGL 2 work without a GPU. */
export async function launchChrome(width = 1600, height = 900): Promise<Browser> {
  const candidates = [
    process.env.CHROME_PATH,
    Bun.which("google-chrome"),
    Bun.which("google-chrome-stable"),
    Bun.which("chromium"),
    Bun.which("chromium-browser"),
  ].filter((p): p is string => Boolean(p))
  const executablePath = candidates[0]
  if (!executablePath) {
    throw new Error(
      "No Chrome/Chromium found. Set CHROME_PATH or run `bunx playwright install chromium`.",
    )
  }
  return chromium.launch({
    executablePath,
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
      `--window-size=${width},${height}`,
    ],
  })
}

export interface ServerHandle {
  url: string
  close(): Promise<void>
}

/**
 * Serve the production build for automation. Set `LOAMLANDS_URL` to reuse a
 * server that is already running (e.g. `bun run dev`).
 */
export async function startServer(port = 4173): Promise<ServerHandle> {
  const external = process.env.LOAMLANDS_URL
  if (external) return { url: external, close: async () => {} }

  const build = Bun.spawn(["bunx", "vite", "build", "--logLevel", "warn"], {
    stdout: "inherit",
    stderr: "inherit",
  })
  if ((await build.exited) !== 0) throw new Error("vite build failed")

  const url = `http://localhost:${port}/`
  const server = Bun.spawn(["bunx", "vite", "preview", "--port", String(port), "--strictPort"], {
    stdout: "ignore",
    stderr: "inherit",
  })
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) break
    } catch {
      // not up yet
    }
    await Bun.sleep(150)
  }
  return {
    url,
    close: async () => {
      server.kill()
      await server.exited
    },
  }
}
