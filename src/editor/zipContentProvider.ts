/**
 * TextDocumentContentProvider for compress-preview:// URIs.
 * Resolves to the text content of an entry inside a zip (read-only).
 */

import * as vscode from "vscode";
import { openEntryReadStream } from "../archive/archive";
import { readMaxTextPreviewBytes } from "./compressPreviewConfig";
import { readTextPreviewStream } from "./textPreview";

const SCHEME = "compress-preview";

export type ZipPreviewUriOptions = {
  allowLarge?: boolean;
};

export class ZipContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const zipPath = params.get("zip") ?? "";
    const entryPath = params.get("entry") ?? uri.path.replace(/^\//, "");
    if (!zipPath || !entryPath) {
      throw new Error("Invalid compress-preview URI");
    }
    const { stream } = await openEntryReadStream(zipPath, entryPath);
    const allowLarge = params.get("allowLarge") === "1";
    const maxBytes = allowLarge ? 0 : readMaxTextPreviewBytes();
    return readTextPreviewStream(stream, maxBytes);
  }
}

export function registerZipContentProvider(context: vscode.ExtensionContext): void {
  const provider = new ZipContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),
  );
}

/**
 * Build the preview URI for an entry.
 *
 * The entry path is carried in the URI path as well as the query: VS Code derives the editor
 * tab label and the language mode from the URI path, so leaving it empty shows a nameless tab
 * and falls back to plain text. The query stays authoritative when resolving the content.
 */
export function makeZipPreviewUri(
  zipPath: string,
  entryPath: string,
  options?: ZipPreviewUriOptions,
): vscode.Uri {
  const encodedEntryPath = entryPath
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const allowLarge = options?.allowLarge === true ? "&allowLarge=1" : "";
  return vscode.Uri.parse(
    `${SCHEME}://preview/${encodedEntryPath}?zip=${encodeURIComponent(zipPath)}&entry=${encodeURIComponent(entryPath)}${allowLarge}`,
  );
}
