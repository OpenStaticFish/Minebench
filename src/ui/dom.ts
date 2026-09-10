export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (value: number) => string;
  onInput: (value: number) => void;
}

export interface SliderControl {
  root: HTMLElement;
  setValue: (value: number) => void;
}

export function createSlider(options: SliderOptions): SliderControl {
  const root = el("label", "cw-field");
  const header = el("span", "cw-field-header");
  header.appendChild(el("span", "cw-field-label", options.label));
  const readout = el("span", "cw-field-value");
  header.appendChild(readout);
  root.appendChild(header);

  const input = el("input", "cw-range");
  input.type = "range";
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  input.value = String(options.value);
  input.setAttribute("aria-label", options.label);

  const render = (value: number): void => {
    readout.textContent = options.format ? options.format(value) : String(value);
  };
  render(options.value);
  input.addEventListener("input", () => {
    const value = Number(input.value);
    render(value);
    options.onInput(value);
  });
  root.appendChild(input);

  return {
    root,
    setValue: (value: number) => {
      input.value = String(value);
      render(value);
    },
  };
}

export interface ToggleOptions {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export interface ToggleControl {
  root: HTMLElement;
  setValue: (value: boolean) => void;
}

export function createToggle(options: ToggleOptions): ToggleControl {
  const root = el("label", "cw-toggle");
  const text = el("span", "cw-toggle-text");
  text.appendChild(el("span", "cw-field-label", options.label));
  if (options.description) text.appendChild(el("span", "cw-field-hint", options.description));
  root.appendChild(text);

  const input = el("input");
  input.type = "checkbox";
  input.checked = options.value;
  input.setAttribute("aria-label", options.label);
  input.addEventListener("change", () => options.onChange(input.checked));
  root.appendChild(input);
  return {
    root,
    setValue: (value: boolean) => {
      input.checked = value;
    },
  };
}

export function createButton(
  label: string,
  options: { variant?: "primary" | "ghost" | "quieter"; onClick: () => void; title?: string },
): HTMLButtonElement {
  const button = el("button", `cw-button cw-button-${options.variant ?? "primary"}`, label);
  button.type = "button";
  if (options.title) button.title = options.title;
  button.addEventListener("click", options.onClick);
  return button;
}

export function createKeyHint(keys: string, action: string): HTMLElement {
  const row = el("div", "cw-key-row");
  row.appendChild(el("kbd", "cw-kbd", keys));
  row.appendChild(el("span", "cw-key-action", action));
  return row;
}
