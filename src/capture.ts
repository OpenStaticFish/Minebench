import type { Landscape } from './scene';

/** Copy WebGL synchronously, then composite the live DOM at the same resolution. */
export async function saveView(scene: Landscape, overlay: HTMLElement, name: string) {
  const frame = document.createElement('canvas');
  const source = scene.renderer.domElement;
  frame.width = source.width;
  frame.height = source.height;
  const ctx = frame.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  scene.redraw();
  ctx.drawImage(source, 0, 0);
  await document.fonts.ready;
  const { toCanvas } = await import('html-to-image');
  const ui = await toCanvas(overlay, {
    pixelRatio: scene.renderer.getPixelRatio(),
    preferredFontFormat: 'woff2',
  });
  ctx.drawImage(ui, 0, 0, frame.width, frame.height);
  const blob = await new Promise<Blob>((ok, no) =>
    frame.toBlob((b) => (b ? ok(b) : no(new Error('PNG encoding failed'))), 'image/png'),
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
