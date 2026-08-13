import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const templatePath = path.resolve(process.cwd(), "src", "webview", "content.html");
const templateHtml = fs.readFileSync(templatePath, "utf8");

type HarnessEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  kind?: "text" | "binary" | "folder";
  size?: number;
  compressedSize?: number;
  mtime?: string | number;
};

type HarnessInitialData = {
  entries?: HarnessEntry[];
  isPartial?: boolean;
  message?: string;
  error?: string;
};

function renderHtml(initialData?: HarnessInitialData): string {
  const initialScript =
    initialData == null
      ? ""
      : `<script id="initial-entries" type="application/json">${JSON.stringify(initialData).replaceAll("<", "\\u003c")}</script>`;

  return templateHtml
    .replaceAll("__CSP_SOURCE__", "vscode-webview:")
    .replace("__CODICONS_STYLE__", "")
    .replace("__INITIAL_SCRIPT__", () => initialScript);
}

async function createWebviewHarness(initialData?: HarnessInitialData) {
  const postedMessages: unknown[] = [];
  let savedState: unknown = null;

  const dom = new JSDOM(renderHtml(initialData), {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.acquireVsCodeApi = () => ({
        postMessage(message: unknown) {
          postedMessages.push(message);
        },
        getState: () => savedState,
        setState: (state: unknown) => {
          savedState = state;
        },
      });
    },
  });

  await new Promise<void>((resolve) => {
    dom.window.setTimeout(resolve, 0);
  });

  return {
    dom,
    document: dom.window.document,
    window: dom.window,
    postedMessages,
    getState: () => savedState,
  };
}

function visibleNames(document: Document): string[] {
  return [...document.querySelectorAll(".rowName, .rowNameButton")].map(
    (element) => element.textContent?.trim() ?? "",
  );
}

