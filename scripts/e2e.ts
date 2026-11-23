/**
 * End-to-end smoke test in headless Chrome: boots the production build and
 * drives the real game — movement, jumping, flight, look, block breaking and
 * placing, hotbar, pause/resume, settings and the screenshot shortcut.
 *
 *   bun run test:e2e
 */
import assert from "node:assert/strict"
import { launchChrome, startServer } from "./lib/browser"

const server = await startServer(4174)
const browser = await launchChrome(1280, 720)
const results: string[] = []
const step = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn()
    results.push(`✓ ${name}`)
  } catch (error) {
    results.push(`✗ ${name}: ${(error as Error).message}`)
    failed = true
  }
}
let failed = false

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const pageErrors: string[] = []
  page.on("pageerror", (e) => pageErrors.push(e.message))
  const state = () => page.evaluate(() => window.loamlands!.getState())
  const block = (x: number, y: number, z: number) =>
    page.evaluate(([x, y, z]) => window.loamlands!.getBlock(x, y, z), [x, y, z] as const)
  const hold = async (key: string, ms: number) => {
    await page.keyboard.down(key)
    await page.waitForTimeout(ms)
    await page.keyboard.up(key)
  }
  /**
   * Steer the view with real mouse movement (0.0022 rad per pixel at sensitivity 1).
   * The cursor is parked near the top-left corner before play begins (menu moves
   * are ignored by the game), which leaves room for the rotations the test needs.
   */
  let mx = 100
  let my = 20
  const steer = async (axis: "pitch" | "yaw", target: number) => {
    for (let i = 0; i < 8; i++) {
      const s = await state()
      // Aim for the equivalent yaw nearest to the current one.
      const goal =
        axis === "yaw"
          ? target + 2 * Math.PI * Math.round((s.yaw - target) / (2 * Math.PI))
          : target
      const err = s[axis] - goal // positive: mouse right (yaw) / mouse down (pitch)
      if (Math.abs(err) < 0.03) return
      const room =
        axis === "yaw" ? { back: mx - 40, ahead: 1220 - mx } : { back: my - 20, ahead: 690 - my }
      const pixels = Math.min(Math.max(err / 0.0022, -room.back), room.ahead)
      if (axis === "yaw") mx += pixels
      else my += pixels
      await page.mouse.move(mx, my, { steps: 3 })
      await page.waitForTimeout(120)
    }
    throw new Error(`could not steer ${axis} to ${target}`)
  }

  await page.goto(new URL("play/", server.url).href, { waitUntil: "load" })
  await page.waitForFunction(() => Boolean(window.loamlands), undefined, { timeout: 20_000 })
  await page.evaluate(() => window.loamlands!.whenIdle())
  await page.mouse.move(mx, my)

  await step("main menu renders with title and enabled Play button", async () => {
    assert.equal(await page.isVisible("#screen-menu"), true)
    assert.equal(await page.textContent("#title"), "Loamlands")
    assert.equal(await page.isEnabled("#btn-play"), true)
  })

  await step("Play enters the game with HUD visible", async () => {
    // Keyboard activation keeps the parked mouse position (clicks would move it).
    await page.focus("#btn-play")
    await page.keyboard.press("Enter")
    await page.waitForFunction(() => window.loamlands!.getState().screen === "playing")
    assert.equal(await page.isVisible("#hud"), true)
    assert.equal(await page.isVisible("#hotbar"), true)
  })

  await page.waitForTimeout(400) // let the first physics frames settle the player on the ground
  const spawn = await state()
  await step("player spawns on solid ground", async () => {
    assert.equal(spawn.onGround, true)
    assert.notEqual(
      await block(
        Math.floor(spawn.position[0]),
        Math.floor(spawn.position[1]) - 1,
        Math.floor(spawn.position[2]),
      ),
      0,
    )
  })

  await step(
    "left click breaks the targeted block; right click places the selected block",
    async () => {
      // Dig straight down: the target is the block under our feet.
      await steer("pitch", -1.45)
      const s = await state()
      const [px, py, pz] = [
        Math.floor(s.position[0]),
        Math.floor(s.position[1]),
        Math.floor(s.position[2]),
      ]
      assert.deepEqual(
        s.target && [s.target.x, s.target.y, s.target.z],
        [px, py - 1, pz],
        "should target the ground below",
      )
      await page.mouse.click(mx, my, { button: "left" })
      await page.waitForFunction((y) => window.loamlands!.getState().position[1] < y - 0.9, py, {
        timeout: 3000,
      })
      assert.equal(
        await block(px, py - 1, pz),
        0,
        "block should be removed and the player should fall into the hole",
      )

      // From inside the hole, look ahead and down: the ray hits the ground surface in
      // front (the spawn vista is open by construction), so the stone lands on top of it.
      await page.keyboard.press("Digit3") // Stone
      await steer("pitch", -0.5)
      const t = (await state()).target
      assert.ok(t, "crosshair should target the ground ahead")
      const at: [number, number, number] = [t!.x + t!.nx, t!.y + t!.ny, t!.z + t!.nz]
      assert.equal(await block(...at), 0, "placement cell should be empty")
      await page.mouse.click(mx, my, { button: "right" })
      await page.waitForTimeout(150)
      assert.equal(await block(...at), 3, "stone should be placed on the targeted face")
      await page.mouse.click(mx, my, { button: "left" })
      await page.waitForTimeout(150)
      assert.equal(await block(...at), 0, "placed stone should be breakable again")
    },
  )

  await step("S walks backwards (hopping out of the test hole)", async () => {
    const before = await state()
    await page.keyboard.down("KeyS")
    await page.keyboard.press("Space") // hop out of the hole while moving
    await page.waitForTimeout(1000)
    await page.keyboard.up("KeyS")
    const after = await state()
    const dist = Math.hypot(
      after.position[0] - before.position[0],
      after.position[2] - before.position[2],
    )
    assert.ok(dist > 1.5, `moved only ${dist.toFixed(2)} blocks`)
  })

  await step("Space jumps and gravity brings the player back down", async () => {
    await page.waitForFunction(() => window.loamlands!.getState().onGround, undefined, {
      timeout: 3000,
    })
    const before = await state()
    await hold("Space", 150)
    await page.waitForTimeout(150)
    const up = await state()
    assert.ok(
      up.position[1] > before.position[1] + 0.4,
      `y ${before.position[1]} → ${up.position[1]}`,
    )
    await page.waitForFunction(
      (y) =>
        window.loamlands!.getState().onGround &&
        window.loamlands!.getState().position[1] <= y + 0.01,
      before.position[1],
      { timeout: 3000 },
    )
  })

  await step(
    "double-tap Space toggles flight; Space rises; Shift descends; landing stops flight",
    async () => {
      const before = await state()
      await page.keyboard.press("Space")
      await page.waitForTimeout(120)
      await page.keyboard.press("Space")
      await page.waitForFunction(() => window.loamlands!.getState().flying, undefined, {
        timeout: 2000,
      })
      await hold("Space", 900)
      const high = await state()
      assert.ok(
        high.position[1] > before.position[1] + 3,
        `y ${before.position[1]} → ${high.position[1]}`,
      )
      await hold("ShiftLeft", 4000)
      const low = await state()
      assert.equal(low.flying, false, "landing should cancel flight")
      assert.equal(low.onGround, true)
    },
  )

  await step("mouse look changes yaw", async () => {
    const before = await state()
    await page.mouse.move(mx + 100, my, { steps: 5 })
    mx += 100
    await page.waitForTimeout(100)
    const after = await state()
    assert.ok(Math.abs(after.yaw - before.yaw) > 0.1, `yaw ${before.yaw} → ${after.yaw}`)
  })

  await step("hotbar keys and wheel change the selection", async () => {
    await page.keyboard.press("Digit9")
    assert.equal((await state()).selected, 8)
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(100)
    assert.equal((await state()).selected, 0)
  })

  await step("Esc pauses and releases the HUD; Resume returns to play", async () => {
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => window.loamlands!.getState().screen === "paused")
    assert.equal(await page.isVisible("#screen-pause"), true)
    assert.equal(await page.isVisible("#hud"), false)
    await page.click("#btn-resume")
    await page.waitForFunction(() => window.loamlands!.getState().screen === "playing")
    assert.equal(await page.isVisible("#hud"), true)
  })

  await step("settings: view distance applies immediately and persists", async () => {
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => window.loamlands!.getState().screen === "paused")
    await page.click("#btn-pause-settings")
    assert.equal(await page.isVisible("#screen-settings"), true)
    await page.locator("#set-viewDistance").fill("5")
    await page.waitForFunction(() => window.loamlands!.getState().viewDistance === 5)
    await page.click("#btn-settings-back")
    await page.click("#btn-resume")
    await page.waitForFunction(() => window.loamlands!.getState().screen === "playing")
    await page.evaluate(() => window.loamlands!.whenIdle())
    const meshed = (await state()).meshed
    assert.ok(meshed < 120, `expected fewer meshes at distance 5, got ${meshed}`)
    const saved = await page.evaluate(() => localStorage.getItem("loamlands.settings.v1"))
    assert.equal(JSON.parse(saved!).viewDistance, 5)
  })

  await step("H hides the stats panel and remembers it", async () => {
    assert.equal(await page.isVisible(".stats"), true)
    await page.keyboard.press("KeyH")
    await page.waitForFunction(
      () =>
        !document.querySelector(".stats") ||
        getComputedStyle(document.querySelector(".stats")!).display === "none",
    )
    assert.equal(await page.isVisible(".stats"), false)
    assert.equal(await page.isVisible("#hotbar"), true, "the rest of the HUD stays")
    const saved = await page.evaluate(() => localStorage.getItem("loamlands.settings.v1"))
    assert.equal(JSON.parse(saved!).hudStats, false)
    await page.keyboard.press("KeyH")
    assert.equal(await page.isVisible(".stats"), true)
  })

  await step("P saves a PNG screenshot", async () => {
    const download = page.waitForEvent("download", { timeout: 10_000 })
    await page.keyboard.press("KeyP")
    const d = await download
    assert.match(d.suggestedFilename(), /^loamlands-.*\.png$/)
  })

  await step("quit to title returns to the menu", async () => {
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => window.loamlands!.getState().screen === "paused")
    await page.click("#btn-quit")
    await page.waitForFunction(() => window.loamlands!.getState().screen === "menu")
    assert.equal(await page.isVisible("#screen-menu"), true)
  })

  await step("no uncaught page errors", async () => {
    assert.deepEqual(pageErrors, [])
  })
} finally {
  await browser.close()
  await server.close()
}

console.log(results.join("\n"))
if (failed) process.exit(1)
console.log("\nAll e2e checks passed.")
