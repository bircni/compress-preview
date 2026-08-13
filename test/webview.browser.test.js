const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const templatePath = path.resolve(__dirname, "..", "src", "webview", "content.html");
const templateHtml = fs.readFileSync(templatePath, "utf8");
const codiconsCssPath = path.resolve(
  __dirname,
  "..",
  "node_modules",
  "@vscode",
  "codicons",
  "dist",
  "codicon.css",
);

const sampleEntries = [
  { path: "archive/", name: "archive", isDirectory: true },
  {
    path: "archive/large.bin",
    name: "large.bin",
    isDirectory: false,
    size: 1000,
    compressedSize: 400,
    mtime: "2026-01-03T00:00:00.000Z",
  },
  {
    path: "archive/notes.txt",
    name: "notes.txt",
    isDirectory: false,
    size: 10,
    compressedSize: 8,
    mtime: "2026-01-02T00:00:00.000Z",
  },
  {
    path: "archive/newer.log",
    name: "newer.log",
    isDirectory: false,
    size: 50,
    compressedSize: 20,
    mtime: "2026-01-04T00:00:00.000Z",
  },
  { path: "archive/nested/", name: "nested", isDirectory: true },
  {
    path: "archive/nested/readme.md",
    name: "readme.md",
    isDirectory: false,
    size: 20,
    compressedSize: 12,
    mtime: "2026-01-01T00:00:00.000Z",
  },
];

function renderHtml(initialData) {
  const initialScript = `<script id="initial-entries" type="application/json">${JSON.stringify(
    initialData,
  ).replace(/</g, "\\u003c")}</script>`;
  const codiconsStyleHref = fs.existsSync(codiconsCssPath)
    ? `file://${codiconsCssPath}`
    : "";
  return templateHtml
    .replaceAll("__CSP_SOURCE__", "vscode-webview:")
    .replace("__CODICONS_STYLE__", codiconsStyleHref)
    .replace("__INITIAL_SCRIPT__", initialScript);
}

function fileRowsLocator(page) {
  return page.locator('.row[data-kind="file"] .rowNameButton');
}

async function readColumnAlignment(page, rowSelector) {
  return page.evaluate((selector) => {
    const columns = ["name", "kind", "size", "compressed", "modified"];
    const header = document.getElementById("treeHeader");
    const row = selector
      ? Array.from(document.querySelectorAll(".row")).find((el) => el.matches(selector))
      : document.querySelector(".row");
    if (!header || !row) {
      return { ok: false, reason: "missing header or row" };
    }

    return {
      ok: true,
      columns: columns.map((col) => {
        const headerEl = header.querySelector(`[data-col="${col}"]`);
        const cellEl = row.querySelector(`[data-col="${col}"]`);
        if (!headerEl || !cellEl) {
          return { col, missing: true };
        }
        const headerBox = headerEl.getBoundingClientRect();
        const cellBox = cellEl.getBoundingClientRect();
        return {
          col,
          headerLeft: headerBox.left,
          cellLeft: cellBox.left,
          headerWidth: headerBox.width,
          cellWidth: cellBox.width,
          leftDelta: Math.abs(headerBox.left - cellBox.left),
          widthDelta: Math.abs(headerBox.width - cellBox.width),
        };
      }),
    };
  }, rowSelector);
}

function expectAlignedColumns(result, tolerancePx = 2) {
  expect(result.ok, result.reason || "alignment probe failed").toBe(true);
  for (const column of result.columns) {
    expect(column.missing, `missing column ${column.col}`).toBeFalsy();
    expect(column.leftDelta, `${column.col} left offset`).toBeLessThanOrEqual(tolerancePx);
    expect(column.widthDelta, `${column.col} width mismatch`).toBeLessThanOrEqual(tolerancePx);
  }
}

async function installVsCodeApi(page) {
  await page.goto("about:blank");
  await page.evaluate(() => {
    window.__postedMessages = [];
    window.__webviewState = null;
    window.acquireVsCodeApi = () => ({
      postMessage(message) {
        window.__postedMessages.push(message);
      },
      getState() {
        return window.__webviewState;
      },
      setState(state) {
        window.__webviewState = state;
      },
    });
  });
}

async function loadWebview(page, initialData) {
  await installVsCodeApi(page);
  await page.setContent(renderHtml(initialData));
}

