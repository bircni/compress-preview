import * as path from "node:path";
import * as fs from "node:fs";
import type * as vscode from "vscode";
import type { EntryContentStream } from "../archive/entry";
import type { ListEntriesOptions, ListEntriesResult } from "../archive/archive";
import type { ExtractAllOptions } from "../archive/extract";
import type { InitialEntriesPayload } from "../webview/content";
import { DEFAULT_MAX_TEXT_PREVIEW_BYTES, isTextPreviewTooLargeError } from "./textPreview";

const DEFAULT_TIMEOUT_MS = 10_000;

const DEFAULT_TEXT_EXTENSIONS = new Set([
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
  maxTextPreviewBytes?: number | (() => number);
  setHtml: (html: string) => void;
  reveal: () => void;
  postMessage: (message: unknown) => Thenable<boolean> | Promise<boolean> | boolean | undefined;
  createTextPreviewUri: (
    zipPath: string,
    entryPath: string,
    options?: { allowLarge?: boolean },
  ) => vscode.Uri;
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
  writeClipboardText: (text: string) => Promise<void>;
  textExtensions?: string[];
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
    writeStream.on("finish", () => {
      resolve();
    });
    writeStream.on("error", reject);
    stream.on("error", reject);
  });
  return createFileUri(targetPath);
}

function isTextEntryName(name: string, textExtensions: Set<string>): boolean {
  const ext = path.extname(name).toLowerCase().replace(/^\./, "");
  return textExtensions.has(ext) || !ext;
}

const LARGE_PREVIEW_EXTRACT = "Extract instead";
const LARGE_PREVIEW_OPEN = "Open anyway";
const LARGE_PREVIEW_CANCEL = "Cancel";

function resolveConfiguredNumber(
  value: number | (() => number) | undefined,
  fallback: number,
): number {
  if (typeof value === "function") {
    return value();
  }
  return value ?? fallback;
}

function formatPreviewLimit(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
}

