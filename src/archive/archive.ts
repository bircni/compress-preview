/**
 * Archive abstraction over yauzl: list entries with time-bound, expose file size.
 */

import * as fs from "fs";
import * as path from "path";
import * as yauzl from "yauzl";
import type { ArchiveEntry, EntryContentStream } from "./entry";

const DEFAULT_TIMEOUT_MS = 10_000;
const LOADING_INDICATOR_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5 MB

export type ListEntriesResult = {
  entries: ArchiveEntry[];
  isPartial: boolean;
  sizeBytes: number;
  message?: string;
};

export type ListEntriesOptions = {
  timeoutMs?: number;
};

/**
 * Get file size in bytes (for loading-indicator threshold).
 */
export function getArchiveSizeBytes(zipPath: string): number {
  const stat = fs.statSync(zipPath);
  return stat.size;
}

/**
 * List entries in the zip with optional time-bound. When timeout is reached,
 * returns whatever entries were read so far with isPartial: true.
 */
export function listEntries(
  zipPath: string,
  options: ListEntriesOptions = {},
): Promise<ListEntriesResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sizeBytes = getArchiveSizeBytes(zipPath);

  return new Promise((resolve, reject) => {
    yauzl.open(
      zipPath,
      { lazyEntries: true },
      (err: Error | null, zipfile: yauzl.ZipFile | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        if (!zipfile) {
          reject(new Error("Failed to open zip"));
          return;
        }

        const entries: ArchiveEntry[] = [];
        let resolved = false;

        const timeout = setTimeout(() => {
          if (resolved) {
            return;
          }
          resolved = true;
          zipfile.close();
          resolve({
            entries,
            isPartial: true,
            sizeBytes,
            message: "Partial list (load interrupted)",
          });
        }, timeoutMs);

        const tryRead = () => {
          if (resolved) {
            return;
          }
          zipfile.readEntry();
        };

        zipfile.on("entry", (entry: yauzl.Entry) => {
          if (resolved) {
            return;
          }
          const name = entry.fileName.replace(/\/$/, "");
          const isDirectory = entry.fileName.endsWith("/");
          entries.push({
            path: entry.fileName,
            name: path.basename(name) || name,
            isDirectory,
            size: entry.uncompressedSize === 0 && isDirectory ? undefined : entry.uncompressedSize,
            compressedSize: entry.compressedSize,
            mtime: entry.getLastModDate(),
          });
          tryRead();
        });

        zipfile.on("end", () => {
          if (resolved) {
            return;
          }
          clearTimeout(timeout);
          resolved = true;
          resolve({
            entries,
            isPartial: false,
            sizeBytes,
          });
        });

        zipfile.on("error", (e) => {
          if (resolved) {
            return;
          }
          clearTimeout(timeout);
          resolved = true;
          reject(e instanceof Error ? e : new Error(String(e)));
        });

        tryRead();
      },
    );
  });
}

export const LOADING_INDICATOR_THRESHOLD = LOADING_INDICATOR_THRESHOLD_BYTES;

/**
 * Open a read stream for a single entry by path. Resolves when stream is ready.
 */
export function openEntryReadStream(
  zipPath: string,
  entryPath: string,
): Promise<EntryContentStream> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      zipPath,
      { lazyEntries: true },
      (err: Error | null, zipfile: yauzl.ZipFile | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        if (!zipfile) {
          reject(new Error("Failed to open zip"));
          return;
        }

        const wantPath = entryPath.replace(/^\.\//, "").replace(/\\/g, "/");
        zipfile.on("entry", (entry: yauzl.Entry): void => {
          const entryPathNorm = entry.fileName
            .replace(/^\.\//, "")
            .replace(/\\/g, "/")
            .replace(/\/$/, "");
          if (
            entryPathNorm !== wantPath &&
            entry.fileName !== entryPath &&
            entry.fileName !== `${entryPath}/`
          ) {
            zipfile.readEntry();
            return;
          }
          const name = entry.fileName.replace(/\/$/, "");
          const isDirectory = entry.fileName.endsWith("/");
          const archiveEntry: ArchiveEntry = {
            path: entry.fileName,
            name: path.basename(name) || name,
            isDirectory,
            size: entry.uncompressedSize === 0 && isDirectory ? undefined : entry.uncompressedSize,
            compressedSize: entry.compressedSize,
            mtime: entry.getLastModDate(),
          };
          zipfile.openReadStream(
            entry,
            (streamErr: Error | null, readStream: NodeJS.ReadableStream | undefined) => {
              if (streamErr) {
                zipfile.close();
                reject(streamErr);
                return;
              }
              if (!readStream) {
                zipfile.close();
                reject(new Error("No stream for entry"));
                return;
              }
              resolve({ entry: archiveEntry, stream: readStream });
            },
          );
        });

        zipfile.on("error", reject);
        zipfile.readEntry();
      },
    );
  });
}
