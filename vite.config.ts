import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { captureImages } from './scripts/capture-images';

export default defineConfig({
  plugins: [captureImages()],
  build: {
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        play: fileURLToPath(new URL('./play/index.html', import.meta.url)),
      },
    },
  },
});
