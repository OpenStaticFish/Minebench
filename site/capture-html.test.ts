import { expect, test } from 'bun:test';
import { transformCaptureHtml } from './capture-html';

const html = await Bun.file(new URL('../index.html', import.meta.url)).text();
test('available real captures retain their paths and descriptions', () => {
  expect(transformCaptureHtml(html, () => true)).toBe(html);
});
test('missing captures are labeled in static HTML, including alt text and copy', () => {
  const fallback = transformCaptureHtml(html, () => false);
  for (const name of ['in-game','main-menu']) {
    expect(fallback).toContain(`/images/${name}-missing.svg`);
    expect(fallback).toContain(`Placeholder: add screenshots/${name}.png`);
    expect(fallback).not.toContain(`src="/images/${name}.png"`);
  }
  expect(fallback.match(/SCREENSHOT NOT YET AVAILABLE/g)?.length).toBe(2);
  expect(fallback).not.toContain('These are real captures from the running prototype.');
  const partial = transformCaptureHtml(html, name => name === 'in-game');
  expect(partial).toContain('src="/images/in-game.png"');
  expect(partial).toContain('/images/main-menu-missing.svg');
});
