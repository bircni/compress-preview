const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { describe, it } = require("mocha");
const { JSDOM } = require("jsdom");

const templatePath = path.resolve(__dirname, "..", "..", "..", "src", "webview", "content.html");
const templateHtml = fs.readFileSync(templatePath, "utf8");

const sampleEntries = [
  {
    path: "large-archive/",
    name: "large-archive",
    isDirectory: true,
  },
  {
    path: "large-archive/data.js",
    name: "data.js",
    isDirectory: false,
    size: 17_130_000,
    compressedSize: 957_500,
    mtime: "2026-03-15T16:54:26.000Z",
  },
  {
    path: "large-archive/long-1.txt",
    name: "long-1.txt",
    isDirectory: false,
    size: 14_190_000,
    compressedSize: 49_400,
    mtime: "2026-03-15T16:54:26.000Z",
  },
  {
    path: "large-archive/nested/",
    name: "nested",
    isDirectory: true,
  },
  {
    path: "large-archive/nested/deeper/",
    name: "deeper",
    isDirectory: true,
  },
  {
    path: "large-archive/nested/deeper/nested-long.txt",
    name: "nested-long.txt",
    isDirectory: false,
    size: 5_420_000,
    compressedSize: 18_900,
    mtime: "2026-03-15T16:54:26.000Z",
  },
  {
    path: "large-archive/assets/pixel.png",
    name: "pixel.png",
    isDirectory: false,
    size: 67,
    compressedSize: 67,
    mtime: "2026-03-15T16:54:26.000Z",
  },
];

function renderHtml(initialData) {
  const initialScript = `<script id="initial-entries" type="application/json">${JSON.stringify(
    initialData,
  ).replace(/</g, "\\u003c")}</script>`;

  return templateHtml
    .replaceAll("__CSP_SOURCE__", "vscode-webview:")
    .replace("__INITIAL_SCRIPT__", initialScript);
}

async function createWebviewHarness(initialData) {
  const postedMessages = [];
  const dom = new JSDOM(renderHtml(initialData), {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({
        postMessage(message) {
          postedMessages.push(message);
        },
      });
    },
  });

  await new Promise((resolve) => {
    dom.window.setTimeout(resolve, 0);
  });

  return {
    dom,
    document: dom.window.document,
    postedMessages,
    window: dom.window,
  };
}

function visibleRowNames(document) {
  return Array.from(document.querySelectorAll(".rowName, .rowNameButton")).map((element) =>
    element.textContent.trim(),
  );
}

describe("Compress Preview Webview E2E", () => {
  it("updates visible rows when searching and filtering", async () => {
    const { document, window, dom } = await createWebviewHarness({ entries: sampleEntries });
    const searchInput = document.getElementById("searchInput");
    const foldersFilter = document.querySelector('[data-filter="folders"]');

    assert.ok(searchInput, "Search input should be rendered");
    assert.ok(foldersFilter, "Folders filter should be rendered");
    assert.ok(visibleRowNames(document).includes("data.js"));
    assert.ok(visibleRowNames(document).includes("pixel.png"));

    searchInput.value = "nested";
    searchInput.dispatchEvent(new window.Event("input", { bubbles: true }));

    const searchedRows = visibleRowNames(document);
    assert.ok(searchedRows.some((name) => name.startsWith("nested/")));
    assert.ok(searchedRows.some((name) => name.startsWith("deeper/")));
    assert.ok(searchedRows.includes("nested-long.txt"));
    assert.ok(!searchedRows.includes("data.js"));

    foldersFilter.click();

    const filteredRows = visibleRowNames(document);
    assert.ok(filteredRows.length > 0);
    assert.strictEqual(document.querySelectorAll('.row[data-kind="file"]').length, 0);
    assert.ok(document.getElementById("summary").textContent.includes("Showing"));

    dom.window.close();
  });

  it("posts extract messages and renders extract result feedback", async () => {
    const { document, postedMessages, window, dom } = await createWebviewHarness({
      entries: sampleEntries,
    });

    document.getElementById("extractAllBtn").click();
    const singleExtractButton = document.querySelector(
      '[data-action="extract"][data-path="large-archive/nested/deeper/nested-long.txt"]',
    );

    assert.ok(singleExtractButton, "Nested file extract button should exist");
    singleExtractButton.click();

    assert.strictEqual(postedMessages[0].type, "extractAll");
    assert.strictEqual(postedMessages[1].type, "extractEntry");
    assert.strictEqual(
      postedMessages[1].path,
      "large-archive/nested/deeper/nested-long.txt",
    );

    window.dispatchEvent(
      new window.MessageEvent("message", {
        data: {
          type: "extractResult",
          success: true,
          targetPath: "/tmp/extracted/large-archive",
        },
      }),
    );

    assert.ok(
      document.getElementById("partial").textContent.includes(
        "Extracted to: /tmp/extracted/large-archive",
      ),
    );

    dom.window.close();
  });

  it("collapses and expands nested folders", async () => {
    const { document, dom } = await createWebviewHarness({ entries: sampleEntries });
    const collapseAllButton = document.getElementById("collapseAllBtn");
    const expandAllButton = document.getElementById("expandAllBtn");

    assert.ok(collapseAllButton, "Collapse all button should exist");
    assert.ok(expandAllButton, "Expand all button should exist");
    assert.ok(visibleRowNames(document).length > 3);

    collapseAllButton.click();
    const collapsedRows = visibleRowNames(document);
    assert.strictEqual(collapsedRows.length, 1);
    assert.ok(collapsedRows[0].startsWith("large-archive/"));

    expandAllButton.click();
    assert.ok(visibleRowNames(document).includes("nested-long.txt"));
    assert.ok(visibleRowNames(document).includes("pixel.png"));

    dom.window.close();
  });
});
