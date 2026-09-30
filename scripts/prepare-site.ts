import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const destination = resolve(root, 'public/images');
await mkdir(destination, { recursive: true });
const available: Record<string, boolean> = {};
for (const name of ['in-game', 'main-menu']) {
  const source = Bun.file(resolve(root, `screenshots/${name}.png`));
  available[name] = await source.exists();
  if (available[name]) await Bun.write(resolve(destination, `${name}.png`), source);
  else await writeFile(resolve(destination, `${name}-missing.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="1440" height="900" fill="#e6e9d8"/><rect x="40" y="40" width="1360" height="820" fill="none" stroke="#5e735b" stroke-width="2" stroke-dasharray="12 12"/><text x="720" y="430" font-family="sans-serif" font-size="40" text-anchor="middle" fill="#263e31">Screenshot not yet available</text><text x="720" y="495" font-family="sans-serif" font-size="24" text-anchor="middle" fill="#42573e">Add screenshots/${name}.png and restart the site.</text></svg>`);
  console.log(`${available[name] ? 'Prepared real capture' : 'Generated labeled missing-capture panel'}: ${name}`);
}
await writeFile(resolve(destination, 'captures.json'), JSON.stringify(available));
