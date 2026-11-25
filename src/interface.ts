import { biomeArt, blockIcon, icon } from './art';
import { Block } from './world';

export type Screen = 'menu' | 'play' | 'pause' | 'settings' | 'guide';
export const inventory = [
  [Block.Grass, 'Meadow grass', 'meadow'],
  [Block.Dirt, 'Earth', 'earth'],
  [Block.Stone, 'Shale', 'shale'],
  [Block.Sand, 'River sand', 'sand'],
  [Block.Wood, 'Pine log', 'timber'],
  [Block.Leaves, 'Pine needles', 'spruce'],
  [Block.Amber, 'Amber leaves', 'amber'],
  [Block.Planks, 'Cut timber', 'planks'],
] as const;
export interface Config {
  radius: number;
  sensitivity: number;
}
const iconButton = (action: string, title: string, glyph: Parameters<typeof icon>[0]) =>
  `<button class="square" data-act="${action}" title="${title}" aria-label="${title}">${icon(glyph)}</button>`;
const primary = (action: string, text: string) =>
  `<button class="primary" data-act="${action}">${icon('play')}<span>${text}</span><kbd>${icon('enter')}</kbd></button>`;
const secondary = (action: string, text: string, glyph: Parameters<typeof icon>[0]) =>
  `<button class="secondary" data-act="${action}">${icon(glyph)}${text}</button>`;
const tools = (sound: boolean) =>
  `<div class="utilities"><span class="local mono"><i class="dot"></i>LOCAL SESSION</span>${iconButton('sound', sound ? 'Mute ambience' : 'Enable ambience', sound ? 'sound' : 'mute')}${iconButton('capture', 'Capture screenshot (P)', 'camera')}${iconButton('full', 'Toggle fullscreen', 'full')}</div>`;
const masthead = (sound: boolean) =>
  `<header class="mast"><div class="studio"><img src="/mark.svg" alt=""><span>FIELDWORK<small>GAME STUDIO</small></span></div>${tools(sound)}</header>`;
const footer = () =>
  `<footer class="foot mono"><span><b class="plus">+</b> FIELDWORK SERIES <b>/</b> VOL. 01</span><span><i class="build-square"></i> ALPHA BUILD <b>/</b> V0.1.0</span></footer>`;
const card = () =>
  `<aside class="region-card"><div class="region-art">${biomeArt()}</div><div class="region-copy"><div class="micro"><i class="dot"></i> WORLD PREVIEW</div><strong>Alder Basin</strong><span class="seed mono">${icon('seed')} SEED &nbsp;001847</span></div><i class="corner"></i></aside>`;
const legend = (n: string, text: string) =>
  `<div class="legend"><i></i><span class="mono">${n}</span><b></b><span class="mono">${text}</span></div>`;
const menu = () =>
  `<section class="intro"><div class="hero-title">${legend('SERIES 01', 'SANDBOX EDITION')}<h1>BRACKEN<br>VALE<span class="title-dot">.</span></h1><p>A creative voxel wilderness.</p></div><div class="menu-actions">${primary('start', 'Enter world')}<div class="secondary-row">${secondary('guide', 'Field guide', 'guide')}${secondary('settings', 'Settings', 'settings')}</div></div></section>${card()}`;
const guideRows = [
  ['W A S D', 'Move'],
  ['Mouse / ← →', 'Look around'],
  ['Space', 'Jump / swim up'],
  ['F / Space ×2', 'Toggle creative flight'],
  ['Space / Shift', 'Fly up / down'],
  ['LMB / RMB', 'Break / place block'],
  ['1 – 8 / Wheel', 'Select material'],
  ['Esc', 'Pause / release cursor'],
  ['P', 'Download screenshot'],
];
const guide = () =>
  `<div class="control-list">${guideRows.map(([key, desc]) => `<div><span>${desc}</span><kbd>${key}</kbd></div>`).join('')}</div>`;
const settings = (cfg: Config) => `
  <div class="settings-list">
    <label for="distance"><strong>View distance</strong><output id="distance-out">${cfg.radius} chunks</output></label>
    <input id="distance" type="range" min="3" max="9" step="1" value="${cfg.radius}">
    <p>How far the valley extends around you.</p>
    <label for="sense"><strong>Mouse sensitivity</strong><output id="sense-out">${cfg.sensitivity.toFixed(1)}×</output></label>
    <input id="sense" type="range" min="0.3" max="2" step=".1" value="${cfg.sensitivity}">
    <p>Adjust the speed of mouse-look.</p>
  </div>`;
const pause = () => `
  <p class="panel-lead">Alder Basin <span> / </span> Local creative session</p>
  ${primary('resume', 'Resume world')}
  <div class="secondary-row">${secondary('guide', 'Field guide', 'guide')}${secondary('settings', 'Settings', 'settings')}</div>
  <button class="back" data-act="menu">${icon('back')} Return to title</button>`;
