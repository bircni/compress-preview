import { afterEach, describe, expect, it, vi } from "vitest";
import type * as zipEditorTestBridgeModule from "../editor/zipEditorTestBridge";

describe("zipEditorTestBridge", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("applies timeout overrides and tracks active session state", async () => {
    const showOpenDialog = vi.fn();
    const showWarningMessage = vi.fn();

    vi.doMock(
      "vscode",
      () => ({
        Uri: {
          file: (fsPath: string) => ({ fsPath }),
        },
        window: {
          showOpenDialog,
          showWarningMessage,
        },
      }),
      { virtual: true },
    );

    const bridge =
      (await import("../editor/zipEditorTestBridge")) as typeof zipEditorTestBridgeModule;
    const handleMessage = vi.fn().mockResolvedValue(undefined);

    expect(bridge.getZipEditorTestListTimeoutMs(10_000)).toBe(10_000);
    bridge.setZipEditorTestOverrides({ listTimeoutMs: 1 });
    expect(bridge.getZipEditorTestListTimeoutMs(10_000)).toBe(1);

    bridge.setActiveZipEditorTestSession({
      owner: "panel",
      zipPath: "/tmp/archive.zip",
      getHtml: () => "<html>ok</html>",
      handleMessage,
    });
    bridge.captureZipEditorTestMessage("panel", { type: "openResult", success: true });
    bridge.setZipEditorTestBinaryPreviewPath("panel", "/tmp/preview.png");

    expect(bridge.getZipEditorTestState()).toEqual({
      zipPath: "/tmp/archive.zip",
      html: "<html>ok</html>",
      sentMessages: [{ type: "openResult", success: true }],
      lastBinaryPreviewPath: "/tmp/preview.png",
    });

    bridge.clearZipEditorTestMessages();
    expect(bridge.getZipEditorTestState()?.sentMessages).toEqual([]);

    await bridge.dispatchZipEditorTestMessage({ type: "retryLoad" });
    expect(handleMessage).toHaveBeenCalledWith({ type: "retryLoad" });

    bridge.clearActiveZipEditorTestSession("other-panel");
    expect(bridge.getZipEditorTestState()).toBeDefined();

    bridge.clearActiveZipEditorTestSession("panel");
    expect(bridge.getZipEditorTestState()).toBeUndefined();
  });

  it("uses dialog overrides before falling back to vscode", async () => {
    const showOpenDialog = vi.fn().mockResolvedValue([{ fsPath: "/tmp/from-vscode" }]);
    const showWarningMessage = vi.fn().mockResolvedValue("Overwrite");

    vi.doMock(
      "vscode",
      () => ({
        Uri: {
          file: (fsPath: string) => ({ fsPath }),
        },
        window: {
          showOpenDialog,
          showWarningMessage,
        },
      }),
      { virtual: true },
    );

    const bridge =
      (await import("../editor/zipEditorTestBridge")) as typeof zipEditorTestBridgeModule;

    bridge.setZipEditorTestOverrides({
      nextOpenDialogPaths: ["/tmp/override"],
      nextWarningChoice: "Cancel",
    });

    const openDialog = bridge.createZipEditorOpenDialogHandler();
    const warningMessage = bridge.createZipEditorWarningMessageHandler();

    await expect(openDialog({ canSelectFolders: true })).resolves.toEqual([
      { fsPath: "/tmp/override" },
    ]);
    await expect(warningMessage("Folder exists", "Overwrite", "Cancel")).resolves.toBe("Cancel");

    await expect(openDialog({ canSelectFolders: true })).resolves.toEqual([
      { fsPath: "/tmp/from-vscode" },
    ]);
    await expect(warningMessage("Folder exists", "Overwrite", "Cancel")).resolves.toBe("Overwrite");
  });

  it("resets overrides and rejects dispatch without an active session", async () => {
    vi.doMock(
      "vscode",
      () => ({
        Uri: {
          file: (fsPath: string) => ({ fsPath }),
        },
        window: {
          showOpenDialog: vi.fn(),
          showWarningMessage: vi.fn(),
        },
      }),
      { virtual: true },
    );

    const bridge =
      (await import("../editor/zipEditorTestBridge")) as typeof zipEditorTestBridgeModule;

    bridge.setZipEditorTestOverrides({
      listTimeoutMs: 1,
      nextOpenDialogPaths: ["/tmp/override"],
      nextWarningChoice: "Cancel",
    });
    bridge.resetZipEditorTestState();

    expect(bridge.getZipEditorTestListTimeoutMs(10_000)).toBe(10_000);
    await expect(bridge.dispatchZipEditorTestMessage({ type: "retryLoad" })).rejects.toThrow(
      "No active compress preview editor session",
    );
  });
});
