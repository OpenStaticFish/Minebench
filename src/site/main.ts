const materials: Record<string, string> = {
  Meadow: "A grassy top for a patch of green, wherever you need one.",
  Earth:
    "The warm brown layer beneath the meadow. Start with a solid foundation.",
  Limestone: "A little piece of the mountain, ready for a wall or a lookout.",
  Sand: "Bring a bit of the shoreline to your next quiet corner.",
  Cedar: "A textured trunk block for something rooted in the woods.",
  Canopy: "Leafy green blocks for a sheltered path or a garden overhead.",
  Timber: "Warm wooden planks. A floor, a bridge, or the start of a cabin.",
  Snow: "A pale finishing touch, borrowed from the highest summits.",
};
document
  .querySelectorAll<HTMLButtonElement>("[data-material]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.material!;
      const description = document.querySelector<HTMLParagraphElement>(
        "#material-description",
      )!;
      const label = document.createElement("strong");
      label.textContent = `${name}. `;
      description.replaceChildren(
        label,
        document.createTextNode(materials[name]!),
      );
      document
        .querySelectorAll("[data-material]")
        .forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
    });
  });

const viewer = document.querySelector<HTMLDialogElement>("#image-viewer")!;
const viewerImage = document.querySelector<HTMLImageElement>("#viewer-image")!;
document
  .querySelectorAll<HTMLAnchorElement>("[data-lightbox]")
  .forEach((link) => {
    link.addEventListener("click", (event) => {
      // Keep ordinary image links useful without JavaScript or in a new tab.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      const image = link.querySelector<HTMLImageElement>("img")!;
      viewerImage.src = link.href;
      viewerImage.alt = image.alt;
      document.querySelector("#viewer-caption")!.textContent = image.alt;
      document.querySelector("#viewer-title")!.textContent =
        link.dataset.lightbox === "in-game"
          ? "Stillwater, from the shoreline"
          : "The wilderness is ready";
      viewer.showModal();
      document.body.classList.add("viewer-open");
    });
  });
document
  .querySelector("#close-viewer")!
  .addEventListener("click", () => viewer.close());
viewer.addEventListener("close", () =>
  document.body.classList.remove("viewer-open"),
);
viewer.addEventListener("click", (event) => {
  const bounds = viewer.getBoundingClientRect();
  if (
    event.target === viewer &&
    (event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom)
  )
    viewer.close();
});

const mobileMenu = document.querySelector<HTMLDetailsElement>(".mobile-nav")!;
mobileMenu.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => {
    mobileMenu.open = false;
  }),
);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileMenu.open) {
    mobileMenu.open = false;
    mobileMenu.querySelector("summary")!.focus();
  }
});
