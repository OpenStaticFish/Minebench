import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import type { ScreenshotAsset, ScreenshotManifest } from "./scripts/screenshot-meta";

/**
 * Small build-time HTML plugin:
 *   1. Inlines `<!--@include partial.html-->` section partials so the page is
 *      authored as small files but ships as one static HTML document.
 *   2. Replaces `<!--@screenshot:key ...-->` markers with responsive <img>
 *      markup generated from the prepared screenshot manifest, or with a
 *      clearly labelled placeholder when a capture is missing.
 *
 * No runtime framework, no client-side image loading, no layout shift.
 */

const siteDir = import.meta.dirname;
const sectionsDir = resolve(siteDir, "sections");
const manifestPath = resolve(siteDir, ".generated/screenshots.json");

function readManifest(): ScreenshotManifest {
  if (!existsSync(manifestPath)) return {};
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")) as ScreenshotManifest;
  } catch {
    return {};
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface MarkerAttrs {
  mode: "figure" | "background";
  eager: boolean;
  sizes: string;
  className: string;
}

function parseAttrs(raw: string): MarkerAttrs {
  const sizes = /sizes="([^"]*)"/.exec(raw);
  const className = /class="([^"]*)"/.exec(raw);
  return {
    mode: /\bbg\b/.test(raw) ? "background" : "figure",
    eager: /\beager\b/.test(raw),
    sizes: sizes?.[1] ?? "100vw",
    className: className?.[1] ?? "",
  };
}

function buildSrcset(asset: ScreenshotAsset): string {
  return asset.variants.map((variant) => `${variant.src} ${variant.width}w`).join(", ");
}

function buildImage(asset: ScreenshotAsset, attrs: MarkerAttrs, className: string): string {
  const fallback =
    asset.variants[Math.min(1, asset.variants.length - 1)]?.src ?? asset.full;
  const loading = attrs.eager
    ? 'loading="eager" fetchpriority="high"'
    : 'loading="lazy" decoding="async"';
  const alt = attrs.mode === "background" ? "" : escapeHtml(asset.alt);
  return [
    `<img src="${fallback}"`,
    `srcset="${buildSrcset(asset)}"`,
    `sizes="${attrs.sizes}"`,
    `width="${asset.width}" height="${asset.height}"`,
    `${loading} alt="${alt}"`,
    `class="${className}">`,
  ].join(" ");
}

function renderPlaceholder(asset: ScreenshotAsset, attrs: MarkerAttrs): string {
  const key = escapeHtml(asset.key);
  return `
<figure class="shot shot--placeholder ${attrs.className}" id="shot-${key}">
  <div class="shot-placeholder">
    <div class="shot-placeholder-grid" aria-hidden="true"></div>
    <p class="shot-placeholder-title">${escapeHtml(asset.title)} — capture missing</p>
    <p class="shot-placeholder-text">
      Run <code>bun run shots</code> in the game project to produce
      <code>screenshots/${key}.png</code>, then rebuild this site. This labelled
      placeholder appears instead of a fake screenshot.
    </p>
  </div>
  <figcaption class="shot-caption"><strong>${escapeHtml(asset.title)}</strong><span>Awaiting capture</span></figcaption>
</figure>`;
}

function renderScreenshot(
  key: string,
  attrs: MarkerAttrs,
  manifest: ScreenshotManifest,
): string {
  const asset = manifest[key];
  if (!asset || !asset.available) {
    const fallback: ScreenshotAsset = asset ?? {
      key,
      available: false,
      title: key,
      alt: "",
      caption: "",
      width: 0,
      height: 0,
      lqip: "",
      variants: [],
      full: "",
    };
    return renderPlaceholder(fallback, attrs);
  }

  if (attrs.mode === "background") {
    return `<div class="shot-bg ${attrs.className}" aria-hidden="true">${buildImage(asset, attrs, "shot-bg-image")}</div>`;
  }

  return `
<figure class="shot ${attrs.className}" id="shot-${escapeHtml(key)}">
  <a class="shot-link" href="${asset.full}" data-lightbox="${escapeHtml(key)}">
    ${buildImage(asset, attrs, "shot-image")}
    <span class="shot-open" aria-hidden="true">View full size</span>
  </a>
  <figcaption class="shot-caption">
    <strong>${escapeHtml(asset.title)}</strong>
    <span>${escapeHtml(asset.caption)}</span>
  </figcaption>
</figure>`;
}

function htmlSections(): Plugin {
  return {
    name: "cubewild:html-sections",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const manifest = readManifest();
        let output = html;
        for (let pass = 0; pass < 4; pass++) {
          output = output.replace(
            /<!--\s*@include\s+([\w./-]+)\s*-->/g,
            (_match, file: string) => {
              const partial = resolve(sectionsDir, file);
              if (!existsSync(partial)) return `<!-- missing partial: ${file} -->`;
              return readFileSync(partial, "utf8");
            },
          );
        }
        output = output.replace(
          /<!--\s*@screenshot:([\w-]+)((?:\s+\w+(?:="[^"]*")?)*)\s*-->/g,
          (_match, key: string, rawAttrs: string) =>
            renderScreenshot(key, parseAttrs(rawAttrs), manifest),
        );
        return output;
      },
    },
  };
}

export default defineConfig({
  base: "/",
  server: {
    host: true,
    port: 5174,
  },
  preview: {
    port: 4174,
  },
  build: {
    target: "es2022",
    sourcemap: false,
    cssMinify: true,
    assetsInlineLimit: 2048,
  },
  plugins: [htmlSections()],
});
