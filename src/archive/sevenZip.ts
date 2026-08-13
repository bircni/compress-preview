import * as fs from "node:fs";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import SevenZipIterator from "7z-iterator";
import type { ArchiveEntry, EntryContentStream } from "./entry";

type SevenZipListedEntry = {
  path: string;
  type: string;
  size?: number;
  mtime?: number | Date;
  stream?: NodeJS.ReadableStream | null;
  destroy?: () => void;
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
    ...(options.size !== undefined && { size: options.size }),
    ...(options.compressedSize !== undefined && { compressedSize: options.compressedSize }),
    ...(options.mtime !== undefined && { mtime: options.mtime }),
  };
}

function normalizeEntryPath(entryPath: string): string {
  return entryPath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function isDirectoryEntry(entry: SevenZipListedEntry): boolean {
  return entry.type === "directory" || entry.path.endsWith("/");
}

function listedEntryPath(entry: SevenZipListedEntry): string {
  const normalized = normalizeEntryPath(entry.path);
  return isDirectoryEntry(entry) ? `${normalized}/` : normalized;
}

function destroyIterator(iterator: { destroy: () => void }): void {
  try {
    iterator.destroy();
  } catch {
    // 7z-iterator throws if destroy() is called twice.
  }
}

function rewriteSevenZipError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/password|encrypt/i.test(message)) {
    return new Error("Password-protected 7z archives are not supported");
  }
  return error instanceof Error ? error : new Error(message);
}

function takeFileStream(entry: SevenZipListedEntry): NodeJS.ReadableStream {
  const stream = entry.stream;
  if (!stream) {
    throw new Error("7z FileEntry missing stream");
  }
  entry.stream = null;
  const output = new PassThrough();
  stream.on("error", (error) => {
    output.destroy(rewriteSevenZipError(error));
  });
  stream.pipe(output);
  return output;
}

function resolveArchiveDestination(rootDir: string, entryName: string): string {
  const normalizedName = entryName.replaceAll("\\", "/");
  const safeSegments = normalizedName
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
  const candidatePath = path.resolve(rootDir, ...safeSegments);
  const relativePath = path.relative(rootDir, candidatePath);
  if (
    relativePath === "" ||
    relativePath === "." ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  ) {
    return candidatePath;
  }

  throw new Error(`Unsafe archive entry path: ${entryName}`);
}

function pipeStreamToFile(stream: NodeJS.ReadableStream, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const target = fs.createWriteStream(outPath);
    stream.pipe(target);
    target.on("finish", resolve);
    target.on("error", reject);
    stream.on("error", reject);
  });
}

export async function listSevenZipEntries(
  archivePath: string,
  sizeBytes: number,
  timeoutMs: number,
): Promise<{
  entries: ArchiveEntry[];
  isPartial: boolean;
  sizeBytes: number;
  message?: string;
}> {
  const iterator = new SevenZipIterator(archivePath);
  const entries: ArchiveEntry[] = [];
  const startedAt = Date.now();
  try {
    for await (const rawEntry of iterator) {
      const entry = rawEntry as SevenZipListedEntry;
      if (Date.now() - startedAt >= timeoutMs) {
        entry.destroy?.();
        destroyIterator(iterator);
        return {
          entries,
          isPartial: true,
          sizeBytes,
        };
      }
      const isDirectory = isDirectoryEntry(entry);
      const listedPath = listedEntryPath(entry);
      entries.push(
        createArchiveEntry(listedPath, {
          isDirectory,
          ...(!isDirectory && entry.size !== undefined && { size: entry.size }),
          ...(entry.mtime !== undefined && { mtime: entry.mtime }),
        }),
      );
      entry.destroy?.();
    }
    destroyIterator(iterator);
    return { entries, isPartial: false, sizeBytes };
  } catch (error) {
    destroyIterator(iterator);
    throw rewriteSevenZipError(error);
  }
}

export async function openSevenZipEntryReadStream(
  archivePath: string,
  entryPath: string,
): Promise<EntryContentStream> {
  const iterator = new SevenZipIterator(archivePath);
  const wantPath = normalizeEntryPath(entryPath);
  let handedOff = false;
  try {
    for await (const rawEntry of iterator) {
      const entry = rawEntry as SevenZipListedEntry;
      const normalized = normalizeEntryPath(entry.path);
      if (normalized !== wantPath) {
        entry.destroy?.();
        continue;
      }
      if (isDirectoryEntry(entry)) {
        entry.destroy?.();
        throw new Error("Cannot open a folder.");
      }
      const stream = takeFileStream(entry);
      handedOff = true;
      const cleanup = () => {
        destroyIterator(iterator);
      };
      stream.once("end", cleanup);
      stream.once("close", cleanup);
      stream.once("error", cleanup);
      return {
        entry: createArchiveEntry(normalized, {
          isDirectory: false,
          ...(entry.size !== undefined && { size: entry.size }),
          ...(entry.mtime !== undefined && { mtime: entry.mtime }),
        }),
        stream,
      };
    }
    throw new Error(`Entry not found in archive: ${entryPath}`);
  } catch (error) {
    if (!handedOff) {
      destroyIterator(iterator);
    }
    throw rewriteSevenZipError(error);
  }
}

export async function extractSevenZipEntry(
  archivePath: string,
  entryPath: string,
  outPath: string,
): Promise<void> {
  const iterator = new SevenZipIterator(archivePath);
  const wantPath = normalizeEntryPath(entryPath);
  try {
    for await (const rawEntry of iterator) {
      const entry = rawEntry as SevenZipListedEntry;
      const normalized = normalizeEntryPath(entry.path);
      if (normalized !== wantPath) {
        entry.destroy?.();
        continue;
      }
      if (entry.type === "link" || entry.type === "symlink") {
        entry.destroy?.();
        throw new Error(`Unsupported 7z entry type for extraction: ${entry.type}`);
      }
      if (isDirectoryEntry(entry)) {
        entry.destroy?.();
        fs.mkdirSync(outPath, { recursive: true });
        destroyIterator(iterator);
        return;
      }
      const stream = takeFileStream(entry);
      await pipeStreamToFile(stream, outPath);
      destroyIterator(iterator);
      return;
    }
    throw new Error(`Entry not found in archive: ${entryPath}`);
  } catch (error) {
    destroyIterator(iterator);
    throw rewriteSevenZipError(error);
  }
}

export async function extractAllSevenZip(
  archivePath: string,
  writeDir: string,
  includeEntry: (entryName: string) => boolean,
  requireMatch: boolean,
): Promise<void> {
  const iterator = new SevenZipIterator(archivePath);
  let matched = 0;
  try {
    for await (const rawEntry of iterator) {
      const entry = rawEntry as SevenZipListedEntry;
      const listedPath = listedEntryPath(entry);
      if (!includeEntry(listedPath) && !includeEntry(entry.path)) {
        entry.destroy?.();
        continue;
      }
      if (entry.type === "link" || entry.type === "symlink") {
        entry.destroy?.();
        throw new Error(`Unsupported 7z entry type for extraction: ${entry.type}`);
      }
      const destPath = resolveArchiveDestination(writeDir, listedPath);
      matched += 1;
      if (isDirectoryEntry(entry)) {
        entry.destroy?.();
        fs.mkdirSync(destPath, { recursive: true });
        continue;
      }
      const stream = takeFileStream(entry);
      await pipeStreamToFile(stream, destPath);
    }
  } catch (error) {
    destroyIterator(iterator);
    throw rewriteSevenZipError(error);
  }
  destroyIterator(iterator);
  if (matched === 0 && requireMatch) {
    throw new Error("No matching entries to extract");
  }
}
