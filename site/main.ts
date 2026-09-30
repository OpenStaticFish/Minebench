import './style.css';
import captures from '../public/images/captures.json';

const toggle = document.querySelector<HTMLButtonElement>('.nav-toggle')!;
const nav = document.querySelector<HTMLElement>('#site-nav')!;
function closeNavigation(): void { toggle.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); }
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open);
});
nav.addEventListener('click', event => { if ((event.target as HTMLElement).closest('a')) closeNavigation(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('is-open')) { closeNavigation(); toggle.focus(); } });
matchMedia('(min-width: 761px)').addEventListener('change', closeNavigation);

const dialog = document.querySelector<HTMLDialogElement>('#screenshot-dialog')!;
const large = document.querySelector<HTMLImageElement>('#screenshot-large')!;
const title = document.querySelector<HTMLElement>('#screenshot-title')!;
const captions = {
  'in-game': 'Cedar Coast · In-game capture',
  'main-menu': 'Verdant Isles · Main menu capture',
};
document.querySelectorAll<HTMLButtonElement>('[data-lightbox]').forEach(button => {
  const key = button.dataset.lightbox as keyof typeof captions;
  button.addEventListener('click', () => {
    large.src = captures[key] ? `/images/${key}.png` : `/images/${key}-missing.svg`;
    large.alt = button.closest('figure')!.querySelector('img')!.alt;
    title.textContent = captures[key] ? captions[key] : 'Screenshot not yet available';
    dialog.showModal();
  });
});
document.querySelector('.lightbox-close')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
for (const key of ['in-game', 'main-menu'] as const) {
  if (captures[key]) continue;
  document.querySelectorAll<HTMLElement>(`[data-capture="${key}"]`).forEach(figure => {
    figure.querySelector('.capture-label')!.textContent = 'SCREENSHOT NOT YET AVAILABLE';
    figure.querySelector('img')!.alt = `Placeholder: add screenshots/${key}.png to display the real game capture.`;
  });
}
if (!captures['in-game'] || !captures['main-menu']) {
  document.querySelectorAll('.field-copy p').forEach(paragraph => {
    if (paragraph.textContent?.startsWith('These are real captures')) paragraph.textContent = 'Some captures are not available in this checkout. Labeled panels show where the real game screenshots will appear.';
  });
  dialog.querySelector('p')!.textContent = 'Real captures appear when available; missing screenshots are labeled. Press Escape to close.';
}
