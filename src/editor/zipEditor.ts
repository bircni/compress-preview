import * as fs from "fs";
import * as vscode from "vscode";
import { listEntries, openEntryReadStream } from "../archive/archive";
import { extractEntry, extractAll, extractAllTargetDir } from "../archive/extract";
import { logger } from "../logger";
import { getInitialHtml } from "../webview/content";
import {
  cleanupTempPreviews,
  createTempPreviewPath,
  getEntryExtractionTarget,
  markTempPreviewUsed,
  shouldReuseTempPreview,
} from "./archivePaths";
import { makeZipPreviewUri } from "./zipContentProvider";
import { createZipEditorController, type WebviewHostMessage } from "./zipEditorController";
import {
  captureZipEditorTestMessage,
  clearActiveZipEditorTestSession,
  createZipEditorOpenDialogHandler,
  createZipEditorWarningMessageHandler,
  getZipEditorTestListTimeoutMs,
  setActiveZipEditorTestSession,
  setZipEditorTestBinaryPreviewPath,
} from "./zipEditorTestBridge";

const DEFAULT_TIMEOUT_MS = 10_000;

class ZipDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {}
}

export class ZipPreviewEditorProvider implements vscode.CustomReadonlyEditorProvider<ZipDocument> {
  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): vscode.CustomDocument | Thenable<ZipDocument> {
    return new ZipDocument(uri);
  }

  resolveCustomEditor(
    document: ZipDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ) {
    const zipPath = document.uri.fsPath;
    const cspSource = webviewPanel.webview.cspSource;
    logger.info("compress preview resolveCustomEditor", {
      zipPath,
      uriScheme: document.uri.scheme,
      cspSourceLength: cspSource.length,
    });
    webviewPanel.webview.options = { enableScripts: true };

    const controller = createZipEditorController({
      zipPath,
      cspSource,
      listTimeoutMs: () => getZipEditorTestListTimeoutMs(DEFAULT_TIMEOUT_MS),
      setHtml: (html) => {
        webviewPanel.webview.html = html;
      },
      reveal: () => {
        webviewPanel.reveal(webviewPanel.viewColumn);
      },
      postMessage: (message) => {
        captureZipEditorTestMessage(webviewPanel, message);
        return webviewPanel.webview.postMessage(message);
      },
      createTextPreviewUri: makeZipPreviewUri,
      createFileUri: (fsPath) => vscode.Uri.file(fsPath),
      getInitialHtml,
      listEntries,
      openEntryReadStream,
      extractEntry,
      extractAll,
      extractAllTargetDir,
      cleanupTempPreviews,
      createTempPreviewPath,
      getEntryExtractionTarget,
      markTempPreviewUsed,
      shouldReuseTempPreview,
      existsSync: fs.existsSync,
      openTextDocument: (uri) => vscode.workspace.openTextDocument(uri),
      showTextDocument: (documentToShow, options) =>
        vscode.window.showTextDocument(documentToShow, options),
      executeCommand: (command, uri, options) =>
        vscode.commands.executeCommand(command, uri, options),
      showOpenDialog: createZipEditorOpenDialogHandler(),
      showWarningMessage: createZipEditorWarningMessageHandler(),
      logInfo: (message, payload) => logger.info(message, payload),
      logError: (message, error) => logger.error(message, error),
      onBinaryPreviewPath: (previewPath) => {
        setZipEditorTestBinaryPreviewPath(webviewPanel, previewPath);
      },
    });

    // Defer so the webview panel is mounted and ready; 100ms avoids first-set being ignored in some hosts.
    setTimeout(() => void controller.loadAndSetHtml(), 100);

    setActiveZipEditorTestSession({
      owner: webviewPanel,
      zipPath,
      getHtml: () => webviewPanel.webview.html,
      handleMessage: controller.handleMessage,
    });

    webviewPanel.webview.onDidReceiveMessage((message: unknown) =>
      controller.handleMessage(message as WebviewHostMessage),
    );
    webviewPanel.onDidDispose(() => {
      clearActiveZipEditorTestSession(webviewPanel);
    });

    // Initial load is triggered when the webview sends getEntries (after it loads).
  }
}
