import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  emptyManifest,
  expandMediaTokens,
  loadMediaManifest,
  type MediaManifest,
  type MediaShot,
  renderShot,
} from "../website/media"

const shot: MediaShot = {
  width: 1600,
  height: 900,
  variants: [
    { width: 640, file: "in-game-640.webp" },
    { width: 1280, file: "in-game-1280.webp" },
    { width: 1600, file: "in-game-1600.webp" },
  ],
}

describe("website media", () => {
  test("a present screenshot renders a responsive image with intrinsic size and escaped alt text", () => {
    const html = renderShot(shot, {
      name: "in-game",
      alt: 'A lake & "peaks" <really>',
      sizes: "100vw",
    })
    expect(html).toContain('src="./media/in-game-1280.webp"')
    expect(html).toContain(
      'srcset="./media/in-game-640.webp 640w, ./media/in-game-1280.webp 1280w, ./media/in-game-1600.webp 1600w"',
    )
    expect(html).toContain('width="1600" height="900"')
    expect(html).toContain('alt="A lake &amp; &quot;peaks&quot; &lt;really&gt;"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
    expect(html).not.toContain("fetchpriority")
  })

  test("priority shots load eagerly with a high fetch priority", () => {
    const html = renderShot(shot, { name: "in-game", alt: "x", sizes: "100vw", priority: true })
    expect(html).toContain('loading="eager"')
    expect(html).toContain('fetchpriority="high"')
  })

  test("a missing screenshot renders a labelled placeholder with instructions", () => {
    for (const html of [
      renderShot(undefined, { name: "flight", alt: "Flying over a lake", sizes: "100vw" }),
      renderShot(
        { width: 1, height: 1, variants: [] },
        { name: "flight", alt: "Flying over a lake", sizes: "100vw" },
      ),
    ]) {
      expect(html).toContain('role="img"')
      expect(html).toContain("Placeholder")
      expect(html).toContain("Flying over a lake")
      expect(html).toContain("<code>screenshots/flight.png</code>")
      expect(html).toContain("<code>bun run images</code>")
      expect(html).not.toContain("<img")
    }
  })

  test("tokens in the page HTML expand to images, icons or placeholders", () => {
    const manifest: MediaManifest = {
      generated: "2026-01-01T00:00:00.000Z",
      shots: { "in-game": shot },
      icons: ["grass"],
    }
    const html = expandMediaTokens(
      '<figure><!--shot name="in-game" alt="Lake" sizes="50vw" fetch="high"--></figure>' +
        '<figure><!--shot name="nope" alt="Missing" sizes="50vw"--></figure>' +
        '<li><!--icon name="grass" class="card__img"--><!--icon name="absent"--><!--icon name="../evil"--></li>',
      manifest,
    )
    expect(html).toContain('sizes="50vw"')
    expect(html).toContain('fetchpriority="high"')
    expect(html).toContain('class="shot__missing"')
    expect(html).toContain('class="icon card__img" src="./media/icon-grass.webp"')
    expect(html).toContain('alt="" loading="lazy"')
    expect(html).not.toContain("icon-absent")
    expect(html).not.toContain("evil")
    expect(html).not.toContain("<!--shot")
    expect(html).not.toContain("<!--icon")
  })

  test("social preview tags need both the shot and an absolute site URL", () => {
    const manifest: MediaManifest = { generated: "", shots: { "in-game": shot }, icons: [] }
    const token = '<head><!--social-image name="in-game"--></head>'
    const absolute = expandMediaTokens(token, manifest, { siteUrl: "https://loamlands.example/" })
    expect(absolute).toContain(
      '<meta property="og:image" content="https://loamlands.example/media/in-game-1280.webp">',
    )
    expect(absolute).toContain('<meta property="og:image:width" content="1280">')
    expect(absolute).toContain('<meta property="og:image:height" content="720">')
    expect(absolute).toContain('<meta name="twitter:card" content="summary_large_image">')
    // No URL configured, a relative URL, or no such shot → nothing is emitted.
    expect(expandMediaTokens(token, manifest, { siteUrl: "" })).toBe("<head></head>")
    expect(expandMediaTokens(token, manifest, { siteUrl: "localhost:4173" })).toBe("<head></head>")
    expect(
      expandMediaTokens('<head><!--social-image name="absent"--></head>', manifest, {
        siteUrl: "https://loamlands.example",
      }),
    ).toBe("<head></head>")
  })

  test("tokens without a name, or shots without alt text, fail loudly", () => {
    expect(() => expandMediaTokens('<!--shot alt="x"-->', emptyManifest())).toThrow(
      /missing a name/,
    )
    expect(() => expandMediaTokens('<!--shot name="in-game"-->', emptyManifest())).toThrow(
      /missing alt/,
    )
    expect(() => expandMediaTokens("<!--icon-->", emptyManifest())).toThrow(/missing a name/)
  })

  test("a missing or corrupt manifest yields placeholders instead of a broken build", () => {
    const dir = mkdtempSync(join(tmpdir(), "loamlands-media-"))
    try {
      expect(loadMediaManifest(join(dir, "nope.json"))).toEqual(emptyManifest())
      const corrupt = join(dir, "corrupt.json")
      writeFileSync(corrupt, "{ not json")
      expect(loadMediaManifest(corrupt)).toEqual(emptyManifest())
      const partial = join(dir, "partial.json")
      writeFileSync(
        partial,
        JSON.stringify({ shots: { ok: shot, bad: { width: "x" } }, icons: ["grass", 7] }),
      )
      const m = loadMediaManifest(partial)
      expect(Object.keys(m.shots)).toEqual(["ok"])
      expect(m.icons).toEqual(["grass"])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("the committed manifest only lists files that exist in public/media", () => {
    const manifest = loadMediaManifest()
    for (const shot of Object.values(manifest.shots)) {
      for (const v of shot.variants)
        expect(readFileSync(join("public/media", v.file)).byteLength).toBeGreaterThan(0)
    }
    for (const icon of manifest.icons) {
      expect(readFileSync(join("public/media", `icon-${icon}.webp`)).byteLength).toBeGreaterThan(0)
    }
  })
})
