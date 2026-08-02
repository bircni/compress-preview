/**
 * TextDocumentContentProvider for compress-preview:// URIs.
 * Resolves to the text content of an entry inside a zip (read-only).
 */

import * as vscode from "vscode";
import { openEntryReadStream } from "../archive/archive";

const SCHEME = "compress-preview";

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on("data", (chunk: Buffer | string) => {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk, "utf8"));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    stream.on("error", reject);
  });
}

export class ZipContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const zipPath = params.get("zip") ?? "";
    const entryPath = params.get("entry") ?? uri.path.replace(/^\//, "");
    if (!zipPath || !entryPath) {
      throw new Error("Invalid compress-preview URI");
    }
    const { stream } = await openEntryReadStream(zipPath, entryPath);
    return streamToString(stream);
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
export function makeZipPreviewUri(zipPath: string, entryPath: string): vscode.Uri {
  const encodedEntryPath = entryPath
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return vscode.Uri.parse(
    `${SCHEME}://preview/${encodedEntryPath}?zip=${encodeURIComponent(zipPath)}&entry=${encodeURIComponent(entryPath)}`,
  );
}
