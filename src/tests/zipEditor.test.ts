import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as zipEditorModule from "../editor/zipEditor";
import type * as zipEditorTestBridgeModule from "../editor/zipEditorTestBridge";

type ProviderHarnessOptions = {
  archivePath?: string;
  ensureArchiveExists?: boolean;
  useFakeTimers?: boolean;
  /** Workspace `compress-preview.listTimeoutMs` (passed to `listEntries`). */
  listTimeoutMs?: number;
  /** Workspace `compress-preview.watchArchiveFile`. */
  watchArchiveFile?: boolean;
  /** Workspace `compress-preview.textExtensions`. */
  textExtensions?: string[];
  /** Workspace `compress-preview.maxTextPreviewBytes`. */
  maxTextPreviewBytes?: number;
  listEntriesResult?: {
    entries: {
      path: string;
      name: string;
      isDirectory: boolean;
      mtime?: Date | string | number;
    }[];
    isPartial: boolean;
    sizeBytes: number;
    message?: string;
  };
  listEntriesError?: Error;
  openTextDocumentError?: Error;
  shouldReuseTempPreview?: boolean;
  showOpenDialogResult?: { fsPath: string }[] | undefined;
  showWarningMessageResult?: string | undefined;
  showWarningMessageResults?: string[];
};