describe("webview harness", () => {
  it("renders an empty archive without the table", async () => {
    const { document, dom } = await createWebviewHarness({ entries: [] });

    expect(document.querySelector("#treeTable")?.getAttribute("style")).toContain("display:none");
    expect(document.querySelector("#statusText")?.textContent).toContain("empty");
    expect(document.querySelector("#summary")?.textContent).toContain("No entries");

    dom.window.close();
  });

  it("renders an initial error instead of the tree", async () => {
    const { document, dom } = await createWebviewHarness({ error: "Archive is corrupt" });

    expect(document.querySelector("#error")?.textContent).toBe("Archive is corrupt");
    expect(document.querySelector("#treeTable")?.getAttribute("style")).toContain("display:none");
    expect(document.querySelector("#retryBtn")?.getAttribute("style")).toContain("inline");

    dom.window.close();
  });

  it("shows partial results with an inline retry action", async () => {
    const { document, dom } = await createWebviewHarness({
      entries: [{ path: "only.txt", name: "only.txt", isDirectory: false, size: 1 }],
      isPartial: true,
      message: "Timed out after 10s",
    });

    const partial = document.querySelector("#partial");
    expect(partial?.textContent).toContain("Timed out after 10s");
    expect(partial?.querySelector("#retryBtnInline")).not.toBeNull();

    dom.window.close();
  });

  it("filters binary and text entries independently", async () => {
    const { document, window, dom } = await createWebviewHarness({
      entries: [
        { path: "readme.md", name: "readme.md", isDirectory: false },
        { path: "image.png", name: "image.png", isDirectory: false },
      ],
    });

    document
      .querySelector('[data-filter="text"]')
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    expect(visibleNames(document)).toEqual(["readme.md"]);

    document
      .querySelector('[data-filter="binary"]')
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    expect(visibleNames(document)).toEqual(["image.png"]);

    dom.window.close();
  });

  it("uses host-provided kind for filters instead of the hardcoded extension table", async () => {
    const { document, window, dom } = await createWebviewHarness({
      entries: [
        { path: "config.toml", name: "config.toml", isDirectory: false, kind: "text" },
        { path: "data.bin", name: "data.bin", isDirectory: false, kind: "binary" },
      ],
    });

    const kinds = [...document.querySelectorAll('tbody tr.row [data-col="kind"]')].map((element) =>
      element.textContent?.trim(),
    );
    expect(kinds).toContain("Text");
    expect(kinds).toContain("Binary");

    document
      .querySelector('[data-filter="text"]')
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    expect(visibleNames(document)).toEqual(["config.toml"]);

    dom.window.close();
  });

  it("shows the empty state when search matches nothing", async () => {
    const { document, window, dom } = await createWebviewHarness({
      entries: [{ path: "notes.txt", name: "notes.txt", isDirectory: false }],
    });

    const searchInput = document.querySelector("#searchInput") as HTMLInputElement;
    searchInput.value = "missing-file";
    searchInput.dispatchEvent(new window.Event("input", { bubbles: true }));

    expect(document.querySelector("#empty")?.getAttribute("style")).not.toBe("display: none;");
    expect(visibleNames(document)).toHaveLength(0);

    dom.window.close();
  });

  it("sorts by kind and compressed size from column headers", async () => {
    const { document, window, dom } = await createWebviewHarness({
      entries: [
        { path: "folder/", name: "folder", isDirectory: true },
        { path: "small.bin", name: "small.bin", isDirectory: false, compressedSize: 10 },
        { path: "large.bin", name: "large.bin", isDirectory: false, compressedSize: 500 },
      ],
    });

    document
      .querySelector('[data-sort="compressed"]')
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    document
      .querySelector('[data-sort="compressed"]')
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));

    const fileNames = [...document.querySelectorAll('.row[data-kind="file"] .rowNameButton')].map(
      (element) => element.textContent?.trim(),
    );
    expect(fileNames[0]).toBe("large.bin");

    document
      .querySelector('[data-sort="kind"]')
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    document
      .querySelector('[data-sort="kind"]')
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    const kinds = [...document.querySelectorAll('tbody tr.row [data-col="kind"]')].map((element) =>
      element.textContent?.trim(),
    );
    expect(kinds[0]).toBe("Folder");

    dom.window.close();
  });

  it("posts host messages for refresh, open, and copy actions", async () => {
    const { document, window, postedMessages, dom } = await createWebviewHarness({
      entries: [{ path: "docs/readme.txt", name: "readme.txt", isDirectory: false }],
    });

    document
      .querySelector("#refreshBtn")
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    document
      .querySelector('.rowAction[data-action="open"][data-path="docs/readme.txt"]')
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    document
      .querySelector('.rowAction[data-action="copy"][data-path="docs/readme.txt"]')
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(postedMessages).toEqual([
      { type: "getEntries" },
      { type: "openEntry", path: "docs/readme.txt" },
      { type: "copyPath", path: "docs/readme.txt" },
    ]);

    dom.window.close();
  });

  it("renders escaped entry names without interpreting HTML", async () => {
    const { document, dom } = await createWebviewHarness({
      entries: [{ path: "weird<tag>.txt", name: "weird<tag>.txt", isDirectory: false }],
    });

    const nameButton = document.querySelector(".rowNameButton");
    expect(nameButton?.textContent).toBe("weird<tag>.txt");
    expect(nameButton?.innerHTML).toBe("weird&lt;tag&gt;.txt");

    dom.window.close();
  });

  it("shows em dashes for missing file metadata", async () => {
    const { document, dom } = await createWebviewHarness({
      entries: [{ path: "bare", name: "bare", isDirectory: false }],
    });

    const row = document.querySelector('.row[data-kind="file"]');
    expect(row?.querySelector('[data-col="size"]')?.textContent).toBe("—");
    expect(row?.querySelector('[data-col="compressed"]')?.textContent).toBe("—");
    expect(row?.querySelector('[data-col="modified"]')?.textContent).toBe("—");

    dom.window.close();
  });

  it("toggles a single folder without expand all", async () => {
    const { document, window, dom } = await createWebviewHarness({
      entries: [
        { path: "root/", name: "root", isDirectory: true },
        { path: "root/hidden.txt", name: "hidden.txt", isDirectory: false },
      ],
    });

    expect(visibleNames(document)).toContain("hidden.txt");

    document
      .querySelector('[data-action="toggle"][data-path="root/"]')
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(visibleNames(document)).not.toContain("hidden.txt");

    dom.window.close();
  });

  it("posts extract messages and renders extract result feedback", async () => {
    const { document, postedMessages, window, dom } = await createWebviewHarness({
      entries: [
        { path: "large-archive/", name: "large-archive", isDirectory: true },
        {
          path: "large-archive/nested/deeper/nested-long.txt",
          name: "nested-long.txt",
          isDirectory: false,
        },
      ],
    });

    document
      .querySelector("#extractAllBtn")
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    document
      .querySelector(
        '[data-action="extract"][data-path="large-archive/nested/deeper/nested-long.txt"]',
      )
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(postedMessages).toEqual([
      { type: "extractAll" },
      { type: "extractEntry", path: "large-archive/nested/deeper/nested-long.txt" },
    ]);

    window.dispatchEvent(
      new window.MessageEvent("message", {
        data: {
          type: "extractResult",
          success: true,
          targetPath: "/tmp/extracted/large-archive",
        },
      }),
    );

    expect(document.querySelector("#partial")?.textContent).toContain(
      "Extracted to: /tmp/extracted/large-archive",
    );

    dom.window.close();
  });

  it("collapses and expands all nested folders", async () => {
    const { document, window, dom } = await createWebviewHarness({
      entries: [
        { path: "large-archive/", name: "large-archive", isDirectory: true },
        { path: "large-archive/data.js", name: "data.js", isDirectory: false },
        { path: "large-archive/nested/", name: "nested", isDirectory: true },
        {
          path: "large-archive/nested/deeper/nested-long.txt",
          name: "nested-long.txt",
          isDirectory: false,
        },
        { path: "large-archive/assets/pixel.png", name: "pixel.png", isDirectory: false },
      ],
    });

    expect(visibleNames(document).length).toBeGreaterThan(3);

    document
      .querySelector("#collapseAllBtn")
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    expect(visibleNames(document)).toHaveLength(1);
    expect(visibleNames(document)[0]).toMatch(/^large-archive/);

    document
      .querySelector("#expandAllBtn")
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));
    expect(visibleNames(document)).toContain("nested-long.txt");
    expect(visibleNames(document)).toContain("pixel.png");

    dom.window.close();
  });

  it("handles runtime loading, error, and extract result messages", async () => {
    const { document, window, dom } = await createWebviewHarness({
      entries: [{ path: "a.txt", name: "a.txt", isDirectory: false }],
    });

    window.dispatchEvent(
      new window.MessageEvent("message", { data: { type: "loading", show: true } }),
    );
    expect(document.querySelector("#loading")?.getAttribute("style")).toContain("flex");

    window.dispatchEvent(
      new window.MessageEvent("message", { data: { type: "error", message: "Read failed" } }),
    );
    expect(document.querySelector("#error")?.textContent).toBe("Read failed");

    window.dispatchEvent(
      new window.MessageEvent("message", {
        data: { type: "extractResult", success: false, error: "Permission denied" },
      }),
    );
    expect(document.querySelector("#partial")?.className).toBe("is-error");
    expect(document.querySelector("#partial")?.textContent).toContain("Permission denied");

    dom.window.close();
  });

  it("persists column widths through vscode webview state", async () => {
    const { document, window, dom, getState } = await createWebviewHarness({
      entries: [{ path: "a.txt", name: "a.txt", isDirectory: false }],
    });

    const handle = document.querySelector('.colResizeHandle[data-col-key="size"]');
    if (!handle) {
      throw new Error("Resize handle not found");
    }
    const rect = handle.getBoundingClientRect() as DOMRect;
    const startX = Number(rect.left) + 2;
    const startY = Number(rect.top) + 2;

    handle.dispatchEvent(
      new window.MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: startX,
        clientY: startY,
      }),
    );
    document.dispatchEvent(
      new window.MouseEvent("mousemove", {
        bubbles: true,
        clientX: Number(rect.left) + 40,
        clientY: startY,
      }),
    );
    document.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));

    const state = getState() as { columnWidths?: { size?: number } } | null;
    expect(state?.columnWidths?.size).toBeGreaterThan(88);

    dom.window.close();
  });

  it("posts extractSelected for checked rows", async () => {
    const { document, window, postedMessages, dom } = await createWebviewHarness({
      entries: [
        { path: "keep.txt", name: "keep.txt", isDirectory: false },
        { path: "skip.txt", name: "skip.txt", isDirectory: false },
        { path: "nested/", name: "nested", isDirectory: true },
        { path: "nested/inside.txt", name: "inside.txt", isDirectory: false },
      ],
    });

    const extractSelectedBtn = document.querySelector("#extractSelectedBtn") as HTMLButtonElement;
    expect(extractSelectedBtn.disabled).toBe(true);

    document
      .querySelector('.rowCheck[data-path="keep.txt"]')
      ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    document
      .querySelector('.rowCheck[data-path="nested/"]')
      ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(extractSelectedBtn.disabled).toBe(false);
    expect(extractSelectedBtn.textContent).toContain("2");

    extractSelectedBtn.dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(postedMessages).toContainEqual({
      type: "extractSelected",
      paths: ["keep.txt", "nested"],
    });

    dom.window.close();
  });

  it("shift-clicks to select a visible range", async () => {
    const { document, window, postedMessages, dom } = await createWebviewHarness({
      entries: [
        { path: "a.txt", name: "a.txt", isDirectory: false },
        { path: "b.txt", name: "b.txt", isDirectory: false },
        { path: "c.txt", name: "c.txt", isDirectory: false },
      ],
    });

    document
      .querySelector('.rowCheck[data-path="a.txt"]')
      ?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    document
      .querySelector('.rowCheck[data-path="c.txt"]')
      ?.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }),
      );

    document
      .querySelector("#extractSelectedBtn")
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(postedMessages).toContainEqual({
      type: "extractSelected",
      paths: ["a.txt", "b.txt", "c.txt"],
    });

    dom.window.close();
  });

  it("selects all visible rows from the header checkbox", async () => {
    const { document, window, postedMessages, dom } = await createWebviewHarness({
      entries: [
        { path: "one.txt", name: "one.txt", isDirectory: false },
        { path: "two.txt", name: "two.txt", isDirectory: false },
      ],
    });

    const selectAll = document.querySelector("#selectAllCheck") as HTMLInputElement;
    selectAll.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    document
      .querySelector("#extractSelectedBtn")
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(postedMessages).toContainEqual({
      type: "extractSelected",
      paths: ["one.txt", "two.txt"],
    });

    dom.window.close();
  });

  it("virtualizes long archive lists while scrolling", async () => {
    const entries = Array.from({ length: 80 }, (_, index) => {
      const name = `file-${String(index).padStart(3, "0")}.txt`;
      return { path: name, name, isDirectory: false };
    });
    const { document, window, dom } = await createWebviewHarness({ entries });
    const container = document.querySelector("#treeContainer") as HTMLElement;
    Object.defineProperty(container, "clientHeight", { configurable: true, value: 88 });
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });
    container.dispatchEvent(new window.Event("scroll"));

    expect(document.querySelectorAll("tbody tr.row").length).toBeLessThan(80);
    expect(visibleNames(document)[0]).toBe("file-000.txt");

    container.scrollTop = 22 * 40;
    container.dispatchEvent(new window.Event("scroll"));

    expect(visibleNames(document)).toContain("file-040.txt");
    expect(visibleNames(document)).not.toContain("file-000.txt");

    dom.window.close();
  });
});
