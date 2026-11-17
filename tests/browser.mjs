// Development-only: npm install --no-save --package-lock=false playwright
// Then: npx playwright install chromium && npm run test:browser
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const artifacts = join(root, "test-results");
await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "huntdeck-browser-"));
const errors = [];
const network = [];
let context;
async function launch() {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      "--no-sandbox",
    ],
    viewport: { width: 380, height: 600 },
    acceptDownloads: true,
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
  });
  context.on("request", (request) => {
    if (/^https?:/.test(request.url())) network.push(request.url());
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  return { worker, base: worker.url().replace(/background\.js$/, "") };
}
async function open(base) {
  const page = await context.newPage();
  await page.goto(`${base}popup.html`);
  await page.waitForFunction(
    () => document.getElementById("total").textContent !== "—",
  );
  return page;
}
async function value(page, id, expected) {
  await page.waitForFunction(
    ({ id, expected }) => document.getElementById(id).textContent === expected,
    { id, expected },
  );
}
async function ready(page) {
  await page.waitForFunction(
    () => !document.getElementById("apply-button").disabled,
  );
}
function contrast(a, b) {
  const linear = (color) =>
    color
      .match(/\d+/g)
      .slice(0, 3)
      .map(Number)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance = (color) =>
    linear(color).reduce(
      (sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i],
      0,
    );
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

try {
  let { worker, base } = await launch();
  let page = await open(base);
  await value(page, "total", "0");
  assert.equal(await page.locator("#undo-button").isDisabled(), true);
  assert.equal(await page.locator(".chart-day").count(), 7);
  assert.match(
    await page.locator("#activity").textContent(),
    /first application/,
  );
  const metrics = await page.evaluate(() => ({
    width: document.body.getBoundingClientRect().width,
    scrollWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    height: document.documentElement.scrollHeight,
    contentHeight: document.body.scrollHeight,
    background: getComputedStyle(document.body).backgroundColor,
    muted: getComputedStyle(document.querySelector(".muted")).color,
    buttonText: getComputedStyle(document.getElementById("apply-button")).color,
    buttonBackground: getComputedStyle(document.getElementById("apply-button"))
      .backgroundColor,
  }));
  assert.equal(metrics.width, 380);
  assert.ok(metrics.scrollWidth <= metrics.viewport);
  assert.ok(contrast(metrics.muted, metrics.background) >= 4.5);
  assert.ok(contrast(metrics.buttonText, metrics.buttonBackground) >= 4.5);
  console.log("Layout and contrast:", metrics);
  await page.screenshot({
    path: join(artifacts, "dashboard-empty.png"),
    fullPage: true,
  });

  // Real extension storage writes are delayed to inspect optimistic UI before save.
  await worker.evaluate(() => {
    globalThis.originalSet = chrome.storage.local.set.bind(
      chrome.storage.local,
    );
    chrome.storage.local.set = async (value) => {
      await new Promise((r) => setTimeout(r, 600));
      return globalThis.originalSet(value);
    };
  });
  await page.evaluate(() => {
    for (let i = 0; i < 12; i++)
      document.getElementById("apply-button").click();
  });
  assert.equal(await page.locator("#total").textContent(), "1");
  assert.equal(await page.locator("#apply-button").isDisabled(), true);
  assert.doesNotMatch(await page.locator("#message").textContent(), /saved/);
  await value(page, "message", "Application saved. Keep going!");
  await ready(page);
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("applications")))
      .applications.length,
    1,
  );
  await worker.evaluate(() => {
    chrome.storage.local.set = globalThis.originalSet;
  });

  // Failed storage write rolls back optimistically updated UI and can be retried.
  await worker.evaluate(() => {
    chrome.storage.local.set = async () => {
      throw new Error("Simulated quota failure");
    };
  });
  await page.locator("#apply-button").click();
  await page.waitForFunction(() =>
    document.getElementById("message").textContent.includes("not saved"),
  );
  await ready(page);
  await value(page, "total", "1");
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("applications")))
      .applications.length,
    1,
  );
  await worker.evaluate(() => {
    chrome.storage.local.set = globalThis.originalSet;
  });
  await page.locator("#apply-button").click();
  await ready(page);
  await value(page, "total", "2");
  await page.locator("#undo-button").click();
  await ready(page);
  await value(page, "total", "1");
  await value(page, "today", "1");

  // Settings, validation, explicit cancellation, and accessible keyboard focus.
  await page.locator("#settings-button").click();
  assert.equal(await page.locator("#settings").isVisible(), true);
  await page.locator("#daily-goal").fill("0");
  await page.locator("#save-goal").click();
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("dailyGoal")))
      .dailyGoal,
    10,
  );
  await page.locator("#daily-goal").fill("3");
  await page.locator("#save-goal").click();
  await value(page, "message", "Daily goal saved.");
  await page.locator("#reset-button").click();
  assert.equal(await page.locator("#reset-confirm").isVisible(), true);
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "cancel-reset",
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#reset-confirm").isHidden(), true);
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("applications")))
      .applications.length,
    1,
  );
  await page.locator("#reset-button").click();
  await page.locator("#cancel-reset").click();
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("applications")))
      .applications.length,
    1,
  );
  await page.locator("#back-button").focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "daily-goal",
  );
  const focus = await page
    .locator("#daily-goal")
    .evaluate((el) => ({
      style: getComputedStyle(el).outlineStyle,
      width: getComputedStyle(el).outlineWidth,
    }));
  assert.deepEqual(focus, { style: "solid", width: "2px" });
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await downloadEvent;
  assert.match(
    download.suggestedFilename(),
    /^huntdeck-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const downloaded = await readFile(await download.path(), "utf8");
  assert.match(downloaded, /application_id/);
  assert.equal(downloaded.split("\r\n").length, 3);
  await page.screenshot({
    path: join(artifacts, "settings.png"),
    fullPage: true,
  });
  await page.locator("#back-button").click();
  await value(page, "goal-label", "1 / 3");

  // Storage changes reach multiple open views; complete history stays in storage.
  const second = await open(base);
  await second.locator("#apply-button").click();
  await ready(second);
  await value(page, "total", "2");
  await second.close();
  await page.close();
  page = await open(base);
  await value(page, "total", "2");
  await value(page, "goal-label", "2 / 3");
  await context.close();
  ({ worker, base } = await launch());
  page = await open(base);
  await value(page, "total", "2");
  await value(page, "goal-label", "2 / 3");
  console.log("Persistence after popup reopen and browser restart: passed");

  // Recent active dates, chart, recording date preservation, and timezone-safe stats.
  await worker.evaluate(async () => {
    const entries = [];
    for (const days of [0, 1, 2, 4, 10])
      for (let n = 0; n < (days === 0 ? 4 : 1); n++) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        date.setHours(12, n * 5, 0, 0);
        entries.push({
          id: crypto.randomUUID(),
          timestamp: date.getTime(),
          date: "2026-01-01",
        });
      }
    await chrome.storage.local.set({ applications: entries });
  });
  await value(page, "total", "8");
  await value(page, "today", "4");
  assert.equal(await page.locator(".activity-row").count(), 3);
  assert.equal(
    (await page.locator(".activity-times").first().textContent()).split(" · ")
      .length,
    3,
  );
  assert.match(
    await page.locator("#goal-message").textContent(),
    /Goal reached/,
  );
  await page.screenshot({
    path: join(artifacts, "dashboard-active.png"),
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator("#apply-button")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );

  // Recoverable data, blocked corrupt data, and explicit reset recovery.
  await worker.evaluate(() =>
    chrome.storage.local.set({ applications: [{ timestamp: Date.now() }] }),
  );
  await value(page, "total", "1");
  assert.match(
    await page.locator("#data-warning").textContent(),
    /recoverable/,
  );
  await ready(page);
  await page.locator("#apply-button").click();
  await ready(page);
  assert.equal(await page.locator("#data-warning").isHidden(), true);
  await worker.evaluate(() =>
    chrome.storage.local.set({ applications: "corrupted" }),
  );
  await page.waitForFunction(() =>
    document.getElementById("data-warning").textContent.includes("unreadable"),
  );
  assert.equal(await page.locator("#apply-button").isDisabled(), true);
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("applications")))
      .applications,
    "corrupted",
  );
  await page.locator("#settings-button").click();
  await page.locator("#reset-button").click();
  await page.locator("#confirm-reset").click();
  await value(
    page,
    "message",
    "Application history reset. Your daily goal is unchanged.",
  );
  await page.locator("#back-button").click();
  await value(page, "total", "0");
  await value(page, "goal-label", "0 / 3");
  assert.equal(await page.locator("#undo-button").isDisabled(), true);
  assert.equal(await page.locator("#data-warning").isHidden(), true);

  // A get failure has a clear message and focus retries the read.
  await worker.evaluate(() => {
    globalThis.originalGet = chrome.storage.local.get.bind(
      chrome.storage.local,
    );
    chrome.storage.local.get = async () => {
      throw new Error("Simulated read error");
    };
  });
  const failed = await context.newPage();
  await failed.goto(`${base}popup.html`);
  await failed.waitForFunction(() =>
    document.getElementById("message").textContent.includes("Could not read"),
  );
  assert.equal(await failed.locator("#apply-button").isDisabled(), true);
  await worker.evaluate(() => {
    chrome.storage.local.get = globalThis.originalGet;
  });
  await failed.evaluate(() => window.dispatchEvent(new Event("focus")));
  await value(failed, "total", "0");
  await value(failed, "message", "");
  assert.deepEqual(
    network,
    [],
    "The extension must not make external requests",
  );
  assert.deepEqual(errors, [], "No uncaught browser errors");
  console.log(
    "Browser checks passed: rapid clicks, write rollback, undo, settings, keyboard, CSV, reset, corruption, recovery, reduced motion, and no external requests.",
  );
} finally {
  if (context) await context.close();
  await rm(profile, { recursive: true, force: true });
}
