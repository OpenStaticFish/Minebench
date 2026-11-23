/**
 * Visual + accessibility check of the landing page in headless Chrome.
 *
 *   bun run site:check
 *
 * Builds and serves `dist/` (or reuses LOAMLANDS_URL), then verifies:
 *   - no console errors, page errors or failed requests
 *   - document structure: one h1, header/nav/main/footer landmarks, no skipped heading levels
 *   - every in-page link resolves; /play/ serves the game
 *   - every <img> has alt text and decodes (missing screenshots show up as reported placeholders)
 *   - no horizontal overflow at phone, tablet and desktop widths
 *   - keyboard: the first Tab stop is the skip link, and it becomes visible
 *   - prefers-reduced-motion stops the cloud animation
 *   - axe-core (WCAG 2.0/2.1 A + AA) reports no serious or critical violations
 *
 * Captures (all real renders of the built page):
 *   screenshots/site-desktop.png        the hero at 1440×900
 *   screenshots/site-desktop-<n>.png    the full page in ≤4000 px pages
 *   screenshots/site-mobile.png, site-mobile-<n>.png   the same at 390 px wide
 *
 * Full-page images are stitched from viewport-sized frames on a canvas, because a
 * single very tall capture exceeds the texture limit of some GPUs and corrupts.
 */
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Page } from "playwright"
import { launchChrome, startServer } from "./lib/browser"
import { ImageEncoder } from "./lib/imaging"

interface Violation {
  id: string
  impact: string | null
  help: string
  targets: string[][]
}

interface Frame {
  png: Uint8Array
  y: number
  h: number
}

const FRAME_HEIGHT = 1000
const PAGE_HEIGHT = 4000

const failures: string[] = []
const check = (ok: boolean, message: string) => {
  console.log(`${ok ? "✓" : "✗"} ${message}`)
  if (!ok) failures.push(message)
}

/** Wait until every image inside the viewport has finished loading. */
const waitForVisibleImages = (page: Page) =>
  page.waitForFunction(
    () =>
      [...document.images]
        .filter((i) => {
          const r = i.getBoundingClientRect()
          return r.bottom > 0 && r.top < window.innerHeight
        })
        .every((i) => i.complete),
    undefined,
    { timeout: 15_000 },
  )

/**
 * Capture the whole page as stitched pages: scroll in viewport-sized frames
 * (with the sticky header pinned to the top of the document, not every frame),
 * then composite them into ≤ PAGE_HEIGHT tall images.
 */
async function capture_pages(
  page: Page,
  encoder: ImageEncoder,
  prefix: string,
  width: number,
): Promise<string[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.setViewportSize({ width, height: FRAME_HEIGHT })
  await page.addStyleTag({
    content: "html{scroll-behavior:auto!important} .site-header{position:static!important}",
  })
  const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight)

  const frames: Frame[] = []
  for (let y = 0; ; y += FRAME_HEIGHT) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await waitForVisibleImages(page)
    await page.waitForTimeout(150)
    const top = await page.evaluate(() => window.scrollY)
    const height = Math.min(FRAME_HEIGHT, documentHeight - top)
    frames.push({
      png: await page.screenshot({ clip: { x: 0, y: 0, width, height } }),
      y: top,
      h: height,
    })
    if (top + height >= documentHeight) break
  }

  const written: string[] = []
  for (let start = 0, n = 1; start < documentHeight; start += PAGE_HEIGHT, n++) {
    const height = Math.min(PAGE_HEIGHT, documentHeight - start)
    const inPage = frames.filter((f) => f.y < start + height && f.y + f.h > start)
    const image = await encoder.compose(
      inPage.map((f) => ({ png: f.png, y: f.y - start })),
      width,
      height,
    )
    const path = `screenshots/${prefix}-${n}.png`
    await Bun.write(path, image.data)
    written.push(path)
  }
  return written
}

