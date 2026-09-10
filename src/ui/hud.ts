import { formatSigned } from "../core/math";
import { getBlockDef, HOTBAR_BLOCKS } from "../world/blocks";
import { createTileIcon, type BlockAtlas } from "../world/textures";
import { el } from "./dom";
import { logoSvg } from "./logo";

export interface HudState {
  fps: number;
  x: number;
  y: number;
  z: number;
  biome: string;
  chunks: number;
  pending: number;
  flying: boolean;
  inWater: boolean;
  seed: number;
}

/** In-game overlay: crosshair, debug info, status badges, hints and hotbar. */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly fpsText: Text;
  private readonly positionText: Text;
  private readonly biomeText: Text;
  private readonly seedText: Text;
  private readonly flyBadge: HTMLDivElement;
  private readonly swimBadge: HTMLDivElement;
  private readonly blockName: HTMLDivElement;
  private readonly slotButtons: HTMLButtonElement[] = [];

  onSelectSlot: ((index: number) => void) | null = null;

  constructor(atlas: BlockAtlas) {
    this.root = el("div", "cw-hud");

    const crosshair = el("div", "cw-crosshair");
    crosshair.appendChild(el("span"));
    crosshair.appendChild(el("span"));
    this.root.appendChild(crosshair);

    const info = el("div", "cw-hud-card cw-hud-info");
    const brand = el("div", "cw-hud-brand");
    brand.innerHTML = logoSvg(26);
    brand.appendChild(el("span", "cw-hud-brand-name", "CUBEWILD"));
    info.appendChild(brand);

    const fpsRow = el("div", "cw-stat");
    fpsRow.appendChild(el("span", "cw-stat-label", "Perf"));
    this.fpsText = document.createTextNode("—");
    fpsRow.appendChild(this.fpsText);
    info.appendChild(fpsRow);

    const positionRow = el("div", "cw-stat");
    positionRow.appendChild(el("span", "cw-stat-label", "XYZ"));
    this.positionText = document.createTextNode("—");
    positionRow.appendChild(this.positionText);
    info.appendChild(positionRow);

    const biomeRow = el("div", "cw-stat");
    biomeRow.appendChild(el("span", "cw-stat-label", "Biome"));
    this.biomeText = document.createTextNode("—");
    biomeRow.appendChild(this.biomeText);
    info.appendChild(biomeRow);

    const seedRow = el("div", "cw-stat cw-stat-quiet");
    seedRow.appendChild(el("span", "cw-stat-label", "Seed"));
    this.seedText = document.createTextNode("—");
    seedRow.appendChild(this.seedText);
    info.appendChild(seedRow);
    this.root.appendChild(info);

    const badges = el("div", "cw-hud-badges");
    this.flyBadge = el("div", "cw-badge cw-badge-fly", "Flying");
    this.swimBadge = el("div", "cw-badge cw-badge-swim", "Swimming");
    badges.appendChild(this.flyBadge);
    badges.appendChild(this.swimBadge);
    this.root.appendChild(badges);

    const hints = el("div", "cw-hud-card cw-hud-hints");
    hints.appendChild(this.hintRow("LMB", "break"));
    hints.appendChild(this.hintRow("RMB", "place"));
    hints.appendChild(this.hintRow("1-9 / wheel", "select block"));
    hints.appendChild(this.hintRow("P", "screenshot"));
    hints.appendChild(this.hintRow("Esc", "pause"));
    this.root.appendChild(hints);

    const hotbarWrap = el("div", "cw-hotbar-wrap");
    this.blockName = el("div", "cw-block-name", "Grass");
    hotbarWrap.appendChild(this.blockName);
    const hotbar = el("div", "cw-hotbar");
    hotbar.setAttribute("role", "toolbar");
    hotbar.setAttribute("aria-label", "Block selection");
    HOTBAR_BLOCKS.forEach((block, index) => {
      const slot = el("button", "cw-slot");
      slot.type = "button";
      slot.title = getBlockDef(block).name;
      slot.setAttribute("aria-label", `Select ${getBlockDef(block).name}`);
      const icon = el("span", "cw-slot-icon");
      const canvas = createTileIcon(atlas, getBlockDef(block).iconTile, 48);
      icon.appendChild(canvas);
      slot.appendChild(icon);
      slot.appendChild(el("span", "cw-slot-index", String(index + 1)));
      slot.addEventListener("click", () => this.onSelectSlot?.(index));
      hotbar.appendChild(slot);
      this.slotButtons.push(slot);
    });
    hotbarWrap.appendChild(hotbar);
    this.root.appendChild(hotbarWrap);
    this.setSelected(0);
  }

  private hintRow(keys: string, action: string): HTMLElement {
    const row = el("div", "cw-hint-row");
    row.appendChild(el("kbd", "cw-kbd cw-kbd-small", keys));
    row.appendChild(el("span", "cw-hint-action", action));
    return row;
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("is-visible", visible);
  }

  setSelected(index: number): void {
    this.slotButtons.forEach((slot, i) => slot.classList.toggle("is-selected", i === index));
    const block = HOTBAR_BLOCKS[index];
    if (block !== undefined) this.blockName.textContent = getBlockDef(block).name;
    else this.blockName.textContent = "";
  }

  update(state: HudState): void {
    const perf =
      state.pending > 0
        ? `${Math.round(state.fps)} fps · ${state.chunks} chunks · loading ${state.pending}`
        : `${Math.round(state.fps)} fps · ${state.chunks} chunks`;
    this.setIfChanged(this.fpsText, perf);
    this.setIfChanged(
      this.positionText,
      `${formatSigned(state.x)} ${formatSigned(state.y)} ${formatSigned(state.z)}`,
    );
    this.setIfChanged(this.biomeText, state.biome);
    this.setIfChanged(this.seedText, String(state.seed));
    this.flyBadge.classList.toggle("is-visible", state.flying);
    this.swimBadge.classList.toggle("is-visible", state.inWater && !state.flying);
  }

  private setIfChanged(node: Text, value: string): void {
    if (node.data !== value) node.data = value;
  }
}

/** Full-screen progress card shown while the first chunks are generated. */
export class LoadingOverlay {
  readonly root: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly label: HTMLDivElement;

  constructor(message = "Shaping the wilderness…") {
    this.root = el("div", "cw-loading");
    const card = el("div", "cw-loading-card");
    card.innerHTML = logoSvg(56);
    card.appendChild(el("h2", "cw-loading-title", message));
    const bar = el("div", "cw-loading-bar");
    this.fill = el("div", "cw-loading-fill");
    bar.appendChild(this.fill);
    card.appendChild(bar);
    this.label = el("div", "cw-loading-label", "Preparing terrain");
    card.appendChild(this.label);
    this.root.appendChild(card);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("is-visible", visible);
  }

  setProgress(fraction: number, label?: string): void {
    const clamped = Math.max(0, Math.min(1, fraction));
    this.fill.style.width = `${Math.round(clamped * 100)}%`;
    this.label.textContent = label ?? `Generating chunks · ${Math.round(clamped * 100)}%`;
  }
}
