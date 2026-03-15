import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PassThrough } from "stream";

describe("ZipPreviewEditorProvider", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("opens binary entries from a temp preview file", async () => {
    const executeCommand = jest.fn().mockResolvedValue(undefined);
    const showTextDocument = jest.fn().mockResolvedValue(undefined);
    const openTextDocument = jest.fn();
    const createOutputChannel = jest.fn();
    const showOpenDialog = jest.fn();
    const showWarningMessage = jest.fn();
    const onDidReceiveMessage = jest.fn();
    const postMessage = jest.fn();
    const reveal = jest.fn();
    let messageHandler:
      | ((message: { type: string; path?: string; targetPath?: string }) => Promise<void>)
      | undefined;

    const listEntries = jest.fn().mockResolvedValue({
      entries: [],
      isPartial: false,
      sizeBytes: 0,
    });
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
      extractEntry: jest.fn(),
      extractAll: jest.fn(),
      extractAllTargetDir: jest.fn(),
    }));
    jest.doMock("../logger", () => ({
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
    }));

    const { ZipPreviewEditorProvider } = require("../editor/zipEditor");
    const provider = new ZipPreviewEditorProvider();
    const document = provider.openCustomDocument({ fsPath: "/tmp/archive.zip" }, {}, {});
    const panel = {
      viewColumn: 1,
      reveal,
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

    provider.resolveCustomEditor(document, panel, {});
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(messageHandler).toBeDefined();

    await messageHandler?.({ type: "openEntry", path: "images/logo.png" });

    expect(executeCommand).toHaveBeenCalledWith(
      "vscode.open",
      expect.objectContaining({
        fsPath: expect.stringContaining(path.join("compress-preview", path.sep)),
      }),
      { preview: false },
    );
    const tempUri = executeCommand.mock.calls[0][1] as { fsPath: string };
    expect(tempUri.fsPath.startsWith(path.join(os.tmpdir(), "compress-preview"))).toBe(true);
    expect(tempUri.fsPath.endsWith(path.join("images", "logo.png"))).toBe(true);
    fs.rmSync(path.join(os.tmpdir(), "compress-preview"), { recursive: true, force: true });
  });

  it("preserves nested paths when extracting a single entry", async () => {
    jest.useFakeTimers();

    const listEntries = jest.fn().mockResolvedValue({
      entries: [],
      isPartial: false,
      sizeBytes: 0,
    });
    const extractEntry = jest.fn().mockResolvedValue(undefined);
    const showOpenDialog = jest.fn().mockResolvedValue([{ fsPath: "/tmp/target" }]);
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
          showTextDocument: jest.fn(),
          createOutputChannel: jest.fn(),
          showOpenDialog,
          showWarningMessage: jest.fn(),
        },
        workspace: {
          openTextDocument: jest.fn(),
        },
        commands: {
          executeCommand: jest.fn(),
        },
      }),
      { virtual: true },
    );
    jest.doMock("../archive/archive", () => ({
      listEntries,
      openEntryReadStream: jest.fn(),
    }));
    jest.doMock("../archive/extract", () => ({
      extractEntry,
      extractAll: jest.fn(),
      extractAllTargetDir: jest.fn(),
    }));
    jest.doMock("../logger", () => ({
      logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
    }));

    const { ZipPreviewEditorProvider } = require("../editor/zipEditor");
    const provider = new ZipPreviewEditorProvider();
    const document = provider.openCustomDocument({ fsPath: "/tmp/archive.zip" }, {}, {});
    const panel = {
      viewColumn: 1,
      reveal: jest.fn(),
      webview: {
        cspSource: "vscode-webview:",
        html: "",
        options: {},
        postMessage: jest.fn(),
        onDidReceiveMessage: (handler: typeof messageHandler) => {
          messageHandler = handler;
          return { dispose: jest.fn() };
        },
      },
    };

    provider.resolveCustomEditor(document, panel, {});
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    await messageHandler?.({ type: "extractEntry", path: "nested/deeper/file.txt" });

    expect(extractEntry).toHaveBeenCalledWith(
      "/tmp/archive.zip",
      "nested/deeper/file.txt",
      path.join("/tmp/target", "nested", "deeper", "file.txt"),
    );
  });
});