const panel = (s: 'pause' | 'settings' | 'guide', cfg: Config) => {
  const title = { pause: 'PAUSED.', guide: 'FIELD GUIDE.', settings: 'SETTINGS.' }[s];
  const section = { pause: 'STANDBY', guide: 'REFERENCE', settings: 'PREFERENCES' }[s];
  const back = `<button class="back" data-act="back">${icon('back')} Back</button>`;
  return `<section class="panel" aria-labelledby="panel-title">${legend('FIELD SYSTEM', section)}
    <h2 id="panel-title" tabindex="-1">${title}</h2>
    ${s === 'pause' ? pause() : (s === 'guide' ? guide() : settings(cfg)) + back}
  </section>`;
};
const hud = () => `
  <div class="hud-top">
    <div class="location"><img src="/mark.svg" alt=""><div><span class="micro">FIELDWORK &nbsp;/&nbsp; 01</span><strong>Alder Basin</strong></div></div>
    <div class="compass"><span class="compass-needle">▾</span><div id="bearing"></div></div>
    <button class="hud-menu" data-act="pause"><kbd>ESC</kbd> Pause</button>
  </div>
  <div class="crosshair" aria-hidden="true"></div>
  <div class="hud-status"><div id="motion"></div><div class="mono coords" id="coords"></div></div>
  <div class="inventory"><div id="selected" class="item-label"></div>
    <div class="belt">${inventory.map(([, name, art], i) => `<button data-slot="${i}" aria-label="${i + 1}: ${name}"><small>${i + 1}</small>${blockIcon(art)}</button>`).join('')}</div>
  </div>
  <div class="tool-hint"><span><kbd>LMB</kbd> Break</span><span><kbd>RMB</kbd> Place</span></div>`;

export class Interface {
  root: HTMLElement;
  private toastTimer?: number;
  private notice: HTMLElement;
  private targetLabel?: HTMLSpanElement;
  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'overlay';
    parent.append(this.root);
    this.notice = document.createElement('div');
    this.notice.id = 'notice';
    this.notice.role = 'status';
    parent.append(this.notice);
  }
  show(screen: Screen, cfg: Config, sound: boolean) {
    this.root.className =
      screen === 'play' ? 'playing' : screen === 'menu' ? 'title-screen' : 'panel-screen';
    this.root.dataset.screen = screen;
    this.root.innerHTML =
      screen === 'play'
        ? hud()
        : `<div class="veil"></div>${masthead(sound)}${screen === 'menu' ? menu() : panel(screen, cfg)}${footer()}`;
    this.targetLabel = undefined;
    if (screen === 'play') {
      this.targetLabel = document.createElement('span');
      this.targetLabel.className = 'target-label';
      this.targetLabel.hidden = true;
      this.root.append(this.targetLabel);
    }
    if (screen !== 'menu' && screen !== 'play')
      document.querySelector<HTMLElement>('#panel-title')?.focus();
  }
  aim(hit: readonly number[] | undefined, id: Block | undefined) {
    const el = this.targetLabel;
    if (!el) return;
    if (!hit || !id) {
      if (!el.hidden) {
        el.hidden = true;
        delete el.dataset.cell;
      }
      return;
    }
    const cell = hit.join(',');
    if (el.dataset.cell === cell && el.dataset.block === String(id)) return;
    el.dataset.cell = cell;
    el.dataset.block = String(id);
    el.hidden = false;
    el.textContent = inventory.find(([block]) => block === id)?.[1] ?? Block[id];
  }
  select(slot: number) {
    this.root.querySelectorAll<HTMLElement>('[data-slot]').forEach((b, i) => {
      b.classList.toggle('chosen', i === slot);
      b.setAttribute('aria-pressed', `${i === slot}`);
    });
    const label = this.root.querySelector('#selected');
    if (label)
      label.innerHTML = `<span>${String(slot + 1).padStart(2, '0')}</span> ${inventory[slot]![1]}`;
  }
  telemetry(x: number, y: number, z: number, yaw: number, flying: boolean) {
    const status = this.root.querySelector<HTMLElement>('#motion');
    if (!status) return;
    const mode = flying ? 'Creative flight' : 'On foot';
    if (status.dataset.mode !== mode) {
      status.dataset.mode = mode;
      status.innerHTML = `${icon(flying ? 'fly' : 'walk')} ${mode} <kbd>F</kbd>`;
    }
    this.root.querySelector('#coords')!.textContent =
      `X ${Math.floor(x)}  /  Y ${Math.floor(y)}  /  Z ${Math.floor(z)}`;
    const angle = ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const center = Math.round(angle / 45);
    this.root.querySelector('#bearing')!.innerHTML =
      `<span>${names[(center + 7) % 8]}</span><b>· &nbsp; | &nbsp; ·</b> ${names[center % 8]} <b>· &nbsp; | &nbsp; ·</b><span>${names[(center + 1) % 8]}</span>`;
  }
  toast(text: string) {
    clearTimeout(this.toastTimer);
    this.notice.textContent = text;
    this.notice.classList.add('visible');
    this.toastTimer = window.setTimeout(() => this.notice.classList.remove('visible'), 2600);
  }
  dispose() {
    clearTimeout(this.toastTimer);
    this.notice.remove();
    this.root.remove();
  }
}