async function createProviderHarness(options: ProviderHarnessOptions = {}) {
  if (options.useFakeTimers ?? true) {
    vi.useFakeTimers();
  } else {
    vi.useRealTimers();
  }

  const archivePath =
    options.archivePath ?? path.join(os.tmpdir(), `compress-preview-test-${Date.now()}.zip`);
  if (!path.isAbsolute(archivePath)) {
    throw new Error("archivePath must be absolute");
  }
  if ((options.ensureArchiveExists ?? true) && !fs.existsSync(archivePath)) {
    fs.writeFileSync(archivePath, "fixture");
  }

  const executeCommand = vi.fn().mockResolvedValue();
  const showTextDocument = vi.fn().mockResolvedValue();
  const openTextDocument = options.openTextDocumentError
    ? vi.fn().mockRejectedValue(options.openTextDocumentError)
    : vi.fn().mockResolvedValue({ uri: { scheme: "compress-preview" } });
  const createOutputChannel = vi.fn();
  const showOpenDialog = vi.fn().mockResolvedValue(options.showOpenDialogResult);
  const warningQueue = [...(options.showWarningMessageResults ?? [])];
  const showWarningMessage = vi.fn().mockImplementation(async () => {
    if (warningQueue.length > 0) {
      return warningQueue.shift();
    }
    return options.showWarningMessageResult;
  });
  const postMessage = vi.fn().mockResolvedValue(true);
  const reveal = vi.fn();
  const listEntries = options.listEntriesError
    ? vi.fn().mockRejectedValue(options.listEntriesError)
    : vi.fn().mockResolvedValue(
        options.listEntriesResult ?? {
          entries: [],
          isPartial: false,
          sizeBytes: 0,
        },
      );
  const openEntryReadStream = vi.fn().mockImplementation(async () => {
    const stream = new PassThrough();
    queueMicrotask(() => stream.end(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
    return {
      entry: {
        path: "images/logo.png",
        name: "logo.png",
        isDirectory: false,
      },
      stream,
    };
  });
  const extractEntry = vi.fn().mockResolvedValue();
  const extractEntries = vi.fn().mockResolvedValue();
  const extractAll = vi.fn().mockResolvedValue();
  const extractAllTargetDir = vi
    .fn()
    .mockReturnValue(path.join(path.dirname(archivePath), path.basename(archivePath, ".zip")));
  const markTempPreviewUsed = vi.fn().mockResolvedValue();

  let messageHandler:
    | ((message: {
        type: string;
        path?: string;
        paths?: string[];
        targetPath?: string;
      }) => Promise<void>)
    | undefined;

  let fileWatcherChange: (() => void) | undefined;
  const clipboardWriteText = vi.fn().mockResolvedValue();
  const createFileSystemWatcher = vi.fn(() => ({
    onDidChange: vi.fn((cb: () => void) => {
      fileWatcherChange = cb;
      return { dispose: vi.fn() };
    }),
    dispose: vi.fn(),
  }));
  const getConfiguration = vi.fn(() => ({
    get: vi.fn((key: string, defaultValue: unknown) => {
      if (key === "listTimeoutMs") {
        return options.listTimeoutMs ?? defaultValue;
      }
      if (key === "watchArchiveFile") {
        return options.watchArchiveFile ?? true;
      }
      if (key === "textExtensions") {
        return options.textExtensions ?? [];
      }
      if (key === "maxTextPreviewBytes") {
        return options.maxTextPreviewBytes ?? defaultValue;
      }
      return defaultValue;
    }),
  }));

  const mockExtensionContext = {
    subscriptions: [] as unknown[],
    extensionUri: { fsPath: process.cwd() },
  };

  vi.doMock(
    "vscode",
    () => ({
      Uri: {
        file: (fsPath: string) => ({ fsPath }),
        parse: (value: string) => ({ value }),
      },
      // Minimal stub for vscode.RelativePattern (API expects a class-like constructor)
      RelativePattern:
        // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- matches VS Code's constructor-only RelativePattern
        class {
          constructor(_base: unknown, _pattern: string) {
            void _base;
            void _pattern;
          }
        },
      env: {
        clipboard: {
          writeText: clipboardWriteText,
        },
      },
      window: {
        showTextDocument,
        createOutputChannel,
        showOpenDialog,
        showWarningMessage,
      },
      workspace: {
        openTextDocument,
        getConfiguration,
        createFileSystemWatcher,
      },
      commands: {
        executeCommand,
      },
    }),
    { virtual: true },
  );
  vi.doMock("../archive/archive", () => ({
    listEntries,
    openEntryReadStream,
  }));
  vi.doMock("../archive/extract", () => ({
    extractEntry,
    extractEntries,
    extractAll,
    extractAllTargetDir,
  }));
  vi.doMock("../editor/archivePaths", () => ({
    cleanupTempPreviews: vi.fn().mockResolvedValue(),
    createTempPreviewPath: vi.fn().mockImplementation((zipPath: string, entryPath: string) => {
      return path.join(os.tmpdir(), "compress-preview", path.basename(zipPath), entryPath);
    }),
    getEntryExtractionTarget: vi
      .fn()
      .mockImplementation((baseDir: string, entryPath: string) => path.join(baseDir, entryPath)),
    markTempPreviewUsed,
    shouldReuseTempPreview: vi.fn().mockReturnValue(options.shouldReuseTempPreview ?? false),
  }));
  vi.doMock("../logger", () => ({
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
  }));

  const zipEditorExports = (await import("../editor/zipEditor")) as typeof zipEditorModule;
  const zipEditorTestBridge =
    (await import("../editor/zipEditorTestBridge")) as typeof zipEditorTestBridgeModule;
  const provider = new zipEditorExports.ZipPreviewEditorProvider(mockExtensionContext as never);
  const document = provider.openCustomDocument({ fsPath: archivePath }, {}, {});
  const panel = {
    viewColumn: 1,
    reveal,
    onDidDispose: vi.fn(),
    webview: {
      cspSource: "vscode-webview:",
      html: "",
      options: {},
      asWebviewUri: (uri: { fsPath: string }) => ({
        toString: () => `vscode-webview:/${encodeURIComponent(uri.fsPath)}`,
      }),
      postMessage,
      onDidReceiveMessage: (handler: typeof messageHandler) => {
        messageHandler = handler;
        return { dispose: vi.fn() };
      },
    },
  };

  provider.resolveCustomEditor(document, panel as never, {});
  if (options.useFakeTimers ?? true) {
    vi.advanceTimersByTime(100);
  }

  return {
    zipEditorModule: zipEditorExports,
    zipEditorTestBridge,
    archivePath,
    panel,
    listEntries,
    openEntryReadStream,
    openTextDocument,
    showTextDocument,
    executeCommand,
    showOpenDialog,
    showWarningMessage,
    extractEntry,
    extractEntries,
    extractAll,
    extractAllTargetDir,
    postMessage,
    markTempPreviewUsed,
    get messageHandler() {
      return messageHandler;
    },
    clipboardWriteText,
    createFileSystemWatcher,
    getConfiguration,
    triggerArchiveFileChange: () => {
      fileWatcherChange?.();
    },
  };
}

describe("ZipPreviewEditorProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("renders a file-not-found error when the archive is missing", async () => {
    const archivePath = path.join(os.tmpdir(), `missing-${Date.now()}.zip`);
    fs.rmSync(archivePath, { force: true });
    const harness = await createProviderHarness({ archivePath, ensureArchiveExists: false });
    await Promise.resolve();

    expect(harness.panel.webview.html).toContain("File not found.");
  });

  it("renders a listEntries failure in the initial HTML", async () => {
    const harness = await createProviderHarness({
      listEntriesError: new Error("boom"),
    });
    await Promise.resolve();

    expect(harness.panel.webview.html).toContain("boom");
  });

  it("reloads entries when the webview requests getEntries or retryLoad", async () => {
    const harness = await createProviderHarness();
    await Promise.resolve();

    expect(harness.listEntries).toHaveBeenCalledTimes(1);
    await harness.messageHandler?.({ type: "getEntries" });
    await harness.messageHandler?.({ type: "retryLoad" });

    expect(harness.listEntries).toHaveBeenCalledTimes(3);
  });

  it("increases the listing timeout on each retry and resets it on refresh", async () => {
    const harness = await createProviderHarness({ listTimeoutMs: 10_000 });
    await Promise.resolve();

    expect(harness.listEntries).toHaveBeenLastCalledWith(harness.archivePath, {
      timeoutMs: 10_000,
    });
    await harness.messageHandler?.({ type: "retryLoad" });
    expect(harness.listEntries).toHaveBeenLastCalledWith(harness.archivePath, {
      timeoutMs: 20_000,
    });
    await harness.messageHandler?.({ type: "retryLoad" });
    expect(harness.listEntries).toHaveBeenLastCalledWith(harness.archivePath, {
      timeoutMs: 30_000,
    });
    await harness.messageHandler?.({ type: "getEntries" });
    expect(harness.listEntries).toHaveBeenLastCalledWith(harness.archivePath, {
      timeoutMs: 10_000,
    });
  });

  it("opens text entries through the virtual document provider", async () => {
    const harness = await createProviderHarness();
    await Promise.resolve();

    await harness.messageHandler?.({ type: "openEntry", path: "docs/readme.txt" });

    expect(harness.openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.stringContaining("compress-preview://preview/docs/readme.txt?zip="),
      }),
    );
    expect(harness.showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { scheme: "compress-preview" } }),
      { preview: false },
    );
    expect(harness.postMessage).toHaveBeenCalledWith({ type: "openResult", success: true });
  });

  it("reports an openEntry failure back to the webview", async () => {
    const harness = await createProviderHarness({
      openTextDocumentError: new Error("open failed"),
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "openEntry", path: "docs/readme.txt" });

    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "openResult",
      success: false,
      error: "open failed",
    });
  });

  it("opens entries with configured custom text extensions", async () => {
    const harness = await createProviderHarness({
      textExtensions: ["toml"],
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "openEntry", path: "config/settings.toml" });

    expect(harness.openTextDocument).toHaveBeenCalledTimes(1);
    expect(harness.executeCommand).not.toHaveBeenCalled();
  });

  it("embeds host-classified kinds so configured text extensions are not shown as binary", async () => {
    const harness = await createProviderHarness({
      textExtensions: ["toml"],
      listEntriesResult: {
        entries: [
          { path: "config/settings.toml", name: "settings.toml", isDirectory: false },
          { path: "image.png", name: "image.png", isDirectory: false },
          { path: "docs/", name: "docs", isDirectory: true },
        ],
        isPartial: false,
        sizeBytes: 0,
      },
    });
    await Promise.resolve();

    const initialJson = harness.panel.webview.html.match(/id="initial-entries"[^>]*>([^<]+)/)?.[1];
    expect(initialJson).toBeDefined();
    const payload = JSON.parse(initialJson ?? "") as {
      entries: { path: string; kind: string }[];
    };
    expect(payload.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "config/settings.toml", kind: "text" }),
        expect.objectContaining({ path: "image.png", kind: "binary" }),
        expect.objectContaining({ path: "docs/", kind: "folder" }),
      ]),
    );
  });

  it("prompts before opening a listed text entry that exceeds the preview limit", async () => {
    const harness = await createProviderHarness({
      maxTextPreviewBytes: 1024,
      showWarningMessageResult: "Cancel",
      listEntriesResult: {
        entries: [
          {
            path: "huge.log",
            name: "huge.log",
            isDirectory: false,
            size: 4096,
          },
        ],
        isPartial: false,
        sizeBytes: 4096,
      },
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "openEntry", path: "huge.log" });

    expect(harness.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("text preview limit"),
      "Extract instead",
      "Open anyway",
      "Cancel",
    );
    expect(harness.openTextDocument).not.toHaveBeenCalled();
    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "openResult",
      success: false,
      error: "Cancelled",
    });
  });

  it("opens an oversized text preview once when the user overrides the limit", async () => {
    const harness = await createProviderHarness({
      maxTextPreviewBytes: 1024,
      showWarningMessageResult: "Open anyway",
      listEntriesResult: {
        entries: [
          {
            path: "huge.log",
            name: "huge.log",
            isDirectory: false,
            size: 4096,
          },
        ],
        isPartial: false,
        sizeBytes: 4096,
      },
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "openEntry", path: "huge.log" });

    expect(harness.openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.stringContaining("allowLarge=1"),
      }),
    );
    expect(harness.postMessage).toHaveBeenCalledWith({ type: "openResult", success: true });
  });

  it("extracts an oversized text entry when the preview prompt asks to extract", async () => {
    const harness = await createProviderHarness({
      maxTextPreviewBytes: 1024,
      showWarningMessageResult: "Extract instead",
      showOpenDialogResult: [{ fsPath: "/tmp/target" }],
      listEntriesResult: {
        entries: [
          {
            path: "huge.log",
            name: "huge.log",
            isDirectory: false,
            size: 4096,
          },
        ],
        isPartial: false,
        sizeBytes: 4096,
      },
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "openEntry", path: "huge.log" });

    expect(harness.openTextDocument).not.toHaveBeenCalled();
    expect(harness.extractEntry).toHaveBeenCalledWith(
      harness.archivePath,
      "huge.log",
      path.join("/tmp/target", "huge.log"),
    );
    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "extractResult",
      success: true,
      targetPath: path.join("/tmp/target", "huge.log"),
    });
  });

  it("prompts after a streamed text preview exceeds the limit", async () => {
    const oversized = new Error(
      "Text preview exceeds the configured limit of 1024 bytes. Extract the file or open it once with an override.",
    );
    oversized.name = "TextPreviewTooLargeError";
    const harness = await createProviderHarness({
      maxTextPreviewBytes: 1024,
      showWarningMessageResult: "Cancel",
      openTextDocumentError: oversized,
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "openEntry", path: "docs/readme.txt" });

    expect(harness.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("text preview limit"),
      "Extract instead",
      "Open anyway",
      "Cancel",
    );
    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "openResult",
      success: false,
      error: "Cancelled",
    });
  });

  it("opens binary entries from a temp preview file", async () => {
    const harness = await createProviderHarness({ useFakeTimers: false });
    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });

    await harness.messageHandler?.({ type: "openEntry", path: "images/logo.png" });

    expect(harness.executeCommand).toHaveBeenCalledWith(
      "vscode.open",
      expect.objectContaining({
        fsPath: expect.stringContaining(path.join("compress-preview", path.sep)),
      }),
      { preview: false },
    );
    expect(harness.markTempPreviewUsed).toHaveBeenCalledTimes(1);
  });

  it("reuses binary temp previews when the cached file is fresh", async () => {
    const harness = await createProviderHarness({
      shouldReuseTempPreview: true,
      useFakeTimers: false,
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });

    await harness.messageHandler?.({ type: "openEntry", path: "images/logo.png" });

    expect(harness.openEntryReadStream).not.toHaveBeenCalled();
    expect(harness.executeCommand).toHaveBeenCalledWith(
      "vscode.open",
      expect.objectContaining({
        fsPath: expect.stringContaining(path.join("compress-preview", path.sep)),
      }),
      { preview: false },
    );
    expect(harness.markTempPreviewUsed).toHaveBeenCalledTimes(1);
  });

  it("preserves nested paths when extracting a single entry", async () => {
    const harness = await createProviderHarness({
      showOpenDialogResult: [{ fsPath: "/tmp/target" }],
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractEntry", path: "nested/deeper/file.txt" });

    expect(harness.extractEntry).toHaveBeenCalledWith(
      harness.archivePath,
      "nested/deeper/file.txt",
      path.join("/tmp/target", "nested/deeper/file.txt"),
    );
  });

  it("reports extractEntry cancellation when no target is selected", async () => {
    const harness = await createProviderHarness({
      showOpenDialogResult: undefined,
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractEntry", path: "nested/deeper/file.txt" });

    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "extractResult",
      success: false,
      error: "Cancelled",
    });
  });

  it("reports extractEntry failures back to the webview", async () => {
    const harness = await createProviderHarness({
      showOpenDialogResult: [{ fsPath: "/tmp/target" }],
    });
    harness.extractEntry.mockRejectedValueOnce(new Error("extract failed"));
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractEntry", path: "nested/deeper/file.txt" });

    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "extractResult",
      success: false,
      error: "extract failed",
    });
  });

  it("extracts selected paths after choosing a destination folder", async () => {
    const harness = await createProviderHarness({
      showOpenDialogResult: [{ fsPath: "/tmp/selected-out" }],
    });
    await Promise.resolve();

    await harness.messageHandler?.({
      type: "extractSelected",
      paths: ["docs/", "readme.txt"],
    });

    expect(harness.extractEntries).toHaveBeenCalledWith(
      harness.archivePath,
      ["docs/", "readme.txt"],
      "/tmp/selected-out",
      { conflictMode: "merge" },
    );
    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "extractResult",
      success: true,
      targetPath: "/tmp/selected-out",
    });
  });

  it("reports extractSelected cancellation when no target is selected", async () => {
    const harness = await createProviderHarness({
      showOpenDialogResult: undefined,
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractSelected", paths: ["readme.txt"] });

    expect(harness.extractEntries).not.toHaveBeenCalled();
    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "extractResult",
      success: false,
      error: "Cancelled",
    });
  });

  it("reports extractSelected failures back to the webview", async () => {
    const harness = await createProviderHarness({
      showOpenDialogResult: [{ fsPath: "/tmp/selected-out" }],
    });
    harness.extractEntries.mockRejectedValueOnce(new Error("batch extract failed"));
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractSelected", paths: ["readme.txt"] });

    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "extractResult",
      success: false,
      error: "batch extract failed",
    });
  });

  it("extracts all to the default sibling directory when it does not exist", async () => {
    const harness = await createProviderHarness();
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractAll" });

    expect(harness.extractAll).toHaveBeenCalledWith(
      harness.archivePath,
      harness.extractAllTargetDir.mock.results[0]?.value,
      { overwrite: false },
    );
  });

  it("merges into the default extract-all target after confirmation", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-merge-"));
    const archivePath = path.join(tempDir, "sample.zip");
    fs.writeFileSync(archivePath, "zip");
    fs.mkdirSync(path.join(tempDir, "sample"), { recursive: true });
    const harness = await createProviderHarness({
      archivePath,
      showWarningMessageResult: "Merge",
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractAll" });

    expect(harness.extractAll).toHaveBeenCalledWith(archivePath, path.join(tempDir, "sample"), {
      conflictMode: "merge",
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("replaces the default extract-all target after a second confirmation", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-overwrite-"));
    const archivePath = path.join(tempDir, "sample.zip");
    fs.writeFileSync(archivePath, "zip");
    fs.mkdirSync(path.join(tempDir, "sample"), { recursive: true });
    const harness = await createProviderHarness({
      archivePath,
      showWarningMessageResults: ["Replace folder", "Replace folder"],
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractAll" });

    expect(harness.showWarningMessage).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("will delete all of its current contents"),
      "Replace folder",
      "Cancel",
    );
    expect(harness.extractAll).toHaveBeenCalledWith(archivePath, path.join(tempDir, "sample"), {
      conflictMode: "replace",
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("supports choosing another folder for extract-all", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-choose-"));
    const archivePath = path.join(tempDir, "sample.zip");
    const targetDir = path.join(tempDir, "sample");
    const parentDir = path.join(tempDir, "parent");
    fs.writeFileSync(archivePath, "zip");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(path.join(parentDir, "sample"), { recursive: true });
    const harness = await createProviderHarness({
      archivePath,
      showWarningMessageResults: ["Choose other folder", "Merge"],
      showOpenDialogResult: [{ fsPath: parentDir }],
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractAll" });

    expect(harness.extractAll).toHaveBeenCalledWith(archivePath, path.join(parentDir, "sample"), {
      conflictMode: "merge",
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reports cancellation when choosing another folder is abandoned", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-choose-cancel-"));
    const archivePath = path.join(tempDir, "sample.zip");
    fs.writeFileSync(archivePath, "zip");
    fs.mkdirSync(path.join(tempDir, "sample"), { recursive: true });
    const harness = await createProviderHarness({
      archivePath,
      showWarningMessageResult: "Choose other folder",
      showOpenDialogResult: undefined,
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractAll" });

    expect(harness.extractAll).not.toHaveBeenCalled();
    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "extractResult",
      success: false,
      error: "Cancelled",
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reports extract-all cancellation when the conflict dialog is declined", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-cancel-"));
    const archivePath = path.join(tempDir, "sample.zip");
    fs.writeFileSync(archivePath, "zip");
    fs.mkdirSync(path.join(tempDir, "sample"), { recursive: true });
    const harness = await createProviderHarness({
      archivePath,
      showWarningMessageResult: "Cancel",
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractAll" });

    expect(harness.extractAll).not.toHaveBeenCalled();
    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "extractResult",
      success: false,
      error: "Cancelled",
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("cancels replace when the destructive confirmation is declined", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-replace-cancel-"));
    const archivePath = path.join(tempDir, "sample.zip");
    fs.writeFileSync(archivePath, "zip");
    fs.mkdirSync(path.join(tempDir, "sample"), { recursive: true });
    const harness = await createProviderHarness({
      archivePath,
      showWarningMessageResults: ["Replace folder", "Cancel"],
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractAll" });

    expect(harness.extractAll).not.toHaveBeenCalled();
    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "extractResult",
      success: false,
      error: "Cancelled",
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("uses the configured list timeout when listing entries", async () => {
    const harness = await createProviderHarness({ listTimeoutMs: 25_000 });
    await Promise.resolve();

    expect(harness.listEntries).toHaveBeenCalledWith(harness.archivePath, { timeoutMs: 25_000 });
  });

  it("reloads entries when the archive file watcher fires", async () => {
    const harness = await createProviderHarness();
    await Promise.resolve();

    expect(harness.listEntries).toHaveBeenCalledTimes(1);
    harness.triggerArchiveFileChange();
    await Promise.resolve();

    expect(harness.listEntries).toHaveBeenCalledTimes(2);
  });

  it("skips the file watcher when watchArchiveFile is false", async () => {
    const harness = await createProviderHarness({ watchArchiveFile: false });
    await Promise.resolve();

    expect(harness.createFileSystemWatcher).not.toHaveBeenCalled();
  });

  it("copies an entry path to the clipboard", async () => {
    const harness = await createProviderHarness();
    await Promise.resolve();

    await harness.messageHandler?.({ type: "copyPath", path: "docs/readme.txt" });

    expect(harness.clipboardWriteText).toHaveBeenCalledWith("docs/readme.txt");
    expect(harness.postMessage).toHaveBeenCalledWith({
      type: "copyResult",
      success: true,
      path: "docs/readme.txt",
    });
  });

  it("supports test overrides for timeout and captured messages", async () => {
    const harness = await createProviderHarness();
    await Promise.resolve();

    harness.zipEditorTestBridge.setZipEditorTestOverrides({ listTimeoutMs: 1 });
    await harness.messageHandler?.({ type: "retryLoad" });

    expect(harness.listEntries).toHaveBeenLastCalledWith(harness.archivePath, { timeoutMs: 1000 });
    harness.zipEditorTestBridge.clearZipEditorTestMessages();
    expect(harness.zipEditorTestBridge.getZipEditorTestState()?.sentMessages).toEqual([]);
    harness.zipEditorTestBridge.resetZipEditorTestState();
    expect(harness.zipEditorTestBridge.getZipEditorTestState()).toBeUndefined();
    await expect(
      harness.zipEditorTestBridge.dispatchZipEditorTestMessage({ type: "retryLoad" }),
    ).rejects.toThrow("No active compress preview editor session");
  });
});
