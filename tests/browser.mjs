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
  await page.evaluate(() => document.fonts.ready);
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
  assert.ok(
    metrics.contentHeight <= 600,
    `Default content height ${metrics.contentHeight}`,
  );
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
  await value(page, "message", "Saved. Keep going!");
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
    "goal-minus",
  );
  await page.locator("#daily-goal").focus();
  const focus = await page.locator("#daily-goal").evaluate((el) => ({
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
  assert.equal(await page.locator(".activity-row").count(), 5);
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

  // Every optional tool is controlled by a persistent setting.
  await page.locator("#settings-button").click();
  const toolKeys = [
    "streaks",
    "badge",
    "heatmap",
    "notes",
    "pipeline",
    "milestones",
    "csvImport",
    "shortcut",
  ];
  async function toggle(key, enabled) {
    await page.locator(`#feature-${key}`).setChecked(enabled);
    await page.waitForFunction(
      async ({ key, enabled }) =>
        (await chrome.storage.local.get("settings")).settings[key] === enabled,
      { key, enabled },
    );
    await page.waitForFunction(
      () => !document.getElementById("daily-goal").disabled,
    );
  }
  for (const key of toolKeys) {
    await toggle(key, false);
    await toggle(key, true);
  }
  assert.equal(
    await worker.evaluate(() => chrome.action.getBadgeText({})),
    "4",
  );
  await toggle("badge", false);
  await page.waitForFunction(
    async () => (await chrome.action.getBadgeText({})) === "",
  );
  await toggle("badge", true);
  await page.locator("#back-button").click();
  await page.locator("#theme-button").click();
  for (const mode of ["light", "dark", "system"]) {
    await page.locator(`#theme-popover [data-appearance="${mode}"]`).click();
    await ready(page);
    await page.waitForFunction(
      (mode) => document.documentElement.dataset.theme === mode,
      mode,
    );
    for (const accent of ["lime", "aqua", "amber"]) {
      await page.locator(`#theme-popover [data-accent="${accent}"]`).click();
      await ready(page);
      await page.waitForFunction(
        (accent) => document.documentElement.dataset.accent === accent,
        accent,
      );
      const colors = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return [
          root.getPropertyValue("--bg"),
          root.getPropertyValue("--muted"),
          root.getPropertyValue("--green"),
        ].map((color) => {
          const el = document.createElement("span");
          el.style.color = color;
          document.body.append(el);
          const value = getComputedStyle(el).color;
          el.remove();
          return value;
        });
      });
      assert.ok(
        contrast(colors[1], colors[0]) >= 4.5,
        `${mode}/${accent} muted contrast`,
      );
      assert.ok(
        contrast(colors[2], colors[0]) >= 4.5,
        `${mode}/${accent} accent contrast`,
      );
    }
  }
  for (const [preset, fill] of [["yellow", "rgb(255, 255, 0)"], ["red", "rgb(255, 51, 51)"], ["green", "rgb(77, 255, 77)"]]) {
    await page.locator(`[data-appearance="amoled-${preset}"]`).click();
    await ready(page);
    const colors = await page.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      fill: getComputedStyle(document.getElementById("apply-button")).backgroundColor,
      text: getComputedStyle(document.getElementById("apply-button")).color,
      muted: getComputedStyle(document.getElementById("goal-message")).color,
    }));
    assert.deepEqual(colors, { bg: "rgb(0, 0, 0)", fill, text: "rgb(0, 0, 0)", muted: "rgb(176, 176, 176)" });
    assert.ok(contrast(colors.text, colors.fill) >= 4.5);
    assert.equal(await page.locator(`[data-appearance="amoled-${preset}"]`).getAttribute("aria-pressed"), "true");
    const stored = await worker.evaluate(() => chrome.storage.local.get("settings"));
    assert.equal(stored.settings.appearance, `amoled-${preset}`);
    assert.equal(stored.settings.accent, "amber");
  }
  await page.locator('[data-accent="aqua"]').click();
  await ready(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await worker.evaluate(() => {
    globalThis.originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    chrome.storage.local.set = async () => { throw new Error("theme failure"); };
  });
  await page.locator('[data-appearance="amoled-red"]').click();
  await ready(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  assert.equal(await page.locator('[data-appearance="dark"]').getAttribute("aria-pressed"), "true");
  await worker.evaluate(() => { chrome.storage.local.set = globalThis.originalSet; });
  await page.locator('[data-appearance="dark"]').focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.accent), "lime");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#theme-popover").isHidden(), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), "theme-button");
  assert.equal(await page.locator(".heat").count(), 35);
  await page.locator("#apply-button").click();
  await ready(page);
  assert.equal(await page.locator("#quick-note").isVisible(), true);
  await page.locator('#quick-note-form input[name="company"]').fill(" ");
  await page.locator("#quick-note-form button").click();
  assert.equal(await page.locator("#quick-note").isVisible(), true);
  assert.equal(await page.locator('#quick-note-form input[name="tag"]').count(), 0);
  await page
    .locator('#quick-note-form input[name="company"]')
    .fill("<b>Plain company</b>");
  await page.locator('#quick-note-form input[name="role"]').fill("Engineer");
  const draftId = await page.evaluate(async () => (await chrome.storage.local.get("applications")).applications.at(-1).id);
  await page.locator("#apply-button").click();
  await ready(page);
  assert.equal(await page.locator('#quick-note-form input[name="company"]').inputValue(), "<b>Plain company</b>");
  await worker.evaluate(() => { globalThis.originalSet = chrome.storage.local.set.bind(chrome.storage.local); chrome.storage.local.set = async () => { throw new Error("note failure"); }; });
  await page.locator("#quick-note-form button").click();
  await page.waitForFunction(() => document.getElementById("message").textContent.includes("not saved"));
  await ready(page);
  assert.equal(await page.locator('#quick-note-form input[name="company"]').inputValue(), "<b>Plain company</b>");
  await worker.evaluate(() => { chrome.storage.local.set = globalThis.originalSet; });
  const countBeforeNoteSave = await page.locator("#total").textContent();
  await page.locator("#quick-note-form button").click();
  await value(page, "message", "Note saved.");
  assert.equal(await page.locator("#total").textContent(), countBeforeNoteSave);
  await page.locator("#history-button").click();
  assert.equal(await page.locator(".history-entry").count(), 1);
  assert.equal(await page.locator(".history-entry").first().getAttribute("open"), null);
  await page.locator(".history-entry summary").first().click();
  assert.equal((await worker.evaluate(() => chrome.storage.local.get("applications"))).applications.find((a) => a.company)?.id, draftId);
  assert.equal(
    await page
      .locator(".history-entry")
      .first()
      .locator('input[name="company"]')
      .inputValue(),
    "<b>Plain company</b>",
  );
  await page
    .locator(".history-entry")
    .first()
    .locator("select")
    .selectOption("Interview");
  await value(page, "message", "Status saved.");
  await page
    .locator(".history-entry")
    .first()
    .locator('input[name="role"]')
    .fill("Edited");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.history-entry input[name="role"]').inputValue(), "Edited");
  assert.equal(await page.locator(".history-entry").first().getAttribute("open"), "");
  await page.locator(".history-entry").first().locator("button").click();
  await value(page, "message", "Note saved.");
  await page.locator("#back-button").click();
  const beforeShortcut = Number(await page.locator("#total").textContent());
  await page.evaluate(async () => {
    await chrome.runtime.sendMessage({
      type: "updateSettings",
      settings: { shortcut: true },
    });
  });
  await page.evaluate(async () => {
    globalThis.originalCommands = chrome.commands.getAll.bind(chrome.commands);
    chrome.commands.getAll = async () => [{ name: "log-application", shortcut: "Ctrl+Shift+Y" }];
    window.dispatchEvent(new Event("focus"));
  });
  await page.locator("#settings-button").click();
  await value(page, "shortcut-assignment", "Enabled · Ctrl+Shift+Y");
  await page.locator("#back-button").click();
  await page.waitForTimeout(450);
  await page.keyboard.press("Control+Shift+y");
  await ready(page);
  await value(page, "total", String(beforeShortcut + 1));
  await page.locator('#quick-note-form input[name="company"]').focus();
  await page.keyboard.press("Control+Shift+y");
  await page.waitForTimeout(450);
  await value(page, "total", String(beforeShortcut + 1));
  await page.locator("#skip-note").click();
  await page.evaluate(() => {
    chrome.commands.getAll = async () => [{ name: "log-application", shortcut: "" }];
    window.dispatchEvent(new Event("focus"));
  });
  await page.locator("#settings-button").click();
  await value(page, "shortcut-assignment", "Enabled · Not assigned");
  await page.locator("#back-button").click();
  await page.keyboard.press("Control+Shift+y");
  await page.waitForTimeout(450);
  await value(page, "total", String(beforeShortcut + 1));
  await page.evaluate(async () => {
    chrome.commands.getAll = async () => [{ name: "log-application", shortcut: "Ctrl+Shift+Y" }];
    window.dispatchEvent(new Event("focus"));
    await chrome.runtime.sendMessage({ type: "updateSettings", settings: { shortcut: false } });
  });
  await page.locator("#settings-button").click();
  await value(page, "shortcut-assignment", "Disabled · Ctrl+Shift+Y");
  await page.locator("#back-button").click();
  await page.keyboard.press("Control+Shift+y");
  await page.waitForTimeout(450);
  await value(page, "total", String(beforeShortcut + 1));
  await page.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: "updateSettings", settings: { shortcut: true } });
    chrome.commands.getAll = globalThis.originalCommands;
    window.dispatchEvent(new Event("focus"));
  });
  // Same handler path as the command listener, with concurrent repeat protection.
  await new Promise((resolve) => setTimeout(resolve, 450));
  await page.evaluate(async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        chrome.runtime.sendMessage({ type: "shortcutLog" }),
      ),
    );
  });
  await value(page, "total", String(beforeShortcut + 2));
  assert.equal(
    await worker.evaluate(
      () =>
        chrome.runtime.getManifest().commands["log-application"].suggested_key
          .default,
    ),
    "Alt+J",
  );
  await page.locator("#settings-button").click();
  const { csv: encodeCSV } = await import("../lib/data.js");
  const existing = (
    await worker.evaluate(() => chrome.storage.local.get("applications"))
  ).applications;
  const added = {
    id: "12345678-1234-4123-8123-123456789012",
    date: "2026-01-01",
    timestamp: "2026-01-01T12:00:00.000Z",
    company: 'CSV, "Company"',
    role: "Dev",
    tag: "Import",
    pipeline: "Applied",
    status_changed_at: "2026-01-01T12:00:00.000Z",
  };
  const backup = encodeCSV([existing[0], added]);
  const upload = {
    name: "backup.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(backup),
  };
  await page.locator("#import-file").setInputFiles(upload);
  await page.waitForFunction(() =>
    document
      .getElementById("import-summary")
      .textContent.includes("1 additions · 1 duplicates"),
  );
  await page.locator("#cancel-import").click();
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("applications")))
      .applications.length,
    existing.length,
  );
  await page.locator("#import-file").setInputFiles(upload);
  await page.waitForFunction(
    () => !document.getElementById("import-preview").hidden,
  );
  await page.locator("#confirm-import").click();
  await value(page, "message", "CSV imported.");
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("applications")))
      .applications.length,
    existing.length + 1,
  );
  await page.locator("#back-button").click();
  await context.close();
  ({ worker, base } = await launch());
  page = await open(base);
  const reopened = await worker.evaluate(() =>
    chrome.storage.local.get("settings"),
  );
  for (const key of toolKeys) assert.equal(reopened.settings[key], true);
  await page.locator("#history-button").click();
  assert.equal(
    await page.locator('.history-entry input[name="company"]').count(),
    2,
  );
  await page.locator("#back-button").click();
  console.log(
    "Optional tools, themes, accents, History edits, CSV cancellation/import, badge, shortcut path and restart: passed",
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
  assert.equal(await page.locator("#reset-button").isDisabled(), true);
  await worker.evaluate(() => chrome.storage.local.set({ applications: [] }));
  await page.waitForFunction(
    () => !document.getElementById("reset-button").disabled,
  );
  await page.locator("#reset-button").click();
  assert.equal(await page.locator("#confirm-reset").isDisabled(), true);
  await page.locator("#reset-text").fill("RESET");
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

  // Migration write failures remain exportable and retry through the real worker.
  await worker.evaluate(async () => {
    globalThis.originalSet = chrome.storage.local.set.bind(
      chrome.storage.local,
    );
    chrome.storage.local.set = async () => {
      throw new Error("Migration write failure");
    };
    await globalThis.originalSet({
      schemaVersion: 1,
      applications: [
        { id: crypto.randomUUID(), timestamp: Date.now(), date: "2026-01-01" },
      ],
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    () => !document.getElementById("retry-migration").hidden,
  );
  assert.equal(await page.locator("#apply-button").isDisabled(), true);
  await page.locator("#settings-button").click();
  assert.equal(await page.locator("#export-button").isEnabled(), true);
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("schemaVersion")))
      .schemaVersion,
    1,
  );
  await worker.evaluate(() => {
    chrome.storage.local.set = globalThis.originalSet;
  });
  await page.locator("#retry-migration").click();
  await page.waitForFunction(
    () => document.getElementById("retry-migration").hidden,
  );
  assert.equal(
    (await worker.evaluate(() => chrome.storage.local.get("schemaVersion")))
      .schemaVersion,
    2,
  );
  await worker.evaluate(() => chrome.storage.local.set({ schemaVersion: 3 }));
  await page.waitForFunction(() =>
    document
      .getElementById("data-warning")
      .textContent.includes("newer schema"),
  );
  assert.equal(await page.locator("#daily-goal").isDisabled(), true);
  await worker.evaluate(() =>
    chrome.storage.local.set({
      schemaVersion: 2,
      applications: Array.from({ length: 56 }, (_, n) => ({
        id: crypto.randomUUID(),
        timestamp: new Date(Date.now() - n * 1000).toISOString(),
        date: "2026-01-01",
        company: n < 3 ? "" : "Company",
        role: "Engineer",
      })),
    }),
  );
  await value(page, "total", "56");
  await page.locator("#back-button").click();
  await page.locator("#history-button").click();
  assert.equal(await page.locator(".history-entry").count(), 50);
  await page.locator("#load-more").click();
  assert.equal(await page.locator(".history-entry").count(), 53);
  await page.locator("#back-button").click();
  await worker.evaluate(() =>
    chrome.storage.local.set({ applications: [], dailyGoal: 1 }),
  );
  await value(page, "total", "0");
  const beforePositions = await page.locator("#apply-button").boundingBox();
  await page.locator("#apply-button").click();
  await ready(page);
  assert.equal(
    await page
      .locator("#goal-progress")
      .evaluate((el) => el.classList.contains("pulse")),
    true,
  );
  const afterPositions = await page.locator("#apply-button").boundingBox();
  assert.equal(beforePositions.y, afterPositions.y);
  await page.locator("#skip-note").click();
  await worker.evaluate(() =>
    chrome.storage.local.set({ applications: [], dailyGoal: 3 }),
  );
  await value(page, "total", "0");

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
