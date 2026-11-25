import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const captures = {
  hero: {
    source: 'in-game.png',
    alt: 'A red-roofed shelter beside the river below Alder Basin’s sunlit ridge.',
  },
  world: {
    source: 'in-game.png',
    alt: 'First-person view of Alder Basin, with the compass and eight-slot block inventory visible.',
  },
  menu: {
    source: 'main-menu.png',
    alt: 'Bracken Vale title screen with Enter world, Field guide and Settings over the voxel valley.',
  },
} as const;
type Name = keyof typeof captures;
type Asset = { fileName: string; data: Buffer };
type Render = { html: string; assets: Asset[] };
const names = Object.keys(captures) as Name[];
const marker = (name: Name) => `<!--capture:${name}-->`;

export async function renderCapture(dir: string, name: Name, base: string): Promise<Render> {
  const { source, alt } = captures[name];
  let png: Buffer;
  try {
    png = await readFile(join(dir, source));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {
      html: `<div class="capture-missing">Screenshot unavailable. Add <code>screenshots/${source}</code> to display it.</div>`,
      assets: [],
    };
  }

  const { default: sharp } = await import('sharp');
  const image = sharp(png);
  let { width, height } = await image.metadata();
  const hero = name === 'hero';
  if (hero) {
    // Remove the top and bottom HUD rows from the standard 1600×900 frame;
    // retain the full panorama and let the site's object-fit handle its frame.
    const top = Math.round((height * 90) / 900);
    const bottom = Math.round((height * 138) / 900);
    height = Math.max(1, height - top - bottom);
    image.extract({ left: 0, top, width, height });
  }

  const widths = [...new Set([640, 1024, width].map((w) => Math.min(w, width)))];
  const assets = await Promise.all(
    widths.map(async (w) => {
      const data = await image.clone().resize(w).webp({ quality: 83 }).toBuffer();
      const hash = createHash('sha256').update(data).digest('hex').slice(0, 10);
      return { fileName: `assets/captures/${name}-${w}-${hash}.webp`, data };
    }),
  );
  const srcset = assets.map(({ fileName }, i) => `${base}${fileName} ${widths[i]}w`).join(', ');
  const full = `${base}${assets.at(-1)!.fileName}`;
  const sizes = hero ? '(min-width: 800px) 55vw, 100vw' : '(min-width: 800px) 50vw, 100vw';
  const img = `<img src="${base}${assets[0]!.fileName}" srcset="${srcset}" sizes="${sizes}" width="${width}" height="${height}" alt="${alt}" decoding="async" ${hero ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
  const html = hero
    ? img
    : `<a class="capture-open" href="${full}" data-lightbox="${name}" aria-label="Open full-size ${name === 'menu' ? 'title screen' : 'gameplay screenshot'}">${img}</a>`;
  return { html, assets };
}

export function captureImages(): Plugin {
  let dir: string, base: string;
  const rendered = new Map<Name, Promise<Render>>();
  const files = new Map<string, Buffer>();
  function reset() {
    rendered.clear();
    files.clear();
  }
  return {
    name: 'bracken-vale-captures',
    configResolved(config) {
      dir = join(config.root, 'screenshots');
      base = config.base;
    },
    buildStart: reset,
    configureServer(server) {
      const sources = new Set(names.map((name) => join(dir, captures[name].source)));
      server.watcher.add([...sources]);
      server.watcher.on('all', (_event, path) => {
        if (sources.has(path)) reset();
      });
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        const image = path.startsWith(base) && files.get(path.slice(base.length));
        if (!image) return next();
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Content-Length', image.length);
        res.end(req.method === 'HEAD' ? undefined : image);
      });
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        for (const name of names) {
          if (!html.includes(marker(name))) continue;
          if (!rendered.has(name)) rendered.set(name, renderCapture(dir, name, base));
          const capture = await rendered.get(name)!;
          for (const { fileName, data } of capture.assets) files.set(fileName, data);
          html = html.replaceAll(marker(name), capture.html);
        }
        return html;
      },
    },
    generateBundle: {
      // Vite renders production HTML (including the hook above) in generateBundle.
      order: 'post',
      handler() {
        for (const [fileName, source] of files) this.emitFile({ type: 'asset', fileName, source });
      },
    },
  };
}
