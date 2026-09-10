/** Original isometric voxel-cube mark for the menu and HUD. */
export function logoSvg(size = 64): string {
  return `
<svg class="cw-logo" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="Cubewild logo">
  <g stroke="#141d27" stroke-width="2.5" stroke-linejoin="round">
    <polygon points="32,4 59,20 32,36 5,20" fill="#63b45a"/>
    <polygon points="5,20 32,36 32,62 5,46" fill="#6b4a2f"/>
    <polygon points="59,20 32,36 32,62 59,46" fill="#7d5836"/>
  </g>
  <g fill="#7fd06f">
    <rect x="24" y="14" width="3" height="3"/>
    <rect x="40" y="18" width="3" height="3"/>
    <rect x="31" y="23" width="3" height="3"/>
    <rect x="17" y="19" width="3" height="3"/>
  </g>
  <g fill="#4e8f42">
    <rect x="35" y="11" width="3" height="3"/>
    <rect x="45" y="24" width="3" height="3"/>
    <rect x="25" y="25" width="3" height="3"/>
  </g>
  <g fill="#8a6538">
    <rect x="16" y="33" width="3" height="3"/>
    <rect x="40" y="40" width="3" height="3"/>
    <rect x="22" y="46" width="3" height="3"/>
  </g>
  <rect x="28" y="17" width="3" height="3" fill="#f2b544"/>
  <rect x="29" y="18" width="1" height="1" fill="#d0563f"/>
</svg>`;
}
