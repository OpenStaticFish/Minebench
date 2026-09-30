/** Static HTML gets honest fallback content even when JavaScript is disabled. */
export function transformCaptureHtml(html: string, available: (name: string) => boolean): string {
  let missing = false;
  for (const name of ['in-game', 'main-menu']) {
    if (available(name)) continue;
    missing = true;
    html = html.replaceAll(`/images/${name}.png`, `/images/${name}-missing.svg`);
    html = html.replace(name === 'in-game' ? 'IN-GAME CAPTURE' : 'MAIN MENU CAPTURE', 'SCREENSHOT NOT YET AVAILABLE');
    html = html.replace(name === 'in-game' ? 'The playable Cedar Coast: turquoise water, a sandy shore, block-built trees and hills, procedural clouds, and the creative hotbar.' : 'Verdant Isles main menu over the generated forest and mountain landscape, with Enter the world, Settings, and How to play options.', `Placeholder: add screenshots/${name}.png to display the real game capture.`);
  }
  if (missing) html = html.replace('These are real captures from the running prototype. What you see is the world you can explore.', 'Some captures are not available in this checkout. Labeled panels show where the real game screenshots will appear.');
  return html;
}