test.describe("webview core layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setContent(renderHtml({ entries: sampleEntries }));
    await expect(page.locator("#treeTable")).toBeVisible();
  });

  test("webview browser test: sort, filters, and a11y controls", async ({ page }) => {
  await expect(page.getByPlaceholder("Search files")).toBeVisible();
  await expect(page.locator('[data-sort="path"]')).toBeVisible();

  await page.locator('[data-sort="size"]').click();
  await page.locator('[data-sort="size"]').click();
  await expect(fileRowsLocator(page).first()).toHaveText("large.bin");

  await page.locator('[data-sort="mtime"]').click();
  await page.locator('[data-sort="mtime"]').click();
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

test("webview browser test: column headers align with top-level rows", async ({ page }) => {
  const alignment = await readColumnAlignment(page, '.row[data-kind="file"]');
  expectAlignedColumns(alignment);
});

test("webview browser test: metadata columns stay aligned for nested rows", async ({ page }) => {
  const nestedRow = page.locator('.row[data-kind="file"]', { hasText: "readme.md" });
  await expect(nestedRow).toBeVisible();

  const alignment = await page.evaluate(() => {
    const columns = ["name", "kind", "size", "compressed", "modified"];
    const header = document.getElementById("treeHeader");
    const row = Array.from(document.querySelectorAll('.row[data-kind="file"]')).find((el) =>
      el.textContent.includes("readme.md"),
    );
    if (!header || !row) {
      return { ok: false, reason: "missing header or nested row" };
    }
    return {
      ok: true,
      columns: columns.map((col) => {
        const headerEl = header.querySelector(`[data-col="${col}"]`);
        const cellEl = row.querySelector(`[data-col="${col}"]`);
        const headerBox = headerEl.getBoundingClientRect();
        const cellBox = cellEl.getBoundingClientRect();
        return {
          col,
          missing: !headerEl || !cellEl,
          leftDelta: Math.abs(headerBox.left - cellBox.left),
          widthDelta: Math.abs(headerBox.width - cellBox.width),
        };
      }),
    };
  });
  expectAlignedColumns(alignment);

  const nestedIndent = await nestedRow
    .locator(".colNameTree")
    .evaluate((el) => parseInt(window.getComputedStyle(el).paddingLeft, 10) || 0);
  const rootIndent = await page
    .locator('.row[data-kind="dir"]', { hasText: "archive/" })
    .locator(".colNameTree")
    .evaluate((el) => parseInt(window.getComputedStyle(el).paddingLeft, 10) || 0);
  expect(nestedIndent).toBeGreaterThan(rootIndent);
});

test("webview browser test: each row stays on one horizontal line", async ({ page }) => {
  const rowSpreads = await page.evaluate(() =>
    Array.from(document.querySelectorAll("tbody tr.row")).map((row) => {
      const tops = ["name", "kind", "size", "compressed", "modified"].map((col) =>
        row.querySelector(`[data-col="${col}"]`).getBoundingClientRect().top,
      );
      return Math.max(...tops) - Math.min(...tops);
    }),
  );

  expect(rowSpreads.length).toBeGreaterThan(0);
  for (const spread of rowSpreads) {
    expect(spread).toBeLessThanOrEqual(2);
  }
});

test("webview browser test: table fills the container width", async ({ page }) => {
  const metrics = await page.evaluate(() => {
    const container = document.querySelector(".treeContainer");
    const table = document.getElementById("treeTable");
    return {
      containerWidth: container.clientWidth,
      tableWidth: table.getBoundingClientRect().width,
    };
  });

  expect(metrics.containerWidth).toBeGreaterThan(0);
  expect(Math.abs(metrics.tableWidth - metrics.containerWidth)).toBeLessThanOrEqual(2);
});

test("webview browser test: column resize handle changes column width", async ({ page }) => {
  const beforeWidth = await page.locator("#treeColgroup col.colKind").evaluate((el) => el.style.width);

  const delta = await page.evaluate(() => {
    const handle = document.querySelector('.colResizeHandle[data-col-key="kind"]');
    if (!handle) return 0;
    const rect = handle.getBoundingClientRect();
    handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: rect.left + 2, clientY: rect.top + 2 }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: rect.left + 42, clientY: rect.top + 2 }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    return 42;
  });
  expect(delta).toBeGreaterThan(0);

  const afterWidth = await page.locator("#treeColgroup col.colKind").evaluate((el) => el.style.width);
  expect(parseInt(afterWidth, 10)).toBeGreaterThan(parseInt(beforeWidth, 10));
});

