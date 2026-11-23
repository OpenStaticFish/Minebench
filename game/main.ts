/**
 * Entry point: boots the game, HUD and menus, and wires them together.
 * Any fatal problem (no WebGL 2, renderer failure) is shown in-page.
 */
import { loadSettings, saveSettings } from "./core/settings"
import { installBridge } from "./engine/bridge"
import { Game, type GameEvents } from "./engine/game"
import { createIconFactory, Hud } from "./ui/hud"
import { Ui } from "./ui/menus"

function showFatal(message: string): void {
  document.getElementById("screen-menu")?.setAttribute("hidden", "")
  const text = document.getElementById("fatal-message")
  if (text) text.textContent = message
  document.getElementById("fatal")?.removeAttribute("hidden")
}

function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas")
    return canvas.getContext("webgl2") !== null
  } catch {
    return false
  }
}

function boot(): void {
  const canvas = document.getElementById("game") as HTMLCanvasElement | null
  if (!canvas) {
    showFatal("The page is missing its #game canvas element.")
    return
  }
  if (!hasWebGL2()) {
    showFatal(
      "Your browser could not create a WebGL 2 context. Try a current version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.",
    )
    return
  }

  const settings = loadSettings()
  let game: Game
  let hud: Hud
  let ui: Ui

  const events: GameEvents = {
    onScreenChange: (screen) => {
      ui.show(screen)
      hud.setVisible(screen === "playing")
      if (screen !== "playing") hud.hideLockHint()
    },
    onHudStats: (stats) => {
      hud.setStats(stats)
      hud.setMode(stats.flying, stats.inWater, stats.sprinting, stats.eyeInWater)
    },
    onProgress: (done, total) => ui.setProgress(done, total),
    onToast: (message) => hud.toast(message),
    onSelectionChange: (index, block) => hud.setSelected(index, block),
    onLockChange: (locked) => {
      if (game.screen === "playing") hud.setLocked(locked)
    },
    onToggleDebug: () => {
      settings.debugOverlay = !settings.debugOverlay
      game.applySettings(settings)
      hud.setDebug(settings.debugOverlay)
      hud.setStatsVisible(settings.hudStats)
      saveSettings(settings)
    },
    onToggleHudStats: () => {
      settings.hudStats = !settings.hudStats
      game.applySettings(settings)
      hud.setStatsVisible(settings.hudStats)
      saveSettings(settings)
    },
  }

  try {
    game = new Game(canvas, settings, events)
  } catch (error) {
    console.error(error)
    showFatal("The 3D view could not start. Check the browser console for details.")
    return
  }

  hud = new Hud(document.getElementById("hud")!, createIconFactory(game.atlas))
  hud.buildHotbar(game.hotbar, (index) => game.selectSlot(index))
  hud.setDebug(settings.debugOverlay)
  hud.setStatsVisible(settings.hudStats)

  ui = new Ui(game, settings, (next) => {
    Object.assign(settings, next)
    game.applySettings(settings)
    hud.setStatsVisible(settings.hudStats)
    saveSettings(settings)
  })

  installBridge(game)
  ui.show("menu")
}

boot()
