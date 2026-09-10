import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/600.css";
import "@fontsource/pixelify-sans/700.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "./styles.css";

/**
 * Progressive enhancements only. All content, navigation and screenshots work
 * without JavaScript; this file adds the sticky header state, the mobile menu,
 * the screenshot lightbox and dev-server play links.
 */

const header = document.querySelector<HTMLElement>("[data-header]");
const navToggle = document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
const nav = document.getElementById("site-nav");

function updateHeader(): void {
  header?.classList.toggle("is-scrolled", window.scrollY > 8);
}

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

if (navToggle && header && nav) {
  const closeNav = (): void => {
    header.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
  };

  navToggle.addEventListener("click", () => {
    const open = header.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(open));
  });

  nav.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("a")) closeNav();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && header.classList.contains("nav-open")) {
      closeNav();
      navToggle.focus();
    }
  });
}

// ---- Screenshot lightbox (falls back to plain links without <dialog>) -------

const dialog = document.querySelector<HTMLDialogElement>("#lightbox");
const dialogImage = dialog?.querySelector<HTMLImageElement>("[data-lightbox-image]");
const dialogCaption = dialog?.querySelector<HTMLElement>("[data-lightbox-caption]");
const dialogTitle = dialog?.querySelector<HTMLElement>("#lightbox-title");
let lastTrigger: HTMLAnchorElement | null = null;

if (dialog && dialogImage && typeof dialog.showModal === "function") {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-lightbox]")) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const figure = link.closest("figure");
      const title = figure?.querySelector(".shot-caption strong")?.textContent ?? "Screenshot";
      const caption = figure?.querySelector(".shot-caption span")?.textContent ?? "";
      const image = link.querySelector("img");

      dialogImage.src = link.href;
      dialogImage.alt = image?.alt ?? title;
      if (dialogTitle) dialogTitle.textContent = title;
      if (dialogCaption) dialogCaption.textContent = caption;
      lastTrigger = link;
      dialog.showModal();
    });
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    dialogImage.src = "";
    lastTrigger?.focus();
    lastTrigger = null;
  });

  document
    .querySelector("[data-lightbox-close]")
    ?.addEventListener("click", () => dialog.close());
}

// ---- Play links -------------------------------------------------------------

// Production assumes the game is served at /play/. Override with
// VITE_PLAY_URL, and point at the game dev server automatically in `vite dev`.
const configuredPlayUrl = import.meta.env.VITE_PLAY_URL as string | undefined;
const playUrl = configuredPlayUrl ?? (import.meta.env.DEV ? "http://localhost:5173/" : null);

if (playUrl) {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-play-link]")) {
    link.href = playUrl;
    if (configuredPlayUrl || import.meta.env.DEV) {
      link.target = "_blank";
      link.rel = "noopener";
    }
  }
}
