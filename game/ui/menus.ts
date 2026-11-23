/**
 * Ui: screens (menu, pause, settings, controls), navigation and the settings
 * controls. Keeps DOM concerns here so the Game stays free of UI details.
 */

import { DEFAULT_SETTINGS, SETTING_RANGES, type Settings, sanitizeSettings } from "../core/settings"
import type { Game, GameScreen } from "../engine/game"
import { DEFAULT_SEED } from "../engine/game"

export type UiScreen = GameScreen | "settings" | "controls"
type MenuScreen = Exclude<UiScreen, "playing">

const RANGE_KEYS = ["viewDistance", "sensitivity", "fov", "renderScale"] as const
type RangeKey = (typeof RANGE_KEYS)[number]
const TOGGLE_KEYS = ["clouds", "debugOverlay", "hudStats"] as const

const SEED_WORDS = [
  "amber",
  "basalt",
  "birch",
  "cinder",
  "clover",
  "dune",
  "ember",
  "fern",
  "flint",
  "grove",
  "hazel",
  "juniper",
  "lagoon",
  "loam",
  "maple",
  "marsh",
  "meadow",
  "moss",
  "oak",
  "peat",
  "quarry",
  "reef",
  "ridge",
  "river",
  "sage",
  "shale",
  "spruce",
  "stone",
  "thicket",
  "vale",
]

export class Ui {
  private readonly screens: Record<MenuScreen, HTMLElement>
  private returnTo: "menu" | "paused" = "menu"
  private readonly seedInput: HTMLInputElement
  private readonly playButton: HTMLButtonElement
  private readonly progress: HTMLElement
  private readonly progressFill: HTMLElement
  private readonly progressText: HTMLElement
  private readonly inputs = new Map<string, HTMLInputElement>()
  private readonly outputs = new Map<string, HTMLOutputElement>()
  private busy = false

  constructor(
    private readonly game: Game,
    private readonly settings: Settings,
    private readonly onChange: (next: Settings) => void,
  ) {
    const $ = (id: string) => document.getElementById(id)!
    this.screens = {
      menu: $("screen-menu"),
      paused: $("screen-pause"),
      settings: $("screen-settings"),
      controls: $("screen-controls"),
    }
    this.seedInput = $("seed") as HTMLInputElement
    this.playButton = $("btn-play") as HTMLButtonElement
    this.progress = $("menu-progress")
    this.progressFill = $("progress-fill")
    this.progressText = $("progress-text")

    this.seedInput.value = game.seed
    this.bind("btn-play", () => void this.play())
    this.bind("btn-seed-random", () => this.randomizeSeed())
    this.bind("btn-settings", () => this.openSubScreen("settings", "menu"))
    this.bind("btn-controls", () => this.openSubScreen("controls", "menu"))
    this.bind("btn-resume", () => game.resume())
    this.bind("btn-pause-settings", () => this.openSubScreen("settings", "paused"))
    this.bind("btn-pause-controls", () => this.openSubScreen("controls", "paused"))
    this.bind("btn-pause-screenshot", () => void game.captureScreenshot())
    this.bind("btn-quit", () => game.quitToMenu())
    this.bind("btn-settings-back", () => this.show(this.returnTo))
    this.bind("btn-controls-back", () => this.show(this.returnTo))
    this.bind("btn-settings-reset", () => {
      Object.assign(this.settings, DEFAULT_SETTINGS)
      this.syncSettings()
      this.emitChange()
    })
    this.seedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.play()
    })

    for (const key of RANGE_KEYS) {
      const input = $(`set-${key}`) as HTMLInputElement
      this.inputs.set(key, input)
      this.outputs.set(key, $(`out-${key}`) as HTMLOutputElement)
      input.addEventListener("input", () => {
        this.settings[key] = Number(input.value)
        this.updateRangeLabel(key)
        this.emitChange()
      })
    }
    for (const key of TOGGLE_KEYS) {
      const input = $(`set-${key}`) as HTMLInputElement
      this.inputs.set(key, input)
      input.addEventListener("change", () => {
        this.settings[key] = input.checked
        this.emitChange()
      })
    }
    this.syncSettings()
  }

  private bind(id: string, handler: () => void): void {
    document.getElementById(id)!.addEventListener("click", handler)
  }

  /** Switch the visible screen and move keyboard focus onto it. */
  show(screen: UiScreen): void {
    for (const [name, el] of Object.entries(this.screens)) el.hidden = name !== screen
    if (screen === "playing") return
    document.getElementById("ui")!.dataset.screen = screen
    if (screen === "menu") return // no autofocus on first load; Tab still reaches everything
    const first = this.screens[screen].querySelector<HTMLElement>("button:not([disabled])")
    first?.focus({ preventScroll: true })
  }

  private openSubScreen(screen: "settings" | "controls", returnTo: "menu" | "paused"): void {
    this.returnTo = returnTo
    this.show(screen)
  }

  private emitChange(): void {
    this.onChange(sanitizeSettings(this.settings))
  }

  private syncSettings(): void {
    for (const key of RANGE_KEYS) {
      this.inputs.get(key)!.value = String(this.settings[key])
      this.updateRangeLabel(key)
    }
    for (const key of TOGGLE_KEYS) this.inputs.get(key)!.checked = this.settings[key]
  }

  private updateRangeLabel(key: RangeKey): void {
    const value = Number(this.inputs.get(key)!.value)
    const unit = SETTING_RANGES[key].unit
    const text =
      key === "sensitivity" || key === "renderScale"
        ? `${value.toFixed(2)}${unit}`
        : `${value} ${unit}`.trim()
    this.outputs.get(key)!.textContent = text
  }

  private randomizeSeed(): void {
    const word = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]!
    this.seedInput.value = `${word}-${Math.floor(Math.random() * 900 + 100)}`
  }

  private async play(): Promise<void> {
    if (this.busy) return
    const seed = this.seedInput.value.trim() || DEFAULT_SEED
    if (seed !== this.game.seed) {
      this.busy = true
      this.playButton.disabled = true
      this.playButton.textContent = "Generating…"
      this.game.newWorld(seed)
      try {
        await this.game.whenIdle()
      } finally {
        this.busy = false
        this.playButton.disabled = false
        this.playButton.textContent = "Play"
      }
    }
    this.game.start()
  }

  /** Loading progress shown under the main menu buttons. */
  setProgress(done: number, total: number): void {
    if (this.game.screen !== "menu") return
    const finished = total === 0 || done >= total
    const pct = finished ? 100 : Math.round((done / total) * 100)
    this.progressFill.style.width = `${pct}%`
    this.progressText.textContent = finished
      ? `World ready · seed "${this.game.seed}"`
      : `Carving terrain… ${pct}%`
    this.progress.classList.toggle("progress--done", finished)
    // Let the player in as soon as the nearby chunks exist; the rest streams in behind.
    this.playButton.disabled = this.busy || (!finished && done < Math.min(total, 24))
  }
}
