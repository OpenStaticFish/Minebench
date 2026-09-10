import { el } from "./dom";

/** Stack of transient status messages shown at the top of the screen. */
export class Toasts {
  readonly root: HTMLDivElement;

  constructor() {
    this.root = el("div", "cw-toasts");
    this.root.setAttribute("role", "status");
    this.root.setAttribute("aria-live", "polite");
  }

  show(message: string, options: { timeoutMs?: number; tone?: "info" | "success" } = {}): void {
    const toast = el("div", `cw-toast cw-toast-${options.tone ?? "info"}`, message);
    this.root.appendChild(toast);
    window.setTimeout(() => toast.classList.add("cw-toast-leaving"), options.timeoutMs ?? 2400);
    window.setTimeout(() => toast.remove(), (options.timeoutMs ?? 2400) + 400);
  }
}
