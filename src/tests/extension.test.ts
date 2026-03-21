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
    jest.resetModules();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("registers the output channel, content provider, and custom editor", () => {
    jest.isolateModules(() => {
      const channel = { appendLine: jest.fn(), dispose: jest.fn() };
      const registration = { dispose: jest.fn() };
      const createOutputChannel = jest.fn(() => channel);
      const registerCustomEditorProvider = jest.fn(() => registration);
      const registerCommand = jest.fn(() => registration);
      const registerZipContentProvider = jest.fn();
      const setOutputChannel = jest.fn();
      const providerInstance = {};
      const ZipPreviewEditorProvider = jest.fn(() => providerInstance);
      const getState = jest.fn(() => "state");
      const postMessage = jest.fn();
      const setOverrides = jest.fn();
      const clearMessages = jest.fn();
      const reset = jest.fn();

      jest.doMock(
        "vscode",
        () => ({
          window: {
            createOutputChannel,
            registerCustomEditorProvider,
          },
          commands: {
            registerCommand,
          },
        }),
        { virtual: true },
      );
      jest.doMock("../editor/zipContentProvider", () => ({
        registerZipContentProvider,
      }));
      jest.doMock("../logger", () => ({
        setOutputChannel,
      }));
      jest.doMock("../editor/zipEditor", () => ({
        ZipPreviewEditorProvider,
      }));
      jest.doMock("../editor/zipEditorTestBridge", () => ({
        getZipEditorTestState: getState,
        dispatchZipEditorTestMessage: postMessage,
        setZipEditorTestOverrides: setOverrides,
        clearZipEditorTestMessages: clearMessages,
        resetZipEditorTestState: reset,
      }));

      const { activate, deactivate } = require("../extension") as typeof extensionModule;
      const context = { subscriptions: [] as unknown[] };

      activate(context as never);

      expect(createOutputChannel).toHaveBeenCalledWith("Compress Preview");
      expect(setOutputChannel).toHaveBeenCalledWith(channel);
      expect(registerZipContentProvider).toHaveBeenCalledWith(context);
      expect(ZipPreviewEditorProvider).toHaveBeenCalledTimes(1);
      expect(registerCustomEditorProvider).toHaveBeenCalledWith(
        "compressPreview",
        providerInstance,
        {
          webviewOptions: { retainContextWhenHidden: true },
        },
      );
      expect(registerCommand).not.toHaveBeenCalled();
      expect(context.subscriptions).toEqual([channel, registration]);
      expect(() => deactivate()).not.toThrow();
    });
  });

  it("registers test-only commands when the test env flag is enabled", () => {
    process.env.COMPRESS_PREVIEW_ENABLE_TEST_COMMANDS = "1";

    jest.isolateModules(() => {
      const channel = { appendLine: jest.fn(), dispose: jest.fn() };
      const registration = { dispose: jest.fn() };
      const createOutputChannel = jest.fn(() => channel);
      const registerCustomEditorProvider = jest.fn(() => registration);
      const registerCommand = jest.fn(() => registration);
      const registerZipContentProvider = jest.fn();
      const setOutputChannel = jest.fn();
      const providerInstance = {};
      const ZipPreviewEditorProvider = jest.fn(() => providerInstance);
      const getState = jest.fn(() => "state");
      const postMessage = jest.fn();
      const setOverrides = jest.fn();
      const clearMessages = jest.fn();
      const reset = jest.fn();

      jest.doMock(
        "vscode",
        () => ({
          window: {
            createOutputChannel,
            registerCustomEditorProvider,
          },
          commands: {
            registerCommand,
          },
        }),
        { virtual: true },
      );
      jest.doMock("../editor/zipContentProvider", () => ({
        registerZipContentProvider,
      }));
      jest.doMock("../logger", () => ({
        setOutputChannel,
      }));
      jest.doMock("../editor/zipEditor", () => ({
        ZipPreviewEditorProvider,
      }));
      jest.doMock("../editor/zipEditorTestBridge", () => ({
        getZipEditorTestState: getState,
        dispatchZipEditorTestMessage: postMessage,
        setZipEditorTestOverrides: setOverrides,
        clearZipEditorTestMessages: clearMessages,
        resetZipEditorTestState: reset,
      }));

      const { activate } = require("../extension") as typeof extensionModule;
      const context = { subscriptions: [] as unknown[] };

      activate(context as never);

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
});
