import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs";
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

const DEFAULT_TIMEOUT_MS = 10_000;

const TEXT_EXTENSIONS = new Set([
  "txt",
  "json",
  "md",
  "xml",
  "html",
  "htm",
  "css",
  "js",
  "ts",
  "jsx",
  "tsx",
  "log",
  "yml",
  "yaml",
  "csv",
  "json5",
  "sh",
  "bat",
  "cmd",
  "ps1",
  "r",
  "py",
  "sql",
  "env",
  "ini",
  "cfg",
  "conf",
  "text",
  "rst",
  "adoc",
]);

class ZipDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {}
}

async function writeStreamToFile(
  stream: NodeJS.ReadableStream,
  targetPath: string,
): Promise<vscode.Uri> {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const writeStream = fs.createWriteStream(targetPath);
  stream.pipe(writeStream);
  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", () => resolve());
    writeStream.on("error", reject);
    stream.on("error", reject);
  });
  return vscode.Uri.file(targetPath);
}

function isTextEntryName(name: string): boolean {
  const ext = path.extname(name).toLowerCase().replace(/^\./, "");
  return TEXT_EXTENSIONS.has(ext) || !ext;
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
    // Set HTML only once, after we have entries. Defer so the webview panel is ready to accept content.
    const loadAndSetHtml = async (): Promise<void> => {
      try {
        if (!fs.existsSync(zipPath)) {
          webviewPanel.webview.html = getInitialHtml(cspSource, {
            error: "File not found.",
          });
          return;
        }
        const result = await listEntries(zipPath, { timeoutMs: DEFAULT_TIMEOUT_MS });
        const entriesForWebview = result.entries.map((e) => ({
          ...e,
          mtime: e.mtime instanceof Date ? e.mtime.toISOString() : e.mtime,
        }));
        webviewPanel.webview.html = getInitialHtml(cspSource, {
          entries: entriesForWebview,
          isPartial: result.isPartial,
          message: result.message,
        });
        webviewPanel.reveal(webviewPanel.viewColumn);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        webviewPanel.webview.html = getInitialHtml(cspSource, { error: message });
      }
    };

    // Defer so the webview panel is mounted and ready; 100ms avoids first-set being ignored in some hosts.
    setTimeout(() => void loadAndSetHtml(), 100);

    webviewPanel.webview.onDidReceiveMessage(
      async (msg: { type: string; path?: string; targetPath?: string }) => {
        logger.info("webview message received", { type: msg.type });
        if (msg.type === "getEntries" || msg.type === "retryLoad") {
          await loadAndSetHtml();
          return;
        }
        if (msg.type === "openEntry" && msg.path) {
          const entryPath = msg.path;
          try {
            if (isTextEntryName(path.basename(entryPath))) {
              const uri = makeZipPreviewUri(zipPath, entryPath);
              const doc = await vscode.workspace.openTextDocument(uri);
              await vscode.window.showTextDocument(doc, { preview: false });
              webviewPanel.webview.postMessage({ type: "openResult", success: true });
            } else {
              await cleanupTempPreviews();
              const tempPath = createTempPreviewPath(zipPath, entryPath);
              const reuseTempPreview = shouldReuseTempPreview(zipPath, tempPath);
              const tempUri = reuseTempPreview
                ? vscode.Uri.file(tempPath)
                : await openEntryReadStream(zipPath, entryPath).then(async ({ stream }) => {
                    const uri = await writeStreamToFile(stream, tempPath);
                    await markTempPreviewUsed(tempPath);
                    return uri;
                  });
              if (reuseTempPreview) {
                await markTempPreviewUsed(tempPath);
              }
              await vscode.commands.executeCommand("vscode.open", tempUri, { preview: false });
              webviewPanel.webview.postMessage({ type: "openResult", success: true });
            }
          } catch (err) {
            logger.error("Open entry failed", err);
            const message = err instanceof Error ? err.message : String(err);
            webviewPanel.webview.postMessage({
              type: "openResult",
              success: false,
              error: message,
            });
          }
          return;
        }
        if (msg.type === "extractEntry" && msg.path) {
          try {
            let targetPath: string | undefined = msg.targetPath;
            if (!targetPath) {
              const chosen = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: "Extract here",
                title: "Select destination folder",
              });
              const folder = chosen?.[0]?.fsPath;
              if (folder) {
                targetPath = getEntryExtractionTarget(folder, msg.path);
              }
            }
            if (!targetPath) {
              webviewPanel.webview.postMessage({
                type: "extractResult",
                success: false,
                error: "Cancelled",
              });
              return;
            }
            await extractEntry(zipPath, msg.path, targetPath);
            webviewPanel.webview.postMessage({
              type: "extractResult",
              success: true,
              targetPath,
            });
          } catch (err) {
            logger.error("Extract entry failed", err);
            const message = err instanceof Error ? err.message : String(err);
            webviewPanel.webview.postMessage({
              type: "extractResult",
              success: false,
              error: message,
            });
          }
          return;
        }
        if (msg.type === "extractAll") {
          try {
            const targetDir = extractAllTargetDir(zipPath);
            const archiveFolderName = path.basename(targetDir);
            let extractionTarget = targetDir;
            let overwrite = false;
            if (fs.existsSync(targetDir)) {
              const choice = await vscode.window.showWarningMessage(
                `Folder "${archiveFolderName}" already exists.`,
                "Overwrite",
                "Cancel",
                "Choose other folder",
              );
              if (choice === "Cancel" || !choice) {
                webviewPanel.webview.postMessage({
                  type: "extractResult",
                  success: false,
                  error: "Cancelled",
                });
                return;
              }
              if (choice === "Choose other folder") {
                const chosen = await vscode.window.showOpenDialog({
                  canSelectFolders: true,
                  canSelectMany: false,
                  title: "Select parent folder for extraction",
                });
                const folder = chosen?.[0]?.fsPath;
                if (!folder) {
                  webviewPanel.webview.postMessage({
                    type: "extractResult",
                    success: false,
                    error: "Cancelled",
                  });
                  return;
                }
                extractionTarget = path.join(folder, archiveFolderName);
                overwrite = fs.existsSync(extractionTarget);
              } else {
                overwrite = true;
              }
            }
            await extractAll(zipPath, extractionTarget, { overwrite });
            webviewPanel.webview.postMessage({
              type: "extractResult",
              success: true,
              targetPath: extractionTarget,
            });
          } catch (err) {
            logger.error("Extract all failed", err);
            const message = err instanceof Error ? err.message : String(err);
            webviewPanel.webview.postMessage({
              type: "extractResult",
              success: false,
              error: message,
            });
          }
        }
      },
    );

    // Initial load is triggered when the webview sends getEntries (after it loads).
  }
}
