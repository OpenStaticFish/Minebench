/**
 * Image encoding with the headless Chrome the automation scripts already use.
 *
 * Chrome's canvas encodes WebP with libwebp and resamples with high-quality
 * filtering, so screenshots can be optimised for the website without adding a
 * native image library to the project.
 */
import type { Browser, Page } from "playwright"
import { launchChrome } from "./browser"

export interface EncodedImage {
  data: Uint8Array
  width: number
  height: number
  bytes: number
}

export type ImageEncoderFormat = "image/webp" | "image/png"

const toBase64 = (bytes: Uint8Array): string => {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

export class ImageEncoder {
  private constructor(
    private readonly browser: Browser,
    private readonly page: Page,
  ) {}

  static async create(): Promise<ImageEncoder> {
    const browser = await launchChrome(320, 240)
    const page = await browser.newPage({ viewport: { width: 320, height: 240 } })
    await page.setContent("<!doctype html><title>loamlands encoder</title><canvas></canvas>")
    return new ImageEncoder(browser, page)
  }

  /** Re-encode an image (PNG/JPEG bytes) as `format`, scaled down to `width`. Never upscales. */
  async fromImage(
    source: Uint8Array,
    width: number,
    format: ImageEncoderFormat = "image/webp",
    quality = 0.82,
  ): Promise<EncodedImage> {
    const out = await this.page.evaluate(
      async ({ b64, width, format, quality }) => {
        const bitmap = await createImageBitmap(
          new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]),
        )
        try {
          const w = Math.min(width, bitmap.width)
          const h = Math.max(1, Math.round((bitmap.height * w) / bitmap.width))
          const canvas = document.querySelector("canvas") as HTMLCanvasElement
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext("2d")
          if (!ctx) throw new Error("no 2d context")
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = "high"
          ctx.drawImage(bitmap, 0, 0, w, h)
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, format, quality),
          )
          if (!blob) throw new Error(`encoding as ${format} failed`)
          const bytes = new Uint8Array(await blob.arrayBuffer())
          let out = ""
          for (let i = 0; i < bytes.length; i += 0x8000) {
            out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          }
          return { b64: btoa(out), width: w, height: h, bytes: bytes.length }
        } finally {
          bitmap.close()
        }
      },
      { b64: toBase64(source), width, format, quality },
    )
    return { data: fromBase64(out.b64), width: out.width, height: out.height, bytes: out.bytes }
  }

  /** Encode raw RGBA pixels (row-major) as PNG (lossless) or WebP. */
  async fromRgba(
    rgba: Uint8Array,
    width: number,
    height: number,
    format: ImageEncoderFormat = "image/png",
    quality = 0.95,
  ): Promise<EncodedImage> {
    const out = await this.page.evaluate(
      async ({ b64, width, height, format, quality }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const canvas = document.querySelector("canvas") as HTMLCanvasElement
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("no 2d context")
        ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes), width, height), 0, 0)
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, format, quality),
        )
        if (!blob) throw new Error(`${format} encoding failed`)
        const data = new Uint8Array(await blob.arrayBuffer())
        let s = ""
        for (let i = 0; i < data.length; i += 0x8000) {
          s += String.fromCharCode(...data.subarray(i, i + 0x8000))
        }
        return { b64: btoa(s), bytes: data.length }
      },
      { b64: toBase64(rgba), width, height, format, quality },
    )
    return { data: fromBase64(out.b64), width, height, bytes: out.bytes }
  }

  /**
   * Composite PNG frames (each placed at a vertical offset) on one width×height
   * canvas and encode it as PNG. Used to assemble full-page captures from
   * viewport-sized frames, which stays well below GPU texture size limits.
   */
  async compose(
    frames: ReadonlyArray<{ png: Uint8Array; y: number }>,
    width: number,
    height: number,
  ): Promise<EncodedImage> {
    const out = await this.page.evaluate(
      async ({ frames, width, height }) => {
        const canvas = document.querySelector("canvas") as HTMLCanvasElement
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("no 2d context")
        for (const frame of frames) {
          const bitmap = await createImageBitmap(
            new Blob([Uint8Array.from(atob(frame.b64), (c) => c.charCodeAt(0))]),
          )
          ctx.drawImage(bitmap, 0, frame.y)
          bitmap.close()
        }
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        )
        if (!blob) throw new Error("png encoding failed")
        const data = new Uint8Array(await blob.arrayBuffer())
        let s = ""
        for (let i = 0; i < data.length; i += 0x8000) {
          s += String.fromCharCode(...data.subarray(i, i + 0x8000))
        }
        return { b64: btoa(s), bytes: data.length }
      },
      { frames: frames.map((f) => ({ b64: toBase64(f.png), y: f.y })), width, height },
    )
    return { data: fromBase64(out.b64), width, height, bytes: out.bytes }
  }

  async close(): Promise<void> {
    await this.browser.close()
  }
}

/** Width/height from a PNG's IHDR chunk (bytes 16–23, big-endian). */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0) !== 0x89504e47) throw new Error("not a PNG")
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
