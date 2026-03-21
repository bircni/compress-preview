import * as path from "path";
import * as fs from "fs";
import type * as vscode from "vscode";
import type { EntryContentStream } from "../archive/entry";
import type { ListEntriesOptions, ListEntriesResult } from "../archive/archive";
import type { ExtractAllOptions } from "../archive/extract";
import type { InitialEntriesPayload } from "../webview/content";

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

export type WebviewHostMessage = {
  type: string;
  path?: string;
  targetPath?: string;
};

type OpenDialogResult = readonly vscode.Uri[] | undefined;

export type ZipEditorControllerDeps = {
  zipPath: string;
  cspSource: string;
  listTimeoutMs?: number | (() => number);
  setHtml: (html: string) => void;
  reveal: () => void;
  postMessage: (message: unknown) => Thenable<boolean> | Promise<boolean> | boolean | void;
  createTextPreviewUri: (zipPath: string, entryPath: string) => vscode.Uri;
  createFileUri: (fsPath: string) => vscode.Uri;
  getInitialHtml: (cspSource: string, initialData?: InitialEntriesPayload) => string;
  listEntries: (archivePath: string, options?: ListEntriesOptions) => Promise<ListEntriesResult>;
  openEntryReadStream: (archivePath: string, entryPath: string) => Promise<EntryContentStream>;
  extractEntry: (archivePath: string, entryPath: string, outPath: string) => Promise<void>;
  extractAll: (archivePath: string, outDir: string, options?: ExtractAllOptions) => Promise<void>;
  extractAllTargetDir: (archivePath: string) => string;
  cleanupTempPreviews: () => Promise<void>;
  createTempPreviewPath: (zipPath: string, entryPath: string) => string;
  getEntryExtractionTarget: (baseDir: string, entryPath: string) => string;
  markTempPreviewUsed: (tempPreviewPath: string) => Promise<void>;
  shouldReuseTempPreview: (archivePath: string, tempPreviewPath: string) => boolean;
  existsSync: typeof fs.existsSync;
  openTextDocument: (
    uri: vscode.Uri,
  ) => Thenable<vscode.TextDocument> | Promise<vscode.TextDocument>;
  showTextDocument: (
    document: vscode.TextDocument,
    options: vscode.TextDocumentShowOptions,
  ) => Thenable<unknown> | Promise<unknown>;
  executeCommand: (
    command: string,
    uri: vscode.Uri,
    options: { preview: boolean },
  ) => Thenable<unknown> | Promise<unknown>;
  showOpenDialog: (options: vscode.OpenDialogOptions) => Promise<OpenDialogResult>;
  showWarningMessage: (message: string, ...items: string[]) => Promise<string | undefined>;
  logInfo: (message: string, payload?: Record<string, unknown>) => void;
  logError: (message: string, error: unknown) => void;
  onBinaryPreviewPath?: (previewPath: string) => void;
};

async function writeStreamToFile(
  stream: NodeJS.ReadableStream,
  targetPath: string,
  createFileUri: (fsPath: string) => vscode.Uri,
): Promise<vscode.Uri> {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const writeStream = fs.createWriteStream(targetPath);
  stream.pipe(writeStream);
  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", () => resolve());
    writeStream.on("error", reject);
    stream.on("error", reject);
  });
  return createFileUri(targetPath);
}

function isTextEntryName(name: string): boolean {
  const ext = path.extname(name).toLowerCase().replace(/^\./, "");
  return TEXT_EXTENSIONS.has(ext) || !ext;
}

