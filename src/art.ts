/** Tiny, local line icons; no icon font or network request. */
const paths = {
  sound: '<path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M3 9h4l5-4v14l-5-4H3zM16 9l6 6m0-6-6 6"/>',
  full: '<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.5"/>',
  guide: '<path d="M3 4c3-1 6 0 9 2 3-2 6-3 9-2v14c-3-1-6 0-9 2-3-2-6-3-9-2zm9 2v14"/>',
  settings:
    '<path d="m9.5 3-.6 2.4-2 .9-2.2-.7-2.3 3.9L4 11v2l-1.6 1.6 2.3 3.9 2.2-.7 2 .9.6 2.3h5l.6-2.3 2-.9 2.2.7 2.3-3.9L20 13v-2l1.6-1.5-2.3-3.9-2.2.7-2-.9-.6-2.4z"/><circle cx="12" cy="12" r="3"/>',
  play: '<path d="m6 3 14 9-14 9z" fill="currentColor" stroke="none"/>',
  enter: '<path d="M20 5v8H4m6-6-6 6 6 6"/>',
  back: '<path d="M20 12H4m7-7-7 7 7 7"/>',
  tree: '<path d="m12 2-6 8h3l-5 7h6v4h4v-4h6l-5-7h3z"/>',
  seed: '<path d="m12 2 9 5v10l-9 5-9-5V7zm0 10v10m0-10L3 7m9 5 9-5"/>',
  fly: '<path d="m3 13 18-9-7 17-3-8zm8 0L21 4"/>',
  walk: '<circle cx="14" cy="4" r="2"/><path d="m8 21 4-8-1-5-5 6m5-6 4 4 4 1m-7 0 3 3 1 5"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  pin: '<path d="M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z"/><circle cx="12" cy="9" r="2"/>',
} as const;
export function icon(name: keyof typeof paths) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">${paths[name]}</svg>`;
}

/** Isometric field specimens drawn in the same palette as the generated world. */
type Swatch = readonly [string, string, string];
const swatches: Record<string, Swatch> = {
  meadow: ['#a8b960', '#857049', '#9c8052'],
  earth: ['#ae8854', '#826348', '#966d48'],
  shale: ['#adb3a8', '#78837e', '#929993'],
  sand: ['#e7d295', '#bba776', '#d2bb81'],
  timber: ['#caac70', '#826246', '#a47e52'],
  spruce: ['#8ca459', '#526f46', '#728d50'],
  amber: ['#edb85c', '#ad7e37', '#cf9641'],
  planks: ['#d0a975', '#997347', '#b58b59'],
};
function cube(x: number, y: number, r: number, h: number, p: Swatch, flecks = false) {
  const s = r * 0.5;
  return `<path fill="${p[1]}" d="M${x - r} ${y}l${r} ${s}v${h}l-${r} -${s}z"/><path fill="${p[2]}" d="M${x} ${y + s}l${r} -${s}v${h}l-${r} ${s}z"/><path fill="${p[0]}" d="M${x} ${y - s}l${r} ${s}-${r} ${s}-${r} -${s}z"/>${flecks ? `<path fill="#fff" opacity=".2" d="m${x - r * 0.42} ${y - r * 0.12} 4 -2 4 2 -4 2zm${r * 0.57} ${r * 0.14} 3 -1.5 3 1.5 -3 1.5z"/><path fill="#322a1e" opacity=".22" d="m${x - r * 0.73} ${y + h * 0.4} 4 2v3l-4-2zm${r * 0.97} ${h * 0.33} 5-2v2l-5 2z"/>` : ''}`;
}
export function blockIcon(name: string) {
  const p = swatches[name] ?? swatches.meadow!;
  const cap = name === 'meadow' ? cube(24, 13, 18, 3, ['#b5c56d', '#819546', '#96a953']) : '';
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${cube(24, 13, 18, 20, p, true)}${cap}</svg>`;
}
export function biomeArt() {
  const pine = (x: number, y: number, s: number) =>
    `<g transform="translate(${x} ${y}) scale(${s})">${cube(0, 0, 2.4, 8, swatches.timber!)}${cube(0, -5, 9, 4, ['#728b56', '#415d49', '#526e4d'])}${cube(0, -10, 7, 5, ['#829956', '#49684d', '#5e7951'])}${cube(0, -15, 4.6, 5, ['#94a85e', '#526f4f', '#6e8956'])}${cube(0, -19, 2.2, 4, ['#a8b96c', '#597b50', '#80944f'])}</g>`;
  return `<svg class="specimen" aria-hidden="true" viewBox="0 0 92 82"><path fill="#17231d" opacity=".4" d="m6 60 42-20 40 20-40 20z"/>${cube(46, 48, 36, 13, ['#a1a85f', '#846b4d', '#695b47'], true)}${cube(46, 46, 36, 4, ['#aeb969', '#8a9b53', '#768649'])}${pine(34, 43, 0.76)}${pine(51, 39, 1.27)}${pine(62, 49, 0.7)}${cube(33, 51, 3, 2, ['#b3b19b', '#8d9383', '#778074'])}</svg>`;
}
