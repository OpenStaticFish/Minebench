// The site is complete HTML without this module. Enhance only the two controls
// that need state: the narrow-screen navigation and the full-frame viewer.
const events = new AbortController();
const listen = { signal: events.signal };

function setUpNav() {
  const toggle = document.querySelector<HTMLButtonElement>('#nav-toggle');
  const nav = document.querySelector<HTMLElement>('#site-nav');
  if (!toggle || !nav) return;
  document.documentElement.classList.add('js-nav');
  toggle.hidden = false;
  const setOpen = (open: boolean) => {
    nav.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('nav-open')), listen);
  nav.addEventListener('click', () => setOpen(false), listen);
  matchMedia('(min-width: 761px)').addEventListener('change', () => setOpen(false), listen);
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && nav.classList.contains('nav-open')) {
        setOpen(false);
        toggle.focus();
      }
    },
    listen,
  );
}

function setUpViewer() {
  const dialog = document.querySelector<HTMLDialogElement>('#viewer');
  const links = [...document.querySelectorAll<HTMLAnchorElement>('a[data-lightbox]')];
  if (!dialog || typeof dialog.showModal !== 'function' || !links.length) return;
  const title = dialog.querySelector<HTMLElement>('#viewer-title')!;
  const image = dialog.querySelector<HTMLImageElement>('#viewer-image')!;
  const count = dialog.querySelector<HTMLElement>('#frame-count')!;
  const prev = dialog.querySelector<HTMLButtonElement>('#prev-frame')!;
  const next = dialog.querySelector<HTMLButtonElement>('#next-frame')!;
  let index = 0;
  let opener: HTMLAnchorElement | undefined;
  const show = (i: number) => {
    index = (i + links.length) % links.length;
    const link = links[index]!;
    image.alt = link.querySelector('img')?.alt ?? 'Game capture from Bracken Vale';
    image.src = link.href;
    title.textContent = link.closest('figure')?.querySelector('h3')?.textContent ?? 'Field capture';
    count.textContent = `FIELD CAPTURE ${String(index + 1).padStart(2, '0')} / ${String(links.length).padStart(2, '0')}`;
  };
  prev.hidden = next.hidden = links.length < 2;
  count.setAttribute('aria-live', 'polite');
  const bindOpener = (link: HTMLAnchorElement, i: number) =>
    link.addEventListener(
      'click',
      (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        opener = link;
        show(i);
        dialog.showModal();
        dialog.querySelector<HTMLButtonElement>('#close-viewer')?.focus();
      },
      listen,
    );
  links.forEach(bindOpener);
  const hero = document.querySelector<HTMLAnchorElement>('#hero-expand');
  const worldIndex = links.findIndex((link) => link.dataset.lightbox === 'world');
  if (hero && worldIndex !== -1) bindOpener(hero, worldIndex);
  prev.addEventListener('click', () => show(index - 1), listen);
  next.addEventListener('click', () => show(index + 1), listen);
  dialog.querySelector('#close-viewer')?.addEventListener('click', () => dialog.close(), listen);
  dialog.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        show(index + (event.key === 'ArrowLeft' ? -1 : 1));
      }
    },
    listen,
  );
  dialog.addEventListener(
    'click',
    (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    },
    listen,
  );
  dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }), listen);
}

setUpNav();
setUpViewer();
if (import.meta.hot) import.meta.hot.dispose(() => events.abort());
