import * as vscode from "vscode";
import { cleanupTempPreviews } from "./editor/archivePaths.js";
import { registerZipContentProvider } from "./editor/zipContentProvider.js";
import {
  clearZipEditorTestMessages,
  dispatchZipEditorTestMessage,
  getZipEditorTestState,
  resetZipEditorTestState,
  setZipEditorTestOverrides,
  type ZipEditorTestOverrides,
} from "./editor/zipEditorTestBridge.js";
import type { WebviewHostMessage } from "./editor/zipEditorController.js";
import { setOutputChannel } from "./logger.js";
import { ZipPreviewEditorProvider } from "./editor/zipEditor.js";

const ENABLE_TEST_COMMANDS_ENV = "COMPRESS_PREVIEW_ENABLE_TEST_COMMANDS";

function shouldRegisterTestCommands(): boolean {
  return process.env[ENABLE_TEST_COMMANDS_ENV] === "1";
}

export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel("Compress Preview");
  context.subscriptions.push(channel);
  setOutputChannel(channel);
  void cleanupTempPreviews();

  registerZipContentProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider("compressPreview", new ZipPreviewEditorProvider(), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  if (shouldRegisterTestCommands()) {
    context.subscriptions.push(
      vscode.commands.registerCommand("compressPreview.__test.getState", () =>
        getZipEditorTestState(),
      ),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand("compressPreview.__test.postMessage", (message: unknown) =>
        dispatchZipEditorTestMessage(message as WebviewHostMessage),
      ),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand("compressPreview.__test.setOverrides", (overrides: unknown) =>
        setZipEditorTestOverrides((overrides ?? {}) as ZipEditorTestOverrides),
      ),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand("compressPreview.__test.clearMessages", () =>
        clearZipEditorTestMessages(),
      ),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand("compressPreview.__test.reset", () =>
        resetZipEditorTestState(),
      ),
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
