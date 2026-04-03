import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { listEntries, openEntryReadStream } from "../archive/archive";
import { extractEntry, extractAll, extractAllTargetDir } from "../archive/extract";
import { logger } from "../logger";
import { getInitialHtml } from "../webview/content";
import { readTempPreviewMaxAgeMs } from "./compressPreviewConfig.js";
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

function clampListTimeoutMs(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(300_000, Math.max(1_000, Math.round(value)));
}

function readListTimeoutMs(): number {
  const config = vscode.workspace.getConfiguration("compress-preview");
  const raw = config.get("listTimeoutMs", DEFAULT_TIMEOUT_MS);
  return clampListTimeoutMs(raw, DEFAULT_TIMEOUT_MS);
}

class ZipDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {}
}

export class ZipPreviewEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

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
      listTimeoutMs: () => getZipEditorTestListTimeoutMs(readListTimeoutMs()),
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
      cleanupTempPreviews: () => cleanupTempPreviews(readTempPreviewMaxAgeMs()),
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
      logInfo: (message, payload) => {
        logger.info(message, payload);
      },
      logError: (message, error) => {
        logger.error(message, error);
      },
      onBinaryPreviewPath: (previewPath) => {
        setZipEditorTestBinaryPreviewPath(webviewPanel, previewPath);
      },
      writeClipboardText: async (text) => {
        await vscode.env.clipboard.writeText(text);
      },
    });

    const watchArchive =
      vscode.workspace.getConfiguration("compress-preview").get("watchArchiveFile") !== false;
    if (watchArchive) {
      const pattern = new vscode.RelativePattern(
        vscode.Uri.file(path.dirname(zipPath)),
        path.basename(zipPath),
      );
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      const watcherSub = watcher.onDidChange(() => {
        void controller.loadAndSetHtml();
      });
      webviewPanel.onDidDispose(() => {
        watcherSub.dispose();
        watcher.dispose();
      });
    }

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