function isPathWithinRoot(rootDir: string, candidatePath: string): boolean {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(candidatePath);
  const relativePath = path.relative(resolvedRoot, resolvedCandidate);
  return (
    relativePath === "" ||
    relativePath === "." ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export function createZipEditorController(deps: ZipEditorControllerDeps): {
  loadAndSetHtml: () => Promise<void>;
  handleMessage: (msg: WebviewHostMessage) => Promise<void>;
} {
  const textExtensions = new Set(DEFAULT_TEXT_EXTENSIONS);
  const configuredExtensions = deps.textExtensions ?? [];
  for (const extension of configuredExtensions) {
    const normalized = extension.trim().toLowerCase().replace(/^\./, "");
    if (normalized) {
      textExtensions.add(normalized);
    }
  }

  const listedSizes = new Map<string, number>();

  const postMessage = async (message: unknown): Promise<void> => {
    await deps.postMessage(message);
  };

  const loadAndSetHtml = async (): Promise<void> => {
    try {
      if (!deps.existsSync(deps.zipPath)) {
        listedSizes.clear();
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
      listedSizes.clear();
      for (const entry of result.entries) {
        if (entry.size !== undefined) {
          listedSizes.set(entry.path.replace(/\/$/, ""), entry.size);
        }
      }
      const entriesForWebview = result.entries.map(({ mtime, ...rest }) => ({
        ...rest,
        ...(mtime !== undefined && {
          mtime: mtime instanceof Date ? mtime.toISOString() : mtime,
        }),
      }));
      deps.setHtml(
        deps.getInitialHtml(deps.cspSource, {
          entries: entriesForWebview,
          isPartial: result.isPartial,
          ...(result.message !== undefined && { message: result.message }),
        }),
      );
      deps.reveal();
    } catch (error) {
      listedSizes.clear();
      const message = error instanceof Error ? error.message : String(error);
      deps.setHtml(deps.getInitialHtml(deps.cspSource, { error: message }));
    }
  };

  const extractOneEntry = async (
    entryPath: string,
    requestedTargetPath?: string,
  ): Promise<void> => {
    try {
      let targetPath: string | undefined = requestedTargetPath;
      let extractionRoot: string | undefined;
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
          extractionRoot = folder;
          targetPath = deps.getEntryExtractionTarget(folder, entryPath);
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
      if (extractionRoot && !isPathWithinRoot(extractionRoot, targetPath)) {
        await postMessage({
          type: "extractResult",
          success: false,
          error: `Unsafe extraction target path: ${targetPath}`,
        });
        return;
      }
      await deps.extractEntry(deps.zipPath, entryPath, targetPath);
      await postMessage({
        type: "extractResult",
        success: true,
        targetPath,
      });
    } catch (error) {
      deps.logError("Extract entry failed", error);
      const message = error instanceof Error ? error.message : String(error);
      await postMessage({
        type: "extractResult",
        success: false,
        error: message,
      });
    }
  };

  const promptLargeTextPreview = async (entryPath: string, limitBytes: number): Promise<void> => {
    const choice = await deps.showWarningMessage(
      `"${path.basename(entryPath)}" is larger than the text preview limit (${formatPreviewLimit(limitBytes)}). Extract it instead, or open it anyway this once.`,
      LARGE_PREVIEW_EXTRACT,
      LARGE_PREVIEW_OPEN,
      LARGE_PREVIEW_CANCEL,
    );
    if (choice === LARGE_PREVIEW_EXTRACT) {
      await extractOneEntry(entryPath);
      return;
    }
    if (choice === LARGE_PREVIEW_OPEN) {
      const uri = deps.createTextPreviewUri(deps.zipPath, entryPath, { allowLarge: true });
      const doc = await deps.openTextDocument(uri);
      await deps.showTextDocument(doc, { preview: false });
      await postMessage({ type: "openResult", success: true });
      return;
    }
    await postMessage({
      type: "openResult",
      success: false,
      error: "Cancelled",
    });
  };

  const handleMessage = async (msg: WebviewHostMessage): Promise<void> => {
    deps.logInfo("webview message received", { type: msg.type });
    if (msg.type === "getEntries" || msg.type === "retryLoad") {
      await loadAndSetHtml();
      return;
    }

    if (msg.type === "copyPath" && msg.path) {
      try {
        await deps.writeClipboardText(msg.path);
        await postMessage({ type: "copyResult", success: true, path: msg.path });
      } catch (error) {
        deps.logError("Copy path failed", error);
        const message = error instanceof Error ? error.message : String(error);
        await postMessage({
          type: "copyResult",
          success: false,
          error: message,
        });
      }
      return;
    }

    if (msg.type === "openEntry" && msg.path) {
      const entryPath = msg.path;
      try {
        if (isTextEntryName(path.basename(entryPath), textExtensions)) {
          const limitBytes = resolveConfiguredNumber(
            deps.maxTextPreviewBytes,
            DEFAULT_MAX_TEXT_PREVIEW_BYTES,
          );
          const knownSize = listedSizes.get(entryPath.replace(/\/$/, ""));
          if (limitBytes > 0 && knownSize !== undefined && knownSize > limitBytes) {
            await promptLargeTextPreview(entryPath, limitBytes);
            return;
          }
          const uri = deps.createTextPreviewUri(deps.zipPath, entryPath);
          try {
            const doc = await deps.openTextDocument(uri);
            await deps.showTextDocument(doc, { preview: false });
          } catch (error) {
            if (isTextPreviewTooLargeError(error) && limitBytes > 0) {
              await promptLargeTextPreview(entryPath, limitBytes);
              return;
            }
            throw error;
          }
        } else {
          await deps.cleanupTempPreviews();
          const tempPath = deps.createTempPreviewPath(deps.zipPath, entryPath);
          let tempUri: vscode.Uri;
          if (deps.shouldReuseTempPreview(deps.zipPath, tempPath)) {
            tempUri = deps.createFileUri(tempPath);
          } else {
            const { stream } = await deps.openEntryReadStream(deps.zipPath, entryPath);
            tempUri = await writeStreamToFile(stream, tempPath, deps.createFileUri);
          }
          await deps.markTempPreviewUsed(tempPath);
          deps.onBinaryPreviewPath?.(tempUri.fsPath);
          await deps.executeCommand("vscode.open", tempUri, { preview: false });
        }
        await postMessage({ type: "openResult", success: true });
      } catch (error) {
        deps.logError("Open entry failed", error);
        const message = error instanceof Error ? error.message : String(error);
        await postMessage({
          type: "openResult",
          success: false,
          error: message,
        });
      }
      return;
    }

    if (msg.type === "extractEntry" && msg.path) {
      await extractOneEntry(msg.path, msg.targetPath);
      return;
    }

    if (msg.type === "extractAll") {
      try {
        const targetDir = deps.extractAllTargetDir(deps.zipPath);
        const archiveFolderName = path.basename(targetDir);
        let extractionTarget = targetDir;

        const postCancelled = async (): Promise<void> => {
          await postMessage({
            type: "extractResult",
            success: false,
            error: "Cancelled",
          });
        };

        const resolveConflictMode = async (
          folderName: string,
        ): Promise<"merge" | "replace" | "choose" | "cancelled"> => {
          const choice = await deps.showWarningMessage(
            `Folder "${folderName}" already exists.`,
            "Merge",
            "Replace folder",
            "Choose other folder",
            "Cancel",
          );
          if (choice === "Merge") {
            return "merge";
          }
          if (choice === "Replace folder") {
            const confirm = await deps.showWarningMessage(
              `Replacing folder "${folderName}" will delete all of its current contents.`,
              "Replace folder",
              "Cancel",
            );
            return confirm === "Replace folder" ? "replace" : "cancelled";
          }
          if (choice === "Choose other folder") {
            return "choose";
          }
          return "cancelled";
        };

        let conflictMode: "merge" | "replace" | undefined;
        for (;;) {
          if (!deps.existsSync(extractionTarget)) {
            break;
          }
          const decision = await resolveConflictMode(path.basename(extractionTarget));
          if (decision === "cancelled") {
            await postCancelled();
            return;
          }
          if (decision === "merge" || decision === "replace") {
            conflictMode = decision;
            break;
          }
          const chosen = await deps.showOpenDialog({
            canSelectFolders: true,
            canSelectMany: false,
            title: "Select parent folder for extraction",
          });
          const folder = chosen?.[0]?.fsPath;
          if (!folder) {
            await postCancelled();
            return;
          }
          extractionTarget = path.join(folder, archiveFolderName);
        }

        await deps.extractAll(
          deps.zipPath,
          extractionTarget,
          conflictMode === undefined ? { overwrite: false } : { conflictMode },
        );
        await postMessage({
          type: "extractResult",
          success: true,
          targetPath: extractionTarget,
        });
      } catch (error) {
        deps.logError("Extract all failed", error);
        const message = error instanceof Error ? error.message : String(error);
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
