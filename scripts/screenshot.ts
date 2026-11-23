/**
 * Capture marketing screenshots from the real game with headless Chrome.
 *
 *   bun run screenshot                 → screenshots/main-menu.png, in-game.png, flight.png, settings.png
 *   bun run screenshot --seed ember    → use a different world seed
 *   bun run screenshot --out shots     → write elsewhere
 *   bun run screenshot --no-media      → skip rebuilding the website's optimised copies
 *
 * Requires Chrome/Chromium (set CHROME_PATH if it is not on PATH).
 * Reuses an existing server when LOAMLANDS_URL is set, otherwise builds and
 * serves `dist/` with `vite preview`. Every image is a real capture of the
 * running game — nothing is composited or retouched.
 */
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { buildMedia } from "./images"
import { launchChrome, startServer } from "./lib/browser"

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback
}

/** The game lives at /play/; the landing page owns the site root. */
const gameUrl = (base: string) => new URL("play/", base).href

const seed = arg("seed", "dune")
const outDir = arg("out", "screenshots")
const width = Number(arg("width", "1600"))
const height = Number(arg("height", "900"))

const server = await startServer()
const browser = await launchChrome(width, height)
let failed = false

try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })

  const started = Date.now()
  await page.goto(gameUrl(server.url), { waitUntil: "load" })
  await page.waitForFunction(() => Boolean(window.loamlands), undefined, { timeout: 20_000 })
  if (seed !== "dune") await page.fill("#seed", seed)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  // Wait until the whole view-distance area is generated and meshed.
  await page.evaluate(() => window.loamlands!.whenIdle())
  await page.waitForTimeout(600)
  await mkdir(outDir, { recursive: true })

  const shoot = async (name: string) => {
    const path = join(outDir, `${name}.png`)
    await page.screenshot({ path })
    console.log(`✓ ${path}`)
  }

  await shoot("main-menu")

  // Keyboard activation leaves the mouse parked at the top-left, so a small
  // downward move later is a clean pitch change (0.0022 rad per pixel).
  await page.focus("#btn-play")
  await page.keyboard.press("Enter")
  await page.waitForFunction(() => window.loamlands!.getState().screen === "playing")
  // Let the menu→player camera transition finish, then give the HUD a stats update.
  await page.waitForTimeout(1400)
  await page.evaluate(() => window.loamlands!.whenIdle())
  // Hide the FPS/position panel with the game's own H toggle. Headless Chrome renders on
  // the CPU, so its frame-rate readout would misrepresent the game on real hardware.
  // Nothing else about the frame is altered.
  await page.keyboard.press("KeyH")
  await page.waitForTimeout(300)
  await shoot("in-game")

  // Creative flight: double-tap Space, climb, look gently down over the landscape.
  await page.keyboard.press("Space")
  await page.waitForTimeout(120)
  await page.keyboard.press("Space")
  await page.waitForFunction(() => window.loamlands!.getState().flying, undefined, {
    timeout: 3000,
  })
  await page.keyboard.down("Space")
  await page.waitForTimeout(2200)
  await page.keyboard.up("Space")
  await page.mouse.move(1, 110, { steps: 4 })
  await page.waitForTimeout(1300)
  await shoot("flight")
  await page.keyboard.press("KeyH") // show the stats panel again for the settings capture

  // Pause → Settings, over the frozen world.
  await page.keyboard.press("Escape")
  await page.waitForFunction(() => window.loamlands!.getState().screen === "paused")
  await page.click("#btn-pause-settings")
  await page.waitForTimeout(500)
  await shoot("settings")

  const state = await page.evaluate(() => window.loamlands!.getState())
  console.log(
    `  seed "${state.seed}" · spawn ${state.position.map((v) => v.toFixed(1)).join(", ")} · ` +
      `${state.meshed} chunks · ${Math.round(Date.now() - started)} ms`,
  )
  if (errors.length) {
    failed = true
    console.error("Page errors:", errors)
  }
} finally {
  await browser.close()
  await server.close()
}

if (!process.argv.includes("--no-media")) {
  console.log("Optimising screenshots for the website:")
  await buildMedia()
}
if (failed) process.exit(1)
