import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { transformCaptureHtml } from './site/capture-html';

export default defineConfig({
  plugins: [{
    name: 'honest-game-captures',
    transformIndexHtml(html, context) {
      if (context.path.startsWith('/play/')) return html;
      return transformCaptureHtml(html, name => existsSync(resolve(import.meta.dirname, `screenshots/${name}.png`)));
    },
  }],
  build: {
    rollupOptions: {
      input: { website: 'index.html', game: 'play/index.html' },
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
