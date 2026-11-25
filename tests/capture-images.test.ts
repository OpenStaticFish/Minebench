import { expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderCapture } from '../scripts/capture-images';

test('missing screenshots identify the expected file without broken images or links', async () => {
  const absent = join(tmpdir(), `bracken-vale-absent-${crypto.randomUUID()}`);
  for (const [name, source] of [
    ['hero', 'in-game.png'],
    ['world', 'in-game.png'],
    ['menu', 'main-menu.png'],
  ] as const) {
    const { html, assets } = await renderCapture(absent, name, '/');
    expect(html).toContain('class="capture-missing"');
    expect(html).toContain(`screenshots/${source}`);
    expect(html).not.toMatch(/<(img|a)\b/);
    expect(assets).toHaveLength(0);
  }
});
