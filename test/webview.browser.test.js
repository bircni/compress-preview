const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const templatePath = path.resolve(__dirname, "..", "src", "webview", "content.html");
const templateHtml = fs.readFileSync(templatePath, "utf8");

const sampleEntries = [
  { path: "archive/", name: "archive", isDirectory: true },
  { path: "archive/large.bin", name: "large.bin", isDirectory: false, size: 1000, mtime: "2026-01-03T00:00:00.000Z" },
  { path: "archive/notes.txt", name: "notes.txt", isDirectory: false, size: 10, mtime: "2026-01-02T00:00:00.000Z" },
  { path: "archive/newer.log", name: "newer.log", isDirectory: false, size: 50, mtime: "2026-01-04T00:00:00.000Z" },
  { path: "archive/nested/", name: "nested", isDirectory: true },
  { path: "archive/nested/readme.md", name: "readme.md", isDirectory: false, size: 20, mtime: "2026-01-01T00:00:00.000Z" },
];

function renderHtml(initialData) {
  const initialScript = `<script id="initial-entries" type="application/json">${JSON.stringify(
    initialData,
  ).replace(/</g, "\\u003c")}</script>`;
  return templateHtml
    .replaceAll("__CSP_SOURCE__", "vscode-webview:")
    .replace("__INITIAL_SCRIPT__", initialScript);
}

function fileRowsLocator(page) {
  return page.locator('.row[data-kind="file"] .rowNameButton');
}

test("webview browser test: sort, filters, and a11y controls", async ({ page }) => {
  await page.setContent(renderHtml({ entries: sampleEntries }));

  await expect(page.getByPlaceholder("Search files")).toBeVisible();
  await expect(page.locator("#sortSelect")).toBeVisible();

  await page.locator("#sortSelect").selectOption("sizeDesc");
  await expect(fileRowsLocator(page).first()).toHaveText("large.bin");

  await page.locator("#sortSelect").selectOption("mtimeDesc");
  await expect(fileRowsLocator(page).first()).toHaveText("newer.log");

  await page.getByPlaceholder("Search files").fill("nested");
  await expect(fileRowsLocator(page)).toContainText(["readme.md"]);
  await expect(fileRowsLocator(page)).not.toContainText(["large.bin"]);

  await page.locator('[data-filter="folders"]').click();
  await expect(page.locator('.row[data-kind="file"]')).toHaveCount(0);

  await page.locator('[data-filter="all"]').click();
  await page.getByPlaceholder("Search files").fill("");
  expect(await page.locator('[data-action="extract"][aria-label]').count()).toBeGreaterThan(0);
  expect(await page.locator('[data-action="copy"][aria-label]').count()).toBeGreaterThan(0);
  expect(await page.locator('.rowToggle[aria-expanded]').count()).toBeGreaterThan(0);
});