const server = await startServer(4175)
const browser = await launchChrome(1440, 900)
const encoder = await ImageEncoder.create()
mkdirSync("screenshots", { recursive: true })

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`)
  })
  page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`))
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`)
  })

  await page.goto(server.url, { waitUntil: "networkidle" })
  await page.screenshot({ path: "screenshots/site-desktop.png" })
  console.log("✓ screenshots/site-desktop.png")

  // ── structure ──
  const structure = await page.evaluate(() => {
    const levels = [...document.querySelectorAll("h1, h2, h3, h4")].map((h) => Number(h.tagName[1]))
    let skipped = false
    for (let i = 1; i < levels.length; i++) if (levels[i]! > levels[i - 1]! + 1) skipped = true
    return {
      h1: document.querySelectorAll("h1").length,
      landmarks: ["header", "nav", "main", "footer"].filter((l) => !document.querySelector(l)),
      skipped,
      title: document.title,
      lang: document.documentElement.lang,
      sections: ["about", "screens", "features", "controls", "tech", "status", "play"].filter(
        (id) => !document.getElementById(id),
      ),
    }
  })
  check(structure.h1 === 1, "exactly one h1")
  check(structure.landmarks.length === 0, "header, nav, main and footer landmarks present")
  check(!structure.skipped, "heading levels do not skip")
  check(
    structure.sections.length === 0,
    "all content sections exist (about, screens, features, controls, tech, status, play)",
  )
  check(
    structure.lang === "en" && structure.title.length > 0,
    "document has a language and a title",
  )

  // ── links ──
  const brokenAnchors = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')]
      .map((a) => a.getAttribute("href")!.slice(1))
      .filter((id) => id && !document.getElementById(id)),
  )
  check(
    brokenAnchors.length === 0,
    `in-page links resolve${brokenAnchors.length ? ` (missing: ${brokenAnchors.join(", ")})` : ""}`,
  )
  const play = await page.request.get(new URL("play/", server.url).href)
  check(play.ok() && (await play.text()).includes('id="game"'), "/play/ serves the game")

  // ── keyboard ──
  await page.keyboard.press("Tab")
  const firstStop = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return {
      className: el?.className ?? "",
      visible: el ? getComputedStyle(el).transform === "none" : false,
      text: el?.textContent?.trim() ?? "",
    }
  })
  check(
    firstStop.className === "skip" && firstStop.visible,
    `first Tab stop is the visible skip link ("${firstStop.text}")`,
  )

  // ── reduced motion ──
  await page.emulateMedia({ reducedMotion: "reduce" })
  const animates = await page.evaluate(() =>
    [...document.querySelectorAll<SVGElement | HTMLElement>(".cloud")].some(
      (el) => getComputedStyle(el).animationName !== "none",
    ),
  )
  await page.emulateMedia({ reducedMotion: "no-preference" })
  check(!animates, "prefers-reduced-motion stops the cloud animation")

  // ── images (after walking the page, every lazy image has loaded) ──
  const desktopPages = await capture_pages(page, encoder, "site-desktop", 1440)
  for (const path of desktopPages) console.log(`✓ ${path}`)
  const images = await page.evaluate(() => ({
    total: document.images.length,
    withoutAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).length,
    broken: [...document.images]
      .filter((i) => i.naturalWidth === 0)
      .map((i) => i.currentSrc.split("/").pop()),
    placeholders: document.querySelectorAll(".shot__missing").length,
    described: [...document.images].filter((i) => i.alt.length > 0).length,
  }))
  check(images.withoutAlt === 0, `every <img> has an alt attribute (${images.total} images)`)
  check(
    images.broken.length === 0,
    `every image decodes${images.broken.length ? ` (broken: ${images.broken.join(", ")})` : ""}`,
  )
  console.log(
    `  ${images.described} described screenshots, ${images.placeholders} labelled placeholder(s), ` +
      `${images.total - images.described} decorative`,
  )

  // ── axe (WCAG A/AA) ──
  const axePath = fileURLToPath(import.meta.resolve("axe-core/axe.min.js"))
  await page.addScriptTag({ path: axePath })
  const violations = await page.evaluate(async (): Promise<Violation[]> => {
    const axe = (
      window as unknown as {
        axe: { run(ctx: Document, opts: unknown): Promise<{ violations: unknown[] }> }
      }
    ).axe
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    })
    return (
      result.violations as Array<{
        id: string
        impact: string | null
        help: string
        nodes: Array<{ target: string[] }>
      }>
    ).map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.map((n) => n.target),
    }))
  })
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical")
  for (const v of violations) {
    console.log(`  axe ${v.impact ?? "n/a"}: ${v.id} — ${v.help} (${v.targets.length} node(s))`)
    for (const t of v.targets.slice(0, 5)) console.log(`      ${t.join(" ")}`)
  }
  check(serious.length === 0, "axe: no serious or critical WCAG A/AA violations")

  // ── responsive overflow ──
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(150)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    check(overflow <= 0, `no horizontal overflow at ${width}px`)
  }

  // ── mobile ──
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(server.url, { waitUntil: "networkidle" })
  await page.screenshot({ path: "screenshots/site-mobile.png" })
  console.log("✓ screenshots/site-mobile.png")
  const mobilePages = await capture_pages(page, encoder, "site-mobile", 390)
  for (const path of mobilePages) console.log(`✓ ${path}`)

  check(
    errors.length === 0,
    `no console errors or failed requests${errors.length ? `: ${errors.join(" | ")}` : ""}`,
  )
} finally {
  await encoder.close()
  await browser.close()
  await server.close()
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log("\nAll site checks passed.")
