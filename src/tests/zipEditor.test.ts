import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PassThrough } from "stream";
import type * as zipEditorModule from "../editor/zipEditor";
import type * as zipEditorTestBridgeModule from "../editor/zipEditorTestBridge";

type ProviderHarnessOptions = {
  archivePath?: string;
  ensureArchiveExists?: boolean;
  useFakeTimers?: boolean;
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
};

function createProviderHarness(options: ProviderHarnessOptions = {}) {
  if (options.useFakeTimers ?? true) {
    jest.useFakeTimers();
  } else {
    jest.useRealTimers();
  }

  const archivePath =
    options.archivePath ?? path.join(os.tmpdir(), `compress-preview-test-${Date.now()}.zip`);
  if (!path.isAbsolute(archivePath)) {
    throw new Error("archivePath must be absolute");
  }
  if ((options.ensureArchiveExists ?? true) && !fs.existsSync(archivePath)) {
    fs.writeFileSync(archivePath, "fixture");
  }

  const executeCommand = jest.fn().mockResolvedValue(undefined);
  const showTextDocument = jest.fn().mockResolvedValue(undefined);
  const openTextDocument = options.openTextDocumentError
    ? jest.fn().mockRejectedValue(options.openTextDocumentError)
    : jest.fn().mockResolvedValue({ uri: { scheme: "compress-preview" } });
  const createOutputChannel = jest.fn();
  const showOpenDialog = jest.fn().mockResolvedValue(options.showOpenDialogResult);
  const showWarningMessage = jest.fn().mockResolvedValue(options.showWarningMessageResult);
  const postMessage = jest.fn().mockResolvedValue(true);
  const reveal = jest.fn();
  const listEntries = options.listEntriesError
    ? jest.fn().mockRejectedValue(options.listEntriesError)
    : jest.fn().mockResolvedValue(
        options.listEntriesResult ?? {
          entries: [],
          isPartial: false,
          sizeBytes: 0,
        },
      );
  const openEntryReadStream = jest.fn().mockImplementation(async () => {
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
  const extractEntry = jest.fn().mockResolvedValue(undefined);
  const extractAll = jest.fn().mockResolvedValue(undefined);
  const extractAllTargetDir = jest
    .fn()
    .mockReturnValue(path.join(path.dirname(archivePath), path.basename(archivePath, ".zip")));
  const markTempPreviewUsed = jest.fn().mockResolvedValue(undefined);

  let messageHandler:
    | ((message: { type: string; path?: string; targetPath?: string }) => Promise<void>)
    | undefined;

  jest.doMock(
    "vscode",
    () => ({
      Uri: {
        file: (fsPath: string) => ({ fsPath }),
        parse: (value: string) => ({ value }),
      },
      window: {
        showTextDocument,
        createOutputChannel,
        showOpenDialog,
        showWarningMessage,
      },
      workspace: {
        openTextDocument,
      },
      commands: {
        executeCommand,
      },
    }),
    { virtual: true },
  );
  jest.doMock("../archive/archive", () => ({
    listEntries,
    openEntryReadStream,
  }));
  jest.doMock("../archive/extract", () => ({
    extractEntry,
    extractAll,
    extractAllTargetDir,
  }));
  jest.doMock("../editor/archivePaths", () => ({
    cleanupTempPreviews: jest.fn().mockResolvedValue(undefined),
    createTempPreviewPath: jest.fn().mockImplementation((zipPath: string, entryPath: string) => {
      return path.join(os.tmpdir(), "compress-preview", path.basename(zipPath), entryPath);
    }),
    getEntryExtractionTarget: jest
      .fn()
      .mockImplementation((baseDir: string, entryPath: string) => path.join(baseDir, entryPath)),
    markTempPreviewUsed,
    shouldReuseTempPreview: jest.fn().mockReturnValue(options.shouldReuseTempPreview ?? false),
  }));
  jest.doMock("../logger", () => ({
    logger: {
      info: jest.fn(),
      error: jest.fn(),
    },
  }));

  const zipEditorExports = require("../editor/zipEditor") as typeof zipEditorModule;
  const zipEditorTestBridge =
    require("../editor/zipEditorTestBridge") as typeof zipEditorTestBridgeModule;
  const provider = new zipEditorExports.ZipPreviewEditorProvider();
  const document = provider.openCustomDocument({ fsPath: archivePath }, {}, {});
  const panel = {
    viewColumn: 1,
    reveal,
    onDidDispose: jest.fn(),
    webview: {
      cspSource: "vscode-webview:",
      html: "",
      options: {},
      postMessage,
      onDidReceiveMessage: (handler: typeof messageHandler) => {
        messageHandler = handler;
        return { dispose: jest.fn() };
      },
    },
  };

  provider.resolveCustomEditor(document, panel as never, {});
  if (options.useFakeTimers ?? true) {
    jest.advanceTimersByTime(100);
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
    extractAll,
    extractAllTargetDir,
    postMessage,
    markTempPreviewUsed,
    get messageHandler() {
      return messageHandler;
    },
  };
}

describe("ZipPreviewEditorProvider", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("renders a file-not-found error when the archive is missing", async () => {
    const archivePath = path.join(os.tmpdir(), `missing-${Date.now()}.zip`);
    fs.rmSync(archivePath, { force: true });
    const harness = createProviderHarness({ archivePath, ensureArchiveExists: false });
    await Promise.resolve();

    expect(harness.panel.webview.html).toContain("File not found.");
  });

  it("renders a listEntries failure in the initial HTML", async () => {
    const harness = createProviderHarness({
      listEntriesError: new Error("boom"),
    });
    await Promise.resolve();

    expect(harness.panel.webview.html).toContain("boom");
  });

  it("reloads entries when the webview requests getEntries or retryLoad", async () => {
    const harness = createProviderHarness();
    await Promise.resolve();

    expect(harness.listEntries).toHaveBeenCalledTimes(1);
    await harness.messageHandler?.({ type: "getEntries" });
    await harness.messageHandler?.({ type: "retryLoad" });

    expect(harness.listEntries).toHaveBeenCalledTimes(3);
  });

  it("opens text entries through the virtual document provider", async () => {
    const harness = createProviderHarness();
    await Promise.resolve();

    await harness.messageHandler?.({ type: "openEntry", path: "docs/readme.txt" });

    expect(harness.openTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.stringContaining("compress-preview://preview?zip="),
      }),
    );
    expect(harness.showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { scheme: "compress-preview" } }),
      { preview: false },
    );
    expect(harness.postMessage).toHaveBeenCalledWith({ type: "openResult", success: true });
  });

  it("reports an openEntry failure back to the webview", async () => {
    const harness = createProviderHarness({
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

  it("opens binary entries from a temp preview file", async () => {
    const harness = createProviderHarness({ useFakeTimers: false });
    await new Promise((resolve) => setTimeout(resolve, 120));

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
    const harness = createProviderHarness({ shouldReuseTempPreview: true, useFakeTimers: false });
    await new Promise((resolve) => setTimeout(resolve, 120));

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
    const harness = createProviderHarness({
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
    const harness = createProviderHarness({
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
    const harness = createProviderHarness({
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

  it("extracts all to the default sibling directory when it does not exist", async () => {
    const harness = createProviderHarness();
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractAll" });

    expect(harness.extractAll).toHaveBeenCalledWith(
      harness.archivePath,
      harness.extractAllTargetDir.mock.results[0]?.value,
      { overwrite: false },
    );
  });

  it("overwrites the default extract-all target after confirmation", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-overwrite-"));
    const archivePath = path.join(tempDir, "sample.zip");
    fs.writeFileSync(archivePath, "zip");
    fs.mkdirSync(path.join(tempDir, "sample"), { recursive: true });
    const harness = createProviderHarness({
      archivePath,
      showWarningMessageResult: "Overwrite",
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractAll" });

    expect(harness.extractAll).toHaveBeenCalledWith(archivePath, path.join(tempDir, "sample"), {
      overwrite: true,
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
    const harness = createProviderHarness({
      archivePath,
      showWarningMessageResult: "Choose other folder",
      showOpenDialogResult: [{ fsPath: parentDir }],
    });
    await Promise.resolve();

    await harness.messageHandler?.({ type: "extractAll" });

    expect(harness.extractAll).toHaveBeenCalledWith(archivePath, path.join(parentDir, "sample"), {
      overwrite: true,
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reports cancellation when choosing another folder is abandoned", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-choose-cancel-"));
    const archivePath = path.join(tempDir, "sample.zip");
    fs.writeFileSync(archivePath, "zip");
    fs.mkdirSync(path.join(tempDir, "sample"), { recursive: true });
    const harness = createProviderHarness({
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

  it("reports extract-all cancellation when overwrite is declined", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-cancel-"));
    const archivePath = path.join(tempDir, "sample.zip");
    fs.writeFileSync(archivePath, "zip");
    fs.mkdirSync(path.join(tempDir, "sample"), { recursive: true });
    const harness = createProviderHarness({
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

  it("supports test overrides for timeout and captured messages", async () => {
    const harness = createProviderHarness();
    await Promise.resolve();

    harness.zipEditorTestBridge.setZipEditorTestOverrides({ listTimeoutMs: 1 });
    await harness.messageHandler?.({ type: "retryLoad" });

    expect(harness.listEntries).toHaveBeenLastCalledWith(harness.archivePath, { timeoutMs: 1 });
    harness.zipEditorTestBridge.clearZipEditorTestMessages();
    expect(harness.zipEditorTestBridge.getZipEditorTestState()?.sentMessages).toEqual([]);
    harness.zipEditorTestBridge.resetZipEditorTestState();
    expect(harness.zipEditorTestBridge.getZipEditorTestState()).toBeUndefined();
    await expect(
      harness.zipEditorTestBridge.dispatchZipEditorTestMessage({ type: "retryLoad" }),
    ).rejects.toThrow("No active compress preview editor session");
  });
});
