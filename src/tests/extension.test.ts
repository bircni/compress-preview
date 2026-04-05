import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as extensionModule from "../extension";

describe("extension", () => {
  const originalEnableTestCommands = process.env.COMPRESS_PREVIEW_ENABLE_TEST_COMMANDS;

  beforeEach(() => {
    delete process.env.COMPRESS_PREVIEW_ENABLE_TEST_COMMANDS;
  });

  afterEach(() => {
    if (originalEnableTestCommands == null) {
      delete process.env.COMPRESS_PREVIEW_ENABLE_TEST_COMMANDS;
    } else {
      process.env.COMPRESS_PREVIEW_ENABLE_TEST_COMMANDS = originalEnableTestCommands;
    }
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("registers the output channel, content provider, and custom editor", async () => {
    vi.resetModules();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() };
    const registration = { dispose: vi.fn() };
    const createOutputChannel = vi.fn(() => channel);
    const registerCustomEditorProvider = vi.fn(() => registration);
    const registerCommand = vi.fn(() => registration);
    const registerZipContentProvider = vi.fn();
    const setOutputChannel = vi.fn();
    const providerInstance = {};
    // eslint-disable-next-line @typescript-eslint/naming-convention, prefer-arrow-callback -- constructor mock
    const ZipPreviewEditorProvider = vi.fn(function ZipPreviewEditorProvider(_context: unknown) {
      return providerInstance;
    });
    const getState = vi.fn(() => "state");
    const postMessage = vi.fn();
    const setOverrides = vi.fn();
    const clearMessages = vi.fn();
    const reset = vi.fn();

    vi.doMock(
      "vscode",
      () => ({
        window: {
          createOutputChannel,
          registerCustomEditorProvider,
        },
        workspace: {
          getConfiguration: vi.fn(() => ({
            get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
          })),
        },
        commands: {
          registerCommand,
        },
      }),
      { virtual: true },
    );
    vi.doMock("../editor/zipContentProvider", () => ({
      registerZipContentProvider,
    }));
    vi.doMock("../logger", () => ({
      setOutputChannel,
    }));
    vi.doMock("../editor/zipEditor", () => ({
      ZipPreviewEditorProvider,
    }));
    vi.doMock("../editor/zipEditorTestBridge", () => ({
      getZipEditorTestState: getState,
      dispatchZipEditorTestMessage: postMessage,
      setZipEditorTestOverrides: setOverrides,
      clearZipEditorTestMessages: clearMessages,
      resetZipEditorTestState: reset,
    }));

    const { activate, deactivate } = (await import("../extension")) as typeof extensionModule;
    const context = { subscriptions: [] as unknown[] };

    activate(context as never);

    expect(createOutputChannel).toHaveBeenCalledWith("Compress Preview");
    expect(setOutputChannel).toHaveBeenCalledWith(channel);
    expect(registerZipContentProvider).toHaveBeenCalledWith(context);
    expect(ZipPreviewEditorProvider).toHaveBeenCalledTimes(1);
    expect(ZipPreviewEditorProvider).toHaveBeenCalledWith(context);
    expect(registerCustomEditorProvider).toHaveBeenCalledWith("compressPreview", providerInstance, {
      webviewOptions: { retainContextWhenHidden: true },
    });
    expect(registerCommand).not.toHaveBeenCalled();
    expect(context.subscriptions).toEqual([channel, registration]);
    expect(() => {
      deactivate();
    }).not.toThrow();
  });

  it("registers test-only commands when the test env flag is enabled", async () => {
    process.env.COMPRESS_PREVIEW_ENABLE_TEST_COMMANDS = "1";

    vi.resetModules();
    const channel = { appendLine: vi.fn(), dispose: vi.fn() };
    const registration = { dispose: vi.fn() };
    const createOutputChannel = vi.fn(() => channel);
    const registerCustomEditorProvider = vi.fn(() => registration);
    const registerCommand = vi.fn(() => registration);
    const registerZipContentProvider = vi.fn();
    const setOutputChannel = vi.fn();
    const providerInstance = {};
    // eslint-disable-next-line @typescript-eslint/naming-convention, prefer-arrow-callback -- constructor mock
    const ZipPreviewEditorProvider = vi.fn(function ZipPreviewEditorProvider(_context: unknown) {
      return providerInstance;
    });
    const getState = vi.fn(() => "state");
    const postMessage = vi.fn();
    const setOverrides = vi.fn();
    const clearMessages = vi.fn();
    const reset = vi.fn();

    vi.doMock(
      "vscode",
      () => ({
        window: {
          createOutputChannel,
          registerCustomEditorProvider,
        },
        workspace: {
          getConfiguration: vi.fn(() => ({
            get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
          })),
        },
        commands: {
          registerCommand,
        },
      }),
      { virtual: true },
    );
    vi.doMock("../editor/zipContentProvider", () => ({
      registerZipContentProvider,
    }));
    vi.doMock("../logger", () => ({
      setOutputChannel,
    }));
    vi.doMock("../editor/zipEditor", () => ({
      ZipPreviewEditorProvider,
    }));
    vi.doMock("../editor/zipEditorTestBridge", () => ({
      getZipEditorTestState: getState,
      dispatchZipEditorTestMessage: postMessage,
      setZipEditorTestOverrides: setOverrides,
      clearZipEditorTestMessages: clearMessages,
      resetZipEditorTestState: reset,
    }));

    const { activate } = (await import("../extension")) as typeof extensionModule;
    const context = { subscriptions: [] as unknown[] };

    activate(context as never);

    expect(ZipPreviewEditorProvider).toHaveBeenCalledWith(context);
    expect(registerCommand).toHaveBeenCalledTimes(5);
    expect(registerCommand.mock.calls[0][1]()).toBe("state");
    registerCommand.mock.calls[1][1]({ type: "retryLoad" });
    expect(postMessage).toHaveBeenCalledWith({ type: "retryLoad" });
    registerCommand.mock.calls[2][1](undefined);
    expect(setOverrides).toHaveBeenCalledWith({});
    registerCommand.mock.calls[3][1]();
    expect(clearMessages).toHaveBeenCalled();
    registerCommand.mock.calls[4][1]();
    expect(reset).toHaveBeenCalled();
    expect(context.subscriptions).toEqual([
      channel,
      registration,
      registration,
      registration,
      registration,
      registration,
      registration,
    ]);
  });
});
