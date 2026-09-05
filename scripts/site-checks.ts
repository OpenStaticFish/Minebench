import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

const missing = process.env.WILDMERE_TEST_MISSING === "1";
const preview = process.env.WILDMERE_PREVIEW === "1";
const browser = await chromium.launch();
const server = Bun.spawn(
  ["bun", "run", preview ? "preview" : "dev", "--port", "4176", "--strictPort"],
  {
    stdout: "ignore",
    stderr: "pipe",
    env: {
      ...process.env,
      ...(missing ? { WILDMERE_SCREENSHOTS_DIR: "/dev/null" } : {}),
    },
  },
);
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error(await new Response(server.stderr).text());
    try {
      if ((await fetch("http://localhost:4176")).ok) break;
    } catch {
      /* Vite is starting. */
    }
    await Bun.sleep(100);
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("http://localhost:4176", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("h1")).toContainText("A little world.");
  for (const id of [
    "world",
    "field-notes",
    "controls",
    "under-the-canopy",
    "status",
  ])
    await expect(page.locator(`#${id}`)).toBeAttached();
  if (missing) {
    await expect(page.locator(".missing-shot")).toHaveCount(3);
    await expect(page.locator(".hero-figure figcaption")).toContainText(
      "SCREENSHOT NOT YET AVAILABLE",
    );
    expect(await page.locator("[data-lightbox]").count()).toBe(0);
  } else {
    await page.locator("#field-notes").scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll<HTMLImageElement>(".screenshot-link img"),
      ].every((image) => image.complete && image.naturalWidth > 0),
    );
    await expect(page.locator("[data-lightbox]")).toHaveCount(3);
    await page.locator('[data-lightbox="main-menu"]').click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("#viewer-image")).toHaveAttribute(
      "alt",
      /main menu/,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator('[data-lightbox="main-menu"]')).toBeFocused();
  }
  await page.getByRole("button", { name: "Timber", exact: true }).click();
  await expect(page.locator("#material-description")).toContainText(
    "wooden planks",
  );
  await expect(
    page.getByRole("button", { name: "Timber", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const accordion = page.locator(".technical-details details").nth(1);
  await accordion.locator("summary").click();
  await expect(accordion).toHaveAttribute("open", "");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  if (accessibility.violations.length)
    console.log(
      JSON.stringify(
        accessibility.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            failure: n.failureSummary,
          })),
        })),
        null,
        2,
      ),
    );
  expect(accessibility.violations).toEqual([]);
  await mkdir("screenshots", { recursive: true });
  // Return the interactive examples to their default state before the visual capture.
  await page.getByRole("button", { name: "Meadow", exact: true }).click();
  await accordion.locator("summary").click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  if (!missing) {
    await page.screenshot({
      path: "screenshots/website-desktop.png",
      fullPage: true,
    });
    await page.screenshot({ path: "screenshots/website-hero.png" });
  }
  for (const width of [768, 375, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter(
          (element) => element.getBoundingClientRect().right > innerWidth + 1,
        )
        .map((element) => element.tagName + "." + element.className),
    );
    expect(overflow, `No horizontal overflow at ${width}px`).toEqual([]);
    if (width === 375) {
      await page.locator(".mobile-nav summary").click();
      await page
        .getByRole("navigation", { name: "Mobile navigation" })
        .getByRole("link", { name: "How to play" })
        .click();
      await expect(page.locator(".mobile-nav")).not.toHaveAttribute("open", "");
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      if (!missing) {
        await page.screenshot({
          path: "screenshots/website-mobile.png",
          fullPage: true,
        });
        await page.screenshot({ path: "screenshots/website-mobile-hero.png" });
      }
    }
  }
  expect(
    requests.some((url) => /three|\/src\/main\.ts|\/assets\/game-/.test(url)),
  ).toBe(false);
  const gameLink = page.getByRole("link", {
    name: "Play Wildmere",
    exact: true,
  });
  expect(
    new URL((await gameLink.getAttribute("href")) ?? "", page.url()).pathname,
  ).toBe("/play/");
  expect(errors).toEqual([]);
  const noJS = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  const staticPage = await noJS.newPage();
  await staticPage.goto("http://localhost:4176");
  await expect(staticPage.locator("h1")).toBeVisible();
  await expect(
    staticPage.getByRole("link", { name: "Play Wildmere", exact: true }),
  ).toHaveAttribute("href", "./play/");
  if (!missing)
    expect(
      await staticPage
        .locator(".hero-image img")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    ).toBe(true);
  await noJS.close();
  console.log(
    `PASS (${preview ? "production preview" : "development"}): ${missing ? "labelled missing-image fallbacks" : "real images and gallery dialog/focus"}, semantic sections, keyboard skip link, materials, disclosures, mobile navigation, 320/375/768/1440px layouts, no-JS content, no game code on site, no browser errors.`,
  );
  console.log(
    `Axe WCAG 2 A/AA + 2.1 AA checks: no detected violations on desktop and mobile${missing ? "." : ", including the open screenshot dialog."}`,
  );
  if (!missing)
    console.log("Website screenshots saved in screenshots/website-*.png");
} finally {
  await browser.close();
  server.kill();
}