export function createZipEditorController(deps: ZipEditorControllerDeps): {
  loadAndSetHtml: () => Promise<void>;
  handleMessage: (msg: WebviewHostMessage) => Promise<void>;
} {
  const postMessage = async (message: unknown): Promise<void> => {
    await deps.postMessage(message);
  };

  const loadAndSetHtml = async (): Promise<void> => {
    try {
      if (!deps.existsSync(deps.zipPath)) {
        deps.setHtml(
          deps.getInitialHtml(deps.cspSource, {
            error: "File not found.",
          }),
        );
        return;
      }
      const result = await deps.listEntries(deps.zipPath, {
        timeoutMs:
          typeof deps.listTimeoutMs === "function"
            ? deps.listTimeoutMs()
            : (deps.listTimeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      const entriesForWebview = result.entries.map((entry) => ({
        ...entry,
        mtime: entry.mtime instanceof Date ? entry.mtime.toISOString() : entry.mtime,
      }));
      deps.setHtml(
        deps.getInitialHtml(deps.cspSource, {
          entries: entriesForWebview,
          isPartial: result.isPartial,
          message: result.message,
        }),
      );
      deps.reveal();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.setHtml(deps.getInitialHtml(deps.cspSource, { error: message }));
    }
  };

  const handleMessage = async (msg: WebviewHostMessage): Promise<void> => {
    deps.logInfo("webview message received", { type: msg.type });
    if (msg.type === "getEntries" || msg.type === "retryLoad") {
      await loadAndSetHtml();
      return;
    }

    if (msg.type === "openEntry" && msg.path) {
      const entryPath = msg.path;
      try {
        if (isTextEntryName(path.basename(entryPath))) {
          const uri = deps.createTextPreviewUri(deps.zipPath, entryPath);
          const doc = await deps.openTextDocument(uri);
          await deps.showTextDocument(doc, { preview: false });
          await postMessage({ type: "openResult", success: true });
        } else {
          await deps.cleanupTempPreviews();
          const tempPath = deps.createTempPreviewPath(deps.zipPath, entryPath);
          const reuseTempPreview = deps.shouldReuseTempPreview(deps.zipPath, tempPath);
          const tempUri = reuseTempPreview
            ? deps.createFileUri(tempPath)
            : await deps.openEntryReadStream(deps.zipPath, entryPath).then(async ({ stream }) => {
                const uri = await writeStreamToFile(stream, tempPath, deps.createFileUri);
                await deps.markTempPreviewUsed(tempPath);
                return uri;
              });
          if (reuseTempPreview) {
            await deps.markTempPreviewUsed(tempPath);
          }
          deps.onBinaryPreviewPath?.(tempUri.fsPath);
          await deps.executeCommand("vscode.open", tempUri, { preview: false });
          await postMessage({ type: "openResult", success: true });
        }
      } catch (err) {
        deps.logError("Open entry failed", err);
        const message = err instanceof Error ? err.message : String(err);
        await postMessage({
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
          const chosen = await deps.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Extract here",
            title: "Select destination folder",
          });
          const folder = chosen?.[0]?.fsPath;
          if (folder) {
            targetPath = deps.getEntryExtractionTarget(folder, msg.path);
          }
        }
        if (!targetPath) {
          await postMessage({
            type: "extractResult",
            success: false,
            error: "Cancelled",
          });
          return;
        }
        await deps.extractEntry(deps.zipPath, msg.path, targetPath);
        await postMessage({
          type: "extractResult",
          success: true,
          targetPath,
        });
      } catch (err) {
        deps.logError("Extract entry failed", err);
        const message = err instanceof Error ? err.message : String(err);
        await postMessage({
          type: "extractResult",
          success: false,
          error: message,
        });
      }
      return;
    }

    if (msg.type === "extractAll") {
      try {
        const targetDir = deps.extractAllTargetDir(deps.zipPath);
        const archiveFolderName = path.basename(targetDir);
        let extractionTarget = targetDir;
        let overwrite = false;
        if (deps.existsSync(targetDir)) {
          const choice = await deps.showWarningMessage(
            `Folder "${archiveFolderName}" already exists.`,
            "Overwrite",
            "Cancel",
            "Choose other folder",
          );
          if (choice === "Cancel" || !choice) {
            await postMessage({
              type: "extractResult",
              success: false,
              error: "Cancelled",
            });
            return;
          }
          if (choice === "Choose other folder") {
            const chosen = await deps.showOpenDialog({
              canSelectFolders: true,
              canSelectMany: false,
              title: "Select parent folder for extraction",
            });
            const folder = chosen?.[0]?.fsPath;
            if (!folder) {
              await postMessage({
                type: "extractResult",
                success: false,
                error: "Cancelled",
              });
              return;
            }
            extractionTarget = path.join(folder, archiveFolderName);
            overwrite = deps.existsSync(extractionTarget);
          } else {
            overwrite = true;
          }
        }
        await deps.extractAll(deps.zipPath, extractionTarget, { overwrite });
        await postMessage({
          type: "extractResult",
          success: true,
          targetPath: extractionTarget,
        });
      } catch (err) {
        deps.logError("Extract all failed", err);
        const message = err instanceof Error ? err.message : String(err);
        await postMessage({
          type: "extractResult",
          success: false,
          error: message,
        });
      }
    }
  };

  return {
    loadAndSetHtml,
    handleMessage,
  };
}