test("webview browser test: icon columns line up between sibling folders and files", async ({ page }) => {
  const metrics = await page.evaluate(() => {
    function rowByLabel(label) {
      return Array.from(document.querySelectorAll(".row")).find((el) => {
        const name = el.querySelector(".rowName, .rowNameButton");
        return name && name.textContent.trim() === label;
      });
    }

    const folderRow = rowByLabel("nested/");
    const fileRow = rowByLabel("large.bin");
    if (!folderRow || !fileRow) {
      return { ok: false };
    }

    function iconLeft(row) {
      const icon = row.querySelector(".rowIcon");
      return icon ? icon.getBoundingClientRect().left : null;
    }

    function twistieLeft(row) {
      const twistie = row.querySelector(".rowToggle, .rowTwistieSpacer");
      return twistie ? twistie.getBoundingClientRect().left : null;
    }

    return {
      ok: true,
      folderTwistie: twistieLeft(folderRow),
      fileTwistie: twistieLeft(fileRow),
      folderIcon: iconLeft(folderRow),
      fileIcon: iconLeft(fileRow),
    };
  });

  expect(metrics.ok).toBe(true);
  expect(Math.abs(metrics.folderTwistie - metrics.fileTwistie)).toBeLessThanOrEqual(2);
  expect(Math.abs(metrics.folderIcon - metrics.fileIcon)).toBeLessThanOrEqual(2);
  });
});

test.describe("webview edge cases", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("empty archive hides the table and shows empty status", async ({ page }) => {
    await page.setContent(renderHtml({ entries: [] }));

    await expect(page.locator("#treeTable")).toBeHidden();
    await expect(page.locator("#statusText")).toContainText("empty");
    await expect(page.locator("#summary")).toContainText("No entries");
  });

  test("initial error replaces the tree and exposes retry", async ({ page }) => {
    await page.setContent(renderHtml({ error: "Archive is corrupt" }));

    await expect(page.locator("#error")).toHaveText("Archive is corrupt");
    await expect(page.locator("#treeTable")).toBeHidden();
    await expect(page.locator("#retryBtn")).toBeVisible();
  });

  test("partial results show retry inline", async ({ page }) => {
    await page.setContent(
      renderHtml({
        entries: [{ path: "only.txt", name: "only.txt", isDirectory: false, size: 1 }],
        isPartial: true,
        message: "Timed out after 10s",
      }),
    );

    await expect(page.locator("#partial")).toContainText("Timed out after 10s");
    await expect(page.locator("#retryBtnInline")).toBeVisible();
  });

  test("binary and text filters hide the opposite entry types", async ({ page }) => {
    await page.setContent(
      renderHtml({
        entries: [
          { path: "readme.md", name: "readme.md", isDirectory: false },
          { path: "image.png", name: "image.png", isDirectory: false },
        ],
      }),
    );

    await page.locator('[data-filter="text"]').click();
    await expect(fileRowsLocator(page)).toHaveText(["readme.md"]);

    await page.locator('[data-filter="binary"]').click();
    await expect(fileRowsLocator(page)).toHaveText(["image.png"]);
  });

  test("search with no matches shows the empty state", async ({ page }) => {
    await page.setContent(
      renderHtml({
        entries: [{ path: "notes.txt", name: "notes.txt", isDirectory: false }],
      }),
    );

    await page.getByPlaceholder("Search files").fill("missing-file");
    await expect(page.locator("#empty")).toBeVisible();
    await expect(fileRowsLocator(page)).toHaveCount(0);
  });

  test("kind sort puts folders before files", async ({ page }) => {
    await page.setContent(
      renderHtml({
        entries: [
          { path: "folder/", name: "folder", isDirectory: true },
          { path: "small.bin", name: "small.bin", isDirectory: false, compressedSize: 10 },
          { path: "large.bin", name: "large.bin", isDirectory: false, compressedSize: 500 },
        ],
      }),
    );

    await page.locator('[data-sort="kind"]').click();
    await page.locator('[data-sort="kind"]').click();
    const kinds = await page.locator('tbody tr.row [data-col="kind"]').allTextContents();
    expect(kinds[0]).toBe("Folder");
  });

  test("compressed sort reorders files by compressed size", async ({ page }) => {
    await page.setContent(
      renderHtml({
        entries: [
          { path: "small.bin", name: "small.bin", isDirectory: false, compressedSize: 10 },
          { path: "large.bin", name: "large.bin", isDirectory: false, compressedSize: 500 },
        ],
      }),
    );

    await page.locator('[data-sort="compressed"]').click();
    await page.locator('[data-sort="compressed"]').click();
    await expect(fileRowsLocator(page).first()).toHaveText("large.bin");
  });

  test("collapse all hides nested entries", async ({ page }) => {
    await page.setContent(renderHtml({ entries: sampleEntries }));

    await page.locator("#collapseAllBtn").click();
    await expect(fileRowsLocator(page)).toHaveCount(0);
    await expect(page.locator('.row[data-kind="dir"]')).toHaveCount(1);
  });

  test("escapes HTML in entry names", async ({ page }) => {
    await page.setContent(
      renderHtml({
        entries: [{ path: "weird<tag>.txt", name: "weird<tag>.txt", isDirectory: false }],
      }),
    );

    const html = await page.content();
    expect(html).toContain("weird&lt;tag&gt;.txt");
    await expect(page.locator(".rowNameButton")).toHaveText("weird<tag>.txt");
  });

  test("table stays full width after viewport resize", async ({ page }) => {
    await page.setContent(renderHtml({ entries: sampleEntries }));
    await page.setViewportSize({ width: 960, height: 720 });

    const metrics = await page.evaluate(() => {
      const container = document.querySelector(".treeContainer");
      const table = document.getElementById("treeTable");
      return {
        containerWidth: container.clientWidth,
        tableWidth: table.getBoundingClientRect().width,
      };
    });

    expect(Math.abs(metrics.tableWidth - metrics.containerWidth)).toBeLessThanOrEqual(2);
  });

  test("sort headers show ascending and descending indicators", async ({ page }) => {
    await page.setContent(renderHtml({ entries: sampleEntries }));

    await page.locator('[data-sort="size"]').click();
    await expect(page.locator('[data-sort="size"] .sortMark')).toHaveText(" ↑");

    await page.locator('[data-sort="size"]').click();
    await expect(page.locator('[data-sort="size"] .sortMark')).toHaveText(" ↓");
  });
});

