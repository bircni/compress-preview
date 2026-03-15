/**
 * Archive abstraction over ZIP/TAR/GZIP containers.
 */

import * as fs from "fs";
import * as path from "path";
import { PassThrough } from "stream";
import * as zlib from "zlib";
import tar from "tar-stream";
import * as yauzl from "yauzl";
import type { ArchiveEntry, EntryContentStream } from "./entry";
import { detectArchiveKind, getGzipEntryName } from "./format";

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

function createArchiveEntry(
  entryPath: string,
  options: {
    isDirectory: boolean;
    size?: number;
    compressedSize?: number;
    mtime?: Date | number;
  },
): ArchiveEntry {
  const normalizedName = entryPath.replace(/\/$/, "");
  return {
    path: entryPath,
    name: path.basename(normalizedName) || normalizedName,
    isDirectory: options.isDirectory,
    size: options.size,
    compressedSize: options.compressedSize,
    mtime: options.mtime,
  };
}

function createTarEntry(header: tar.Headers): ArchiveEntry {
  const normalizedPath = header.name.replace(/\\/g, "/");
  const isDirectory = header.type === "directory" || normalizedPath.endsWith("/");
  return createArchiveEntry(
    isDirectory ? `${normalizedPath.replace(/\/$/, "")}/` : normalizedPath,
    {
      isDirectory,
      size: isDirectory ? undefined : header.size,
      mtime: header.mtime instanceof Date ? header.mtime : undefined,
    },
  );
}

function isTarDirectory(header: tar.Headers): boolean {
  return header.type === "directory" || header.name.endsWith("/");
}

function createTarInputStream(
  archivePath: string,
  archiveKind: "tar" | "tgz",
): {
  source: fs.ReadStream;
  input: NodeJS.ReadableStream;
  destroy: () => void;
} {
  const source = fs.createReadStream(archivePath);
  if (archiveKind === "tgz") {
    const gunzip = zlib.createGunzip();
    source.pipe(gunzip);
    return {
      source,
      input: gunzip,
      destroy: () => {
        gunzip.destroy();
        source.destroy();
      },
    };
  }

  return {
    source,
    input: source,
    destroy: () => source.destroy(),
  };
}

function listZipEntries(
  archivePath: string,
  sizeBytes: number,
  timeoutMs: number,
): Promise<ListEntriesResult> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      archivePath,
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
          if (!resolved) {
            zipfile.readEntry();
          }
        };

        zipfile.on("entry", (entry: yauzl.Entry) => {
          if (resolved) {
            return;
          }
          const isDirectory = entry.fileName.endsWith("/");
          entries.push(
            createArchiveEntry(entry.fileName, {
              isDirectory,
              size: isDirectory ? undefined : entry.uncompressedSize,
              compressedSize: entry.compressedSize,
              mtime: entry.getLastModDate(),
            }),
          );
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

        zipfile.on("error", (error) => {
          if (resolved) {
            return;
          }
          clearTimeout(timeout);
          resolved = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        });

        tryRead();
      },
    );
  });
}

function listTarEntries(
  archivePath: string,
  archiveKind: "tar" | "tgz",
  sizeBytes: number,
  timeoutMs: number,
): Promise<ListEntriesResult> {
  return new Promise((resolve, reject) => {
    const { source, input, destroy } = createTarInputStream(archivePath, archiveKind);
    const extract = tar.extract();
    const entries: ArchiveEntry[] = [];
    let resolved = false;

    const finishWith = (result: ListEntriesResult) => {
      if (resolved) {
        return;
      }
      resolved = true;
      destroy();
      extract.destroy();
      resolve(result);
    };

    const timeout = setTimeout(() => {
      finishWith({
        entries,
        isPartial: true,
        sizeBytes,
        message: "Partial list (load interrupted)",
      });
    }, timeoutMs);

    extract.on("entry", (header: tar.Headers, stream: NodeJS.ReadableStream, next: () => void) => {
      if (resolved) {
        stream.resume();
        return;
      }
      entries.push(createTarEntry(header));
      stream.resume();
      stream.on("end", () => next());
    });

    extract.on("finish", () => {
      if (resolved) {
        return;
      }
      clearTimeout(timeout);
      finishWith({
        entries,
        isPartial: false,
        sizeBytes,
      });
    });

    const onError = (error: unknown) => {
      if (resolved) {
        return;
      }
      clearTimeout(timeout);
      resolved = true;
      destroy();
      extract.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    source.on("error", onError);
    input.on("error", onError);
    extract.on("error", onError);
    input.pipe(extract);
  });
}

function listGzipEntries(archivePath: string, sizeBytes: number): Promise<ListEntriesResult> {
  return Promise.resolve({
    entries: [
      createArchiveEntry(getGzipEntryName(archivePath), {
        isDirectory: false,
        compressedSize: sizeBytes,
        mtime: fs.statSync(archivePath).mtime,
      }),
    ],
    isPartial: false,
    sizeBytes,
  });
}

function openZipEntryReadStream(
  archivePath: string,
  entryPath: string,
): Promise<EntryContentStream> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      archivePath,
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
        let settled = false;
        let zipClosed = false;
        const closeZipfile = () => {
          if (zipClosed) {
            return;
          }
          zipClosed = true;
          zipfile.close();
        };

        zipfile.on("entry", (entry: yauzl.Entry): void => {
          if (settled) {
            return;
          }
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
          const isDirectory = entry.fileName.endsWith("/");
          if (isDirectory) {
            settled = true;
            closeZipfile();
            reject(new Error("Cannot open a folder."));
            return;
          }
          const archiveEntry = createArchiveEntry(entry.fileName, {
            isDirectory,
            size: entry.uncompressedSize,
            compressedSize: entry.compressedSize,
            mtime: entry.getLastModDate(),
          });
          zipfile.openReadStream(
            entry,
            (streamErr: Error | null, readStream: NodeJS.ReadableStream | undefined) => {
              if (streamErr) {
                settled = true;
                closeZipfile();
                reject(streamErr);
                return;
              }
              if (!readStream) {
                settled = true;
                closeZipfile();
                reject(new Error("No stream for entry"));
                return;
              }
              settled = true;
              readStream.once("end", closeZipfile);
              readStream.once("close", closeZipfile);
              readStream.once("error", closeZipfile);
              resolve({ entry: archiveEntry, stream: readStream });
            },
          );
        });

        zipfile.on("end", () => {
          if (settled) {
            return;
          }
          settled = true;
          closeZipfile();
          reject(new Error(`Entry not found in archive: ${entryPath}`));
        });

        zipfile.on("error", (error) => {
          if (settled) {
            return;
          }
          settled = true;
          closeZipfile();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
        zipfile.readEntry();
      },
    );
  });
}

