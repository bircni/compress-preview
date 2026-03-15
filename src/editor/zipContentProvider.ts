/**
 * TextDocumentContentProvider for zip-preview:// URIs.
 * Resolves to the text content of an entry inside a zip (read-only).
 */

import * as vscode from "vscode";
import { openEntryReadStream } from "../archive/archive";

const SCHEME = "zip-preview";

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

export class ZipContentProvider implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const zipPath = params.get("zip") ?? "";
    const entryPath = params.get("entry") ?? uri.path.replace(/^\//, "");
    if (!zipPath || !entryPath) {
      return Promise.reject(new Error("Invalid zip-preview URI"));
    }
    return openEntryReadStream(zipPath, entryPath).then(({ stream }) => streamToString(stream));
  }
}

export function registerZipContentProvider(context: vscode.ExtensionContext): void {
  const provider = new ZipContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),
  );
}

export function makeZipPreviewUri(zipPath: string, entryPath: string): vscode.Uri {
  return vscode.Uri.parse(
    `${SCHEME}://preview?zip=${encodeURIComponent(zipPath)}&entry=${encodeURIComponent(entryPath)}`,
  );
}