test.describe("webview host messaging", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loadWebview(page, { entries: sampleEntries });
    await expect(page.locator("#treeTable")).toBeVisible();
  });

  test("refresh, open, and copy post messages to the extension host", async ({ page }) => {
    await page.locator("#refreshBtn").click();
    await page.evaluate(() => {
      document.querySelector('.rowAction[data-action="open"][data-path="archive/notes.txt"]')?.click();
      document.querySelector('.rowAction[data-action="copy"][data-path="archive/notes.txt"]')?.click();
    });

    const messages = await page.evaluate(() => window.__postedMessages);
    expect(messages).toEqual([
      { type: "getEntries" },
      { type: "openEntry", path: "archive/notes.txt" },
      { type: "copyPath", path: "archive/notes.txt" },
    ]);
  });

  test("inline retry posts retryLoad", async ({ page }) => {
    await loadWebview(page, {
      entries: sampleEntries,
      isPartial: true,
      message: "Stopped early",
    });

    await page.locator("#retryBtnInline").click();
    const messages = await page.evaluate(() => window.__postedMessages);
    expect(messages).toContainEqual({ type: "retryLoad" });
  });

  test("column resize persists widths in webview state", async ({ page }) => {
    const beforeWidth = await page.locator("#treeColgroup col.colSize").evaluate((el) => el.style.width);

    await page.evaluate(() => {
      const handle = document.querySelector('.colResizeHandle[data-col-key="size"]');
      const rect = handle.getBoundingClientRect();
      handle.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: rect.left + 2, clientY: rect.top + 2 }),
      );
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: rect.left + 40, clientY: rect.top + 2 }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    const afterWidth = await page.locator("#treeColgroup col.colSize").evaluate((el) => el.style.width);
    expect(parseInt(afterWidth, 10)).toBeGreaterThan(parseInt(beforeWidth, 10));

    const state = await page.evaluate(() => window.__webviewState);
    expect(state?.columnWidths?.size).toBeGreaterThan(88);
  });
});
