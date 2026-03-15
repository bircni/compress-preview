import type * as extensionModule from "../extension";

describe("extension", () => {
  afterEach(() => {
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
      const registerZipContentProvider = jest.fn();
      const setOutputChannel = jest.fn();
      const providerInstance = {};
      const ZipPreviewEditorProvider = jest.fn(() => providerInstance);

      jest.doMock(
        "vscode",
        () => ({
          window: {
            createOutputChannel,
            registerCustomEditorProvider,
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

      const { activate, deactivate } = require("../extension") as typeof extensionModule;
      const context = { subscriptions: [] as unknown[] };

      activate(context as never);

      expect(createOutputChannel).toHaveBeenCalledWith("Zip Preview");
      expect(setOutputChannel).toHaveBeenCalledWith(channel);
      expect(registerZipContentProvider).toHaveBeenCalledWith(context);
      expect(ZipPreviewEditorProvider).toHaveBeenCalledTimes(1);
      expect(registerCustomEditorProvider).toHaveBeenCalledWith("zipPreview", providerInstance, {
        webviewOptions: { retainContextWhenHidden: true },
      });
      expect(context.subscriptions).toEqual([channel, registration]);
      expect(() => deactivate()).not.toThrow();
    });
  });
});
