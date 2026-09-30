import { blocks } from './blocks';

export type Screen = 'menu' | 'playing' | 'paused';
export interface Settings { distance: number; sensitivity: number }
export class UI {
  readonly root = document.querySelector<HTMLDivElement>('#app')!;
  readonly dialog: HTMLDialogElement;
  private toastTimer = 0;
  constructor(actions: { play: () => void; menu: () => void; screenshot: () => void; settings: (s: Settings) => void; select: (i: number) => void }, settings: Settings) {
    this.root.innerHTML = `
      <section id="menu" class="screen menu">
        <header class="topline"><span class="wordmark"><span class="mark">◈</span> VERDANT ISLES</span><span class="build-tag">CREATIVE SANDBOX <i></i> ALPHA 0.1</span></header>
        <div class="menu-content">
          <div class="eyebrow"><span></span> A LITTLE WORLD. ENDLESS POSSIBILITY.</div>
          <h1>Verdant<br><em>Isles</em><span class="title-dot">.</span></h1>
          <p class="intro">Find a quiet shore.<br>Build something that belongs to you.</p>
          <nav class="menu-actions" aria-label="Main menu">
            <button id="play" class="primary"><span class="play-icon">▶</span> Enter the world <span class="arrow">↗</span></button>
            <div class="secondary-actions"><button data-panel="settings">⚙ <span>Settings</span></button><button data-panel="controls">⌘ <span>How to play</span></button></div>
          </nav>
          <div class="world-info"><span class="small-cube">◇</span><div><strong>THE CEDAR COAST</strong><span>Seed 74821 · Procedural world · Yours to shape</span></div></div>
        </div>
        <div class="scene-caption"><span class="caption-line"></span><span>01 / THE CEDAR COAST<br><strong>Somewhere worth getting lost.</strong></span></div>
        <footer class="menu-footer"><span>AN ORIGINAL VOXEL EXPLORATION</span><span>Made for wandering <span class="tiny-star">✦</span></span></footer>
      </section>
      <section id="hud" class="hud" hidden aria-label="Game HUD">
        <div class="hud-top"><div class="location"><span class="mark">◈</span><div><strong>CEDAR COAST</strong><span id="coords">VERDANT ISLES</span></div></div><div class="hud-right"><span class="mode" id="mode">● ON FOOT</span><button id="capture" title="Download a world screenshot (P)" aria-label="Capture screenshot">▣ <kbd>P</kbd></button><button id="pause" aria-label="Pause game">Ⅱ <kbd>ESC</kbd></button></div></div>
        <div id="crosshair" class="crosshair" aria-hidden="true"></div>
        <div class="target" id="target"></div>
        <div class="hotbar-wrap"><div class="selected-label"><span id="selected-name">Meadow</span><span>CREATIVE INVENTORY</span></div><div class="hotbar" role="toolbar" aria-label="Block selection">${blocks.map((b, i) => `<button class="slot ${i === 0 ? 'selected' : ''}" data-slot="${i}" aria-label="Select ${b.name}" aria-pressed="${i === 0}"><kbd>${i+1}</kbd><span class="block-icon" style="--block:${b.color}"></span></button>`).join('')}</div><div class="control-strip"><span><kbd>LMB</kbd> Break</span><span><kbd>RMB</kbd> Place</span><span><kbd>F</kbd> Fly</span><span><kbd>H</kbd> Hide HUD</span></div></div>
        <div class="explore-hint" id="explore-hint">Click the world to look around</div>
      </section>
      <section id="paused" class="screen pause" hidden><div class="pause-card"><span class="eyebrow">TAKE A BREATHER</span><h2>World paused<span>.</span></h2><p>Your little corner of the coast can wait.</p><button id="resume" class="primary">Back to exploring <span class="arrow">↗</span></button><button data-panel="settings">Settings</button><button data-panel="controls">How to play</button><button id="return-menu">Return to main menu</button><span class="pause-note">Edits are kept until this tab is refreshed.</span></div></section>
      <dialog id="panel"><div class="dialog-top"><span class="eyebrow" id="panel-eyebrow">MAKE IT YOURS</span><button id="close-panel" aria-label="Close dialog">✕</button></div><div id="settings-panel"><h2>A comfortable world.</h2><p>Tune your view. Changes apply immediately.</p><label for="distance">View distance <output id="distance-value">${settings.distance} chunks</output></label><input id="distance" type="range" min="2" max="5" step="1" value="${settings.distance}"><p class="field-note">Larger views show more terrain and use more memory.</p><label for="sensitivity">Mouse sensitivity <output id="sensitivity-value">${settings.sensitivity.toFixed(1)}×</output></label><input id="sensitivity" type="range" min="0.2" max="2" step="0.1" value="${settings.sensitivity}"><div class="settings-note">Settings are saved on this browser. Desktop keyboard & mouse recommended.</div></div><div id="controls-panel" hidden><h2>Make yourself at home.</h2><p>Explore freely. Every block is a possibility.</p><dl class="controls-list"><dt><kbd>W A S D</kbd></dt><dd>Move around</dd><dt><kbd>Mouse</kbd></dt><dd>Look around</dd><dt><kbd>Space</kbd></dt><dd>Jump / fly up</dd><dt><kbd>F</kbd></dt><dd>Toggle creative flight</dd><dt><kbd>Shift</kbd> / <kbd>Ctrl</kbd></dt><dd>Fly down / move faster</dd><dt><kbd>LMB</kbd> / <kbd>RMB</kbd></dt><dd>Break / place a block</dd><dt><kbd>1–8</kbd> / <kbd>Scroll</kbd></dt><dd>Select a block</dd><dt><kbd>Esc</kbd></dt><dd>Pause & release mouse</dd><dt><kbd>P</kbd> / <kbd>H</kbd></dt><dd>Capture world / hide HUD</dd></dl><div class="settings-note">Water is decorative and non-solid. You can walk through it. Blocks are editable within 7 meters.</div></div></dialog>
      <div id="toast" class="toast" role="status" hidden></div>`;
    this.dialog = this.root.querySelector<HTMLDialogElement>('#panel')!;
    this.el('play').onclick = actions.play;
    this.el('resume').onclick = actions.play;
    this.el('return-menu').onclick = actions.menu;
    this.el('capture').onclick = actions.screenshot;
    this.el('close-panel').onclick = () => this.dialog.close();
    this.root.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach(button => button.onclick = () => {
      this.el('settings-panel').hidden = button.dataset.panel !== 'settings';
      this.el('controls-panel').hidden = button.dataset.panel !== 'controls';
      this.dialog.showModal();
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(button => button.onclick = () => actions.select(Number(button.dataset.slot)));
    for (const id of ['distance', 'sensitivity']) {
      const input = this.root.querySelector<HTMLInputElement>(`#${id}`)!;
      input.oninput = () => {
        settings.distance = Number(this.root.querySelector<HTMLInputElement>('#distance')!.value);
        settings.sensitivity = Number(this.root.querySelector<HTMLInputElement>('#sensitivity')!.value);
        this.el('distance-value').textContent = `${settings.distance} chunks`;
        this.el('sensitivity-value').textContent = `${settings.sensitivity.toFixed(1)}×`;
        actions.settings(settings);
      };
    }
  }
  el(id: string): HTMLElement { return this.root.querySelector<HTMLElement>(`#${id}`)!; }
  screen(screen: Screen): void {
    this.el('menu').hidden = screen !== 'menu'; this.el('hud').hidden = screen === 'menu'; this.el('paused').hidden = screen !== 'paused';
    this.root.dataset.screen = screen;
  }
  select(i: number): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((b, n) => { b.classList.toggle('selected', i === n); b.setAttribute('aria-pressed', String(i === n)); });
    this.el('selected-name').textContent = blocks[i]!.name;
  }
  toast(message: string): void {
    clearTimeout(this.toastTimer); this.el('toast').textContent = message; this.el('toast').hidden = false;
    this.toastTimer = window.setTimeout(() => { this.el('toast').hidden = true; }, 3000);
  }
}
