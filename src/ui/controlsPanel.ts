import { KEY_BINDINGS } from "../input/input";
import { createKeyHint, el } from "./dom";

/** Keyboard/mouse reference generated from the single source of truth. */
export class ControlsPanel {
  readonly root: HTMLDivElement;

  constructor() {
    this.root = el("div", "cw-controls");
    for (const binding of KEY_BINDINGS) {
      this.root.appendChild(createKeyHint(binding.keys, binding.action));
    }
    this.root.appendChild(
      el(
        "p",
        "cw-controls-note",
        "Tip: double-tap Space to start flying, then Space / Shift to rise and descend.",
      ),
    );
  }
}