function openTarEntryReadStream(
  archivePath: string,
  archiveKind: "tar" | "tgz",
  entryPath: string,
): Promise<EntryContentStream> {
  return new Promise((resolve, reject) => {
    const { source, input, destroy } = createTarInputStream(archivePath, archiveKind);
    const extract = tar.extract();
    const wantPath = entryPath.replace(/^\.\//, "").replace(/\\/g, "/");
    let settled = false;

    const closeWithError = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      destroy();
      extract.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    extract.on("entry", (header: tar.Headers, stream: NodeJS.ReadableStream, next: () => void) => {
      const normalizedPath = header.name.replace(/\\/g, "/").replace(/\/$/, "");
      if (
        normalizedPath !== wantPath &&
        header.name !== entryPath &&
        header.name !== `${entryPath}/`
      ) {
        stream.resume();
        stream.on("end", () => next());
        return;
      }
      if (isTarDirectory(header)) {
        stream.resume();
        closeWithError(new Error("Cannot open a folder."));
        return;
      }

      const output = new PassThrough();
      const archiveEntry = createTarEntry(header);
      output.once("end", () => {
        destroy();
        extract.destroy();
      });
      output.once("close", () => {
        destroy();
        extract.destroy();
      });
      output.once("error", () => {
        destroy();
        extract.destroy();
      });
      stream.once("error", (error: Error) => output.destroy(error));
      stream.pipe(output);
      settled = true;
      resolve({ entry: archiveEntry, stream: output });
    });

    extract.on("finish", () => {
      if (!settled) {
        closeWithError(new Error(`Entry not found in archive: ${entryPath}`));
      }
    });

    source.on("error", closeWithError);
    input.on("error", closeWithError);
    extract.on("error", closeWithError);
    input.pipe(extract);
  });
}

function openGzipEntryReadStream(
  archivePath: string,
  entryPath: string,
): Promise<EntryContentStream> {
  const expectedPath = getGzipEntryName(archivePath);
  if (entryPath !== expectedPath) {
    return Promise.reject(new Error(`Entry not found in archive: ${entryPath}`));
  }

  const source = fs.createReadStream(archivePath);
  const gunzip = zlib.createGunzip();
  source.pipe(gunzip);
  const archiveEntry = createArchiveEntry(expectedPath, {
    isDirectory: false,
    compressedSize: getArchiveSizeBytes(archivePath),
    mtime: fs.statSync(archivePath).mtime,
  });

  const cleanup = () => {
    gunzip.destroy();
    source.destroy();
  };

  gunzip.once("end", cleanup);
  gunzip.once("close", cleanup);
  gunzip.once("error", cleanup);
  source.once("error", () => {
    gunzip.destroy();
  });

  return Promise.resolve({
    entry: archiveEntry,
    stream: gunzip,
  });
}

/**
 * Get file size in bytes (for loading-indicator threshold).
 */
export function getArchiveSizeBytes(archivePath: string): number {
  const stat = fs.statSync(archivePath);
  return stat.size;
}

/**
 * List entries in the archive with optional time-bound.
 */
export function listEntries(
  archivePath: string,
  options: ListEntriesOptions = {},
): Promise<ListEntriesResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sizeBytes = getArchiveSizeBytes(archivePath);
  const archiveKind = detectArchiveKind(archivePath);

  switch (archiveKind) {
    case "zip":
      return listZipEntries(archivePath, sizeBytes, timeoutMs);
    case "tar":
    case "tgz":
      return listTarEntries(archivePath, archiveKind, sizeBytes, timeoutMs);
    case "gz":
      return listGzipEntries(archivePath, sizeBytes);
    default:
      return Promise.reject(new Error(`Unsupported archive kind: ${String(archiveKind)}`));
  }
}

export const LOADING_INDICATOR_THRESHOLD = LOADING_INDICATOR_THRESHOLD_BYTES;

/**
 * Open a read stream for a single entry by path. Resolves when stream is ready.
 */
export function openEntryReadStream(
  archivePath: string,
  entryPath: string,
): Promise<EntryContentStream> {
  const archiveKind = detectArchiveKind(archivePath);
  switch (archiveKind) {
    case "zip":
      return openZipEntryReadStream(archivePath, entryPath);
    case "tar":
    case "tgz":
      return openTarEntryReadStream(archivePath, archiveKind, entryPath);
    case "gz":
      return openGzipEntryReadStream(archivePath, entryPath);
    default:
      return Promise.reject(new Error(`Unsupported archive kind: ${String(archiveKind)}`));
  }
}
