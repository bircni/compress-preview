import * as vscode from "vscode";
import { ZipPreviewEditorProvider } from "./editor/zipEditor.js";
import { cleanupTempPreviews } from "./editor/archivePaths.js";
import { registerZipContentProvider } from "./editor/zipContentProvider.js";
import { setOutputChannel } from "./logger.js";

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
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
