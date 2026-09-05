import { BLOCKS, DEFAULT_VIEW_DISTANCE, MAX_VIEW_DISTANCE } from "./terrain";

export type Screen = "menu" | "playing" | "paused";
const mark = `<svg viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="m16 2 14 8-14 8L2 10 16 2Z" fill="currentColor"/><path d="m2 15 14 8 14-8M2 22l14 8 14-8" stroke="currentColor" stroke-width="3"/></svg>`;
const arrow = `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" stroke="currentColor" stroke-width="1.5"/></svg>`;
export class UI {
  screen: Screen = "menu";
  selected = 0;
  private toastTimer = 0;
  readonly app = document.querySelector<HTMLDivElement>("#app")!;
  constructor() {
    this.app.innerHTML = `
      <section id="menu" class="screen menu" aria-label="Main menu">
        <header class="menu-header"><div class="brand-mark">${mark}<span>AN OPEN-WORLD DAYDREAM</span></div><span class="build-tag">EARLY FIELD BUILD <b>0.1</b></span></header>
        <div class="menu-body">
          <div class="eyebrow"><span class="tiny-line"></span> A VOXEL WILDERNESS</div>
          <h1>Wildmere<span class="title-dot">.</span></h1>
          <p class="tagline">A little world. Entirely yours.</p>
          <p class="menu-description">Wander the hills. Follow the water.<br>Build whatever comes to mind.</p>
          <nav class="menu-actions" aria-label="Game actions">
            <button class="primary" id="play"><span>Enter the world<small>CREATIVE MODE / NO LIMITS</small></span>${arrow}</button>
            <div class="secondary-actions"><button data-dialog="settings">Settings <span>+</span></button><button data-dialog="controls">How to play <span>+</span></button></div>
          </nav>
          <div class="menu-note"><span class="status-dot"></span><span id="loading">Growing your wilderness...</span></div>
        </div>
        <aside class="world-label"><span class="eyebrow">YOUR FIRST DESTINATION</span><h2>Stillwater Basin</h2><p>Wooded shores & quiet summits</p><div><span>SEED 08317</span><span>01 / ∞</span></div></aside>
        <footer class="menu-footer"><span>GO SLOW. GET LOST. MAKE SOMETHING.</span><span>ORIGINAL VOXEL SANDBOX <i></i> DESKTOP EDITION</span></footer>
      </section>
      <section id="hud" class="screen hud" hidden aria-label="Game HUD">
        <div class="hud-top"><div class="location">${mark}<div><strong>Wildmere</strong><span>STILLWATER BASIN</span></div></div><button id="pause-button" aria-label="Pause game">Ⅱ <span>ESC</span></button></div>
        <div class="world-status"><span class="status-dot"></span><span id="mode">ON FOOT</span><span class="status-separator">/</span><span id="coordinates"></span></div>
        <div class="crosshair" aria-hidden="true"></div><div id="target" class="target"></div>
        <div class="hud-bottom"><div class="selected-label"><span id="selected-name">Meadow</span><small>UNLIMITED SUPPLY</small></div>
          <div class="hotbar" role="toolbar" aria-label="Block selection">${BLOCKS.map((b, i) => `<button class="slot ${i === 0 ? "active" : ""}" data-slot="${i}" aria-label="${i + 1}: ${b.name}" aria-pressed="${i === 0}"><kbd>${i + 1}</kbd><span class="block-icon block-${b.id}" style="--block:${b.color}"><i></i></span></button>`).join("")}</div>
          <div class="hud-controls"><span><kbd>LMB</kbd> Break</span><span><kbd>RMB</kbd> Place</span><span><kbd>2×Space</kbd> Fly</span><span><kbd>P</kbd> Photo</span><span><kbd>H</kbd> Hide UI</span></div>
        </div>
        <div class="creative-badge">CREATIVE<span>THE WORLD IS YOURS</span></div>
      </section>
      <section id="paused" class="screen pause-screen" hidden aria-label="Pause menu">
        <div class="pause-card"><div class="eyebrow">TAKE A BREATH</div><h2>A moment<br>of stillness.</h2><p>Your world will be right here.</p><button id="resume" class="primary">Keep exploring ${arrow}</button><button data-dialog="settings">Settings</button><button data-dialog="controls">How to play</button><button id="photo">Capture a photo <span>P</span></button><button id="main-menu" class="quiet">Return to main menu</button><small>Edits stay with you until this tab is reloaded.</small></div>
      </section>
      <dialog id="settings" aria-labelledby="settings-title"><button class="dialog-close" aria-label="Close settings">×</button><div class="eyebrow">MAKE YOURSELF AT HOME</div><h2 id="settings-title">Field settings</h2><label for="distance">View distance <output id="distance-value">${DEFAULT_VIEW_DISTANCE} chunks</output></label><input id="distance" type="range" min="2" max="${MAX_VIEW_DISTANCE}" value="${DEFAULT_VIEW_DISTANCE}" step="1"><p>12 chunks gives a long view; 24 reaches 384 blocks. Higher distances need more memory and loading time. Try 2–6 on smaller laptops.</p><label for="sensitivity">Mouse sensitivity <output id="sensitivity-value">1.0×</output></label><input id="sensitivity" type="range" min="0.3" max="2.5" step="0.1" value="1"><p>Changes apply immediately and are remembered on this browser.</p><div class="dialog-foot">FIXED SEED <b>08317</b><span>EVERY VISIT, A FAMILIAR PLACE</span></div></dialog>
      <dialog id="controls" aria-labelledby="controls-title"><button class="dialog-close" aria-label="Close controls">×</button><div class="eyebrow">A FEW THINGS TO KNOW</div><h2 id="controls-title">Find your way</h2><dl class="controls-list"><div><dt>Move / look around</dt><dd><kbd>W A S D</kbd> / Mouse</dd></div><div><dt>Jump / swim up</dt><dd><kbd>Space</kbd></dd></div><div><dt>Toggle creative flight</dt><dd><kbd>2× Space</kbd> / <kbd>F</kbd></dd></div><div><dt>Fly up / down</dt><dd><kbd>Space</kbd> / <kbd>Shift</kbd></dd></div><div><dt>Sprint / faster flight</dt><dd><kbd>Left Ctrl</kbd></dd></div><div><dt>Break / place block</dt><dd><kbd>LMB</kbd> / <kbd>RMB</kbd></dd></div><div><dt>Select block</dt><dd><kbd>1–8</kbd> / Scroll</dd></div><div><dt>Pause / release mouse</dt><dd><kbd>Esc</kbd></dd></div><div><dt>Download photo / hide HUD</dt><dd><kbd>P</kbd> / <kbd>H</kbd></dd></div></dl><p>Double-tap Space to start or stop flying. Click Enter the world to capture your mouse. Edits last for this session; reloading starts fresh.</p></dialog>
      <div id="toast" role="status" aria-live="polite"></div>
    `;
    this.app.querySelectorAll<HTMLButtonElement>("[data-dialog]").forEach(
      (button) =>
        (button.onclick = () => {
          document
            .querySelector<HTMLDialogElement>(`#${button.dataset.dialog}`)!
            .showModal();
        }),
    );
    this.app.querySelectorAll<HTMLDialogElement>("dialog").forEach((dialog) => {
      dialog.querySelector<HTMLButtonElement>(".dialog-close")!.onclick = () =>
        dialog.close();
      dialog.addEventListener("click", (event) => {
        if (
          event.target === dialog &&
          (event.offsetX < 0 ||
            event.offsetX > dialog.clientWidth ||
            event.offsetY < 0 ||
            event.offsetY > dialog.clientHeight)
        )
          dialog.close();
      });
    });
    this.app
      .querySelectorAll<HTMLButtonElement>("[data-slot]")
      .forEach(
        (button) =>
          (button.onclick = () => this.select(Number(button.dataset.slot))),
      );
  }
  setScreen(screen: Screen) {
    this.screen = screen;
    document.querySelector<HTMLElement>("#menu")!.hidden = screen !== "menu";
    document.querySelector<HTMLElement>("#hud")!.hidden = screen !== "playing";
    document.querySelector<HTMLElement>("#paused")!.hidden =
      screen !== "paused";
    document.body.dataset.screen = screen;
    if (screen === "paused")
      document.querySelector<HTMLButtonElement>("#resume")!.focus();
    if (screen === "menu")
      document
        .querySelector<HTMLButtonElement>("#play")!
        .focus({ preventScroll: true });
  }
  select(index: number) {
    this.selected = (index + BLOCKS.length) % BLOCKS.length;
    document.querySelector("#selected-name")!.textContent =
      BLOCKS[this.selected]!.name;
    this.app
      .querySelectorAll<HTMLButtonElement>("[data-slot]")
      .forEach((button, i) => {
        button.classList.toggle("active", i === this.selected);
        button.setAttribute("aria-pressed", String(i === this.selected));
      });
  }
  toast(message: string) {
    const toast = document.querySelector<HTMLElement>("#toast")!;
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(
      () => toast.classList.remove("visible"),
      3300,
    );
  }
}
