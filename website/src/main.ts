import "./style.css";

// Mobile nav toggle
const toggle = document.getElementById("nav-toggle");
const list = document.getElementById("nav-list");
toggle?.addEventListener("click", () => {
  const open = list?.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(!!open));
});

// Screenshot existence check — show tasteful placeholders if missing
function wireScreenshot(imgId: string, placeholderId: string) {
  const img = document.getElementById(imgId) as HTMLImageElement | null;
  const ph = document.getElementById(placeholderId);
  if (!img || !ph) return;
  // If image fails to load, show placeholder
  const showPh = () => {
    img.style.display = "none";
    ph.classList.remove("hidden");
  };
  const hidePh = () => {
    img.style.display = "";
    ph.classList.add("hidden");
  };
  img.addEventListener("error", showPh);
  img.addEventListener("load", () => {
    // Guard against 1x1 placeholder transparent gif that still loads but is tiny
    if (img.naturalWidth < 10) showPh();
    else hidePh();
  });
  // If src is 404, error will fire. Also check via fetch for cases where preview serves fallback HTML with 200.
  setTimeout(() => {
    if (!img.complete || img.naturalWidth === 0) {
      fetch(img.src, { method: "HEAD" }).then((r) => {
        const ct = r.headers.get("content-type") || "";
        if (!r.ok || !ct.startsWith("image/")) showPh();
      }).catch(() => showPh());
    }
  }, 800);
}

wireScreenshot("hero-screenshot", "hero-placeholder");
wireScreenshot("shot-ingame", "ph-ingame");
wireScreenshot("shot-menu", "ph-menu");

// Reduced motion: disable smooth scroll already via CSS, but also calm hero drift if we add it later
// No heavy JS — keep bundle tiny

// CTA: if game not running, hint
const cta = document.getElementById("cta-play") as HTMLAnchorElement | null;
cta?.addEventListener("click", () => {
  // Allow normal _blank open; no prevention
  console.log("Vox Crest — opening prototype at http://localhost:3000");
});

// Close nav on link click
list?.querySelectorAll("a").forEach((a) => {
  a.addEventListener("click", () => {
    list.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
  });
});

// Small observer for section head fade-in (respects reduced motion)
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!prefersReduced && "IntersectionObserver" in window) {
  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          (e.target as HTMLElement).style.opacity = "1";
          (e.target as HTMLElement).style.transform = "none";
          obs.unobserve(e.target);
        }
      }
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll<HTMLElement>(".f-card, .control-card, .stack-card, .shot").forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    el.style.transition = "opacity 0.5s ease, transform 0.5s ease";
    obs.observe(el);
  });
}
