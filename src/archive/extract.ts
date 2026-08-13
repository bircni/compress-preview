/**
 * Extract a single entry, selected entries, or all entries to disk.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import tar from "tar-stream";
import * as yauzl from "yauzl";
import { detectArchiveKind, getGzipEntryName, stripSupportedArchiveExtension } from "./format";

type ExtractAllConflictMode = "merge" | "replace";

export type ExtractAllOptions = {
  overwrite?: boolean;
  conflictMode?: ExtractAllConflictMode;
};

function resolveExtractAllConflictMode(
  options: ExtractAllOptions,
): "fail" | ExtractAllConflictMode {
  if (options.conflictMode === "merge" || options.conflictMode === "replace") {
    return options.conflictMode;
  }
  if (options.overwrite === true) {
    return "replace";
  }
  return "fail";
}

/**
 * Compute target directory for "extract all": same directory as archive, folder name = archive base name.
 */
export function extractAllTargetDir(archivePath: string): string {
  const resolved = path.resolve(archivePath);
  const dir = path.dirname(resolved);
  const baseName = path.basename(resolved);
  const base = stripSupportedArchiveExtension(baseName);
  return path.join(dir, base);
}

function normalizeArchiveEntryPath(entryPath: string): string {
  return entryPath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}

export function entryMatchesSelection(entryPath: string, selectedPaths: string[]): boolean {
  const normalized = normalizeArchiveEntryPath(entryPath);
  if (normalized.length === 0) {
    return false;
  }
  for (const selected of selectedPaths) {
    const want = normalizeArchiveEntryPath(selected);
    if (want.length === 0) {
      continue;
    }
    if (normalized === want || normalized.startsWith(`${want}/`)) {
      return true;
    }
  }
  return false;
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

function isUnsupportedTarEntryType(header: tar.Headers): boolean {
  return header.type === "symlink" || header.type === "link";
}

function extractZipEntry(archivePath: string, entryPath: string, outPath: string): Promise<void> {
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

        let settled = false;
        const finishWithError = (error: unknown) => {
          if (settled) {
            return;
          }
          settled = true;
          zipfile.close();
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        zipfile.on("entry", (entry: yauzl.Entry): void => {
          const normalized = entry.fileName.replace(/\/$/, "");
          if (normalized !== entryPath && entry.fileName !== entryPath) {
            zipfile.readEntry();
            return;
          }
          if (entry.fileName.endsWith("/")) {
            fs.mkdirSync(outPath, { recursive: true });
            settled = true;
            zipfile.close();
            resolve();
            return;
          }
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          zipfile.openReadStream(
            entry,
            (streamErr: Error | null, readStream: NodeJS.ReadableStream | undefined) => {
              if (streamErr) {
                finishWithError(streamErr);
                return;
              }
              if (!readStream) {
                finishWithError(new Error("No stream for entry"));
                return;
              }
              const writeStream = fs.createWriteStream(outPath);
              readStream.pipe(writeStream);
              writeStream.on("finish", () => {
                if (settled) {
                  return;
                }
                settled = true;
                zipfile.close();
                resolve();
              });
              writeStream.on("error", finishWithError);
              readStream.on("error", finishWithError);
            },
          );
        });

        zipfile.on("end", () => {
          if (!settled) {
            finishWithError(new Error(`Entry not found in archive: ${entryPath}`));
          }
        });
        zipfile.on("error", finishWithError);
        zipfile.readEntry();
      },
    );
  });
}

function extractTarEntry(
  archivePath: string,
  archiveKind: "tar" | "tgz",
  entryPath: string,
  outPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { source, input, destroy } = createTarInputStream(archivePath, archiveKind);
    const extract = tar.extract();
    const wantPath = entryPath.replace(/^\.\//, "").replaceAll("\\", "/");
    let settled = false;

    const finishWithError = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      destroy();
      extract.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    extract.on("entry", (header: tar.Headers, stream: NodeJS.ReadableStream, next: () => void) => {
      const normalizedPath = header.name.replaceAll("\\", "/").replace(/\/$/, "");
      if (normalizedPath !== wantPath && header.name !== entryPath) {
        stream.resume();
        stream.on("end", () => {
          next();
        });
        return;
      }
      if (header.type === "directory" || header.name.endsWith("/")) {
        fs.mkdirSync(outPath, { recursive: true });
        settled = true;
        destroy();
        extract.destroy();
        resolve();
        return;
      }
      if (isUnsupportedTarEntryType(header)) {
        stream.resume();
        finishWithError(
          new Error(`Unsupported tar entry type for extraction: ${String(header.type)}`),
        );
        return;
      }
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      const writeStream = fs.createWriteStream(outPath);
      stream.pipe(writeStream);
      writeStream.on("finish", () => {
        if (settled) {
          return;
        }
        settled = true;
        destroy();
        extract.destroy();
        resolve();
      });
      writeStream.on("error", finishWithError);
      stream.on("error", finishWithError);
    });

    extract.on("finish", () => {
      if (!settled) {
        finishWithError(new Error(`Entry not found in archive: ${entryPath}`));
      }
    });
    source.on("error", finishWithError);
    input.on("error", finishWithError);
    extract.on("error", finishWithError);
    input.pipe(extract);
  });
}

function extractGzipEntry(archivePath: string, entryPath: string, outPath: string): Promise<void> {
  const expectedPath = getGzipEntryName(archivePath);
  if (entryPath !== expectedPath) {
    return Promise.reject(new Error(`Entry not found in archive: ${entryPath}`));
  }

  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const source = fs.createReadStream(archivePath);
    const gunzip = zlib.createGunzip();
    const target = fs.createWriteStream(outPath);
    source.pipe(gunzip).pipe(target);
    const cleanup = () => {
      source.destroy();
      gunzip.destroy();
    };

    target.on("finish", () => {
      cleanup();
      resolve();
    });
    target.on("error", (error) => {
      cleanup();
      reject(error);
    });
    gunzip.on("error", (error) => {
      cleanup();
      reject(error);
    });
    source.on("error", (error) => {
      cleanup();
      reject(error);
    });
  });
}

/**
 * Extract a single entry from the archive to outPath (file or directory).
 */
export function extractEntry(
  archivePath: string,
  entryPath: string,
  outPath: string,
): Promise<void> {
  const archiveKind = detectArchiveKind(archivePath);
  switch (archiveKind) {
    case "zip":
      return extractZipEntry(archivePath, entryPath, outPath);
    case "tar":
    case "tgz":
      return extractTarEntry(archivePath, archiveKind, entryPath, outPath);
    case "gz":
      return extractGzipEntry(archivePath, entryPath, outPath);
    default:
      return Promise.reject(new Error(`Unsupported archive kind: ${archiveKind}`));
  }
}

function noop(): void {
  // Merge writes in place, so there is no staging directory to commit or abort.
}

function beginExtractAll(
  outDir: string,
  conflictMode: "fail" | ExtractAllConflictMode,
): {
  writeDir: string;
  commit: () => void;
  abort: () => void;
} {
  const resolvedOutDir = path.resolve(outDir);
  const exists = fs.existsSync(resolvedOutDir);

  if (exists && conflictMode === "fail") {
    throw new Error("Target directory already exists; use overwrite or choose another path");
  }

  const useStaging = conflictMode === "replace" || !exists;
  if (!useStaging) {
    fs.mkdirSync(resolvedOutDir, { recursive: true });
    return {
      writeDir: resolvedOutDir,
      commit: noop,
      abort: noop,
    };
  }

  const parentDir = path.dirname(resolvedOutDir);
  const folderName = path.basename(resolvedOutDir) || "archive";
  fs.mkdirSync(parentDir, { recursive: true });
  const stagingDir = fs.mkdtempSync(path.join(parentDir, `.${folderName}.extract-`));

  return {
    writeDir: stagingDir,
    commit: () => {
      if (exists) {
        const backupDir = path.join(
          parentDir,
          `.${folderName}.backup-${process.pid}-${Date.now()}`,
        );
        fs.renameSync(resolvedOutDir, backupDir);
        try {
          fs.renameSync(stagingDir, resolvedOutDir);
        } catch (error) {
          fs.renameSync(backupDir, resolvedOutDir);
          throw error;
        }
        fs.rmSync(backupDir, { recursive: true, force: true });
        return;
      }
      fs.renameSync(stagingDir, resolvedOutDir);
    },
    abort: () => {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    },
  };
}

function extractAllZip(
  archivePath: string,
  outDir: string,
  conflictMode: "fail" | ExtractAllConflictMode,
  includeEntry: (entryName: string) => boolean = () => true,
  requireMatch = false,
): Promise<void> {
  let session: ReturnType<typeof beginExtractAll>;
  try {
    session = beginExtractAll(outDir, conflictMode);
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error("Failed to prepare extract target"),
    );
  }
  const resolvedOutDir = session.writeDir;
  return new Promise((resolve, reject) => {
    yauzl.open(
      archivePath,
      { lazyEntries: true },
      (err: Error | null, zipfile: yauzl.ZipFile | undefined) => {
        if (err) {
          session.abort();
          reject(err);
          return;
        }
        if (!zipfile) {
          session.abort();
          reject(new Error("Failed to open zip"));
          return;
        }

        let pending = 0;
        let entriesDone = false;
        let done = false;
        let matched = 0;

        const maybeResolve = () => {
          if (done) {
            return;
          }
          if (entriesDone && pending === 0) {
            done = true;
            zipfile.close();
            if (matched === 0 && requireMatch) {
              session.abort();
              reject(new Error("No matching entries to extract"));
              return;
            }
            try {
              session.commit();
              resolve();
            } catch (error) {
              session.abort();
              reject(
                error instanceof Error ? error : new Error("Failed to finalize extract target"),
              );
            }
          }
        };

        const onDone = (error?: Error) => {
          if (done) {
            return;
          }
          if (error) {
            done = true;
            zipfile.close();
            session.abort();
            reject(error);
            return;
          }
          pending--;
          zipfile.readEntry();
          maybeResolve();
        };

        zipfile.on("entry", (entry: yauzl.Entry): void => {
          if (done) {
            return;
          }
          if (!includeEntry(entry.fileName)) {
            zipfile.readEntry();
            return;
          }
          matched += 1;
          let destPath: string;
          try {
            destPath = resolveArchiveDestination(resolvedOutDir, entry.fileName);
          } catch (error) {
            onDone(error instanceof Error ? error : new Error(String(error)));
            return;
          }
          if (entry.fileName.endsWith("/")) {
            fs.mkdirSync(destPath, { recursive: true });
            zipfile.readEntry();
            return;
          }
          pending++;
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          zipfile.openReadStream(
            entry,
            (streamErr: Error | null, readStream: NodeJS.ReadableStream | undefined) => {
              if (streamErr) {
                onDone(streamErr);
                return;
              }
              if (!readStream) {
                onDone(new Error("No stream"));
                return;
              }
              const writeStream = fs.createWriteStream(destPath);
              readStream.pipe(writeStream);
              writeStream.on("finish", () => {
                onDone();
              });
              writeStream.on("error", (error) => {
                onDone(error);
              });
              readStream.on("error", (error) => {
                onDone(error instanceof Error ? error : new Error(String(error)));
              });
            },
          );
        });

        zipfile.on("error", (error) => {
          onDone(error instanceof Error ? error : new Error(String(error)));
        });
        zipfile.on("end", () => {
          entriesDone = true;
          maybeResolve();
        });
        zipfile.readEntry();
      },
    );
  });
}

function extractAllTar(
  archivePath: string,
  archiveKind: "tar" | "tgz",
  outDir: string,
  conflictMode: "fail" | ExtractAllConflictMode,
  includeEntry: (entryName: string) => boolean = () => true,
  requireMatch = false,
): Promise<void> {
  let session: ReturnType<typeof beginExtractAll>;
  try {
    session = beginExtractAll(outDir, conflictMode);
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error("Failed to prepare extract target"),
    );
  }
  const resolvedOutDir = session.writeDir;
  return new Promise((resolve, reject) => {
    const { source, input, destroy } = createTarInputStream(archivePath, archiveKind);
    const extract = tar.extract();
    let settled = false;
    let matched = 0;

    const finishWithError = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      session.abort();
      destroy();
      extract.destroy();
      reject(error instanceof Error ? error : new Error("Failed to extract archive"));
    };

    extract.on("entry", (header: tar.Headers, stream: NodeJS.ReadableStream, next: () => void) => {
      if (!includeEntry(header.name)) {
        stream.resume();
        stream.on("end", () => {
          next();
        });
        return;
      }
      matched += 1;
      let destPath: string;
      try {
        destPath = resolveArchiveDestination(resolvedOutDir, header.name);
      } catch (error) {
        finishWithError(error);
        stream.resume();
        return;
      }
      if (header.type === "directory" || header.name.endsWith("/")) {
        fs.mkdirSync(destPath, { recursive: true });
        stream.resume();
        stream.on("end", () => {
          next();
        });
        return;
      }
      if (isUnsupportedTarEntryType(header)) {
        stream.resume();
        finishWithError(
          new Error(`Unsupported tar entry type for extraction: ${String(header.type)}`),
        );
        return;
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const writeStream = fs.createWriteStream(destPath);
      stream.pipe(writeStream);
      writeStream.on("finish", () => {
        next();
      });
      writeStream.on("error", finishWithError);
      stream.on("error", finishWithError);
    });

    extract.on("finish", () => {
      if (settled) {
        return;
      }
      settled = true;
      destroy();
      extract.destroy();
      if (matched === 0 && requireMatch) {
        session.abort();
        reject(new Error("No matching entries to extract"));
        return;
      }
      try {
        session.commit();
        resolve();
      } catch (error) {
        session.abort();
        reject(error instanceof Error ? error : new Error("Failed to finalize extract target"));
      }
    });

    source.on("error", finishWithError);
    input.on("error", finishWithError);
    extract.on("error", finishWithError);
    input.pipe(extract);
  });
}

async function extractAllGzip(
  archivePath: string,
  outDir: string,
  conflictMode: "fail" | ExtractAllConflictMode,
  includeEntry: (entryName: string) => boolean = () => true,
): Promise<void> {
  const entryName = getGzipEntryName(archivePath);
  if (!includeEntry(entryName)) {
    throw new Error("No matching entries to extract");
  }
  let session: ReturnType<typeof beginExtractAll>;
  try {
    session = beginExtractAll(outDir, conflictMode);
  } catch (error) {
    throw error instanceof Error ? error : new Error("Failed to prepare extract target");
  }
  try {
    const targetPath = resolveArchiveDestination(session.writeDir, getGzipEntryName(archivePath));
    await extractGzipEntry(archivePath, getGzipEntryName(archivePath), targetPath);
    session.commit();
  } catch (error) {
    session.abort();
    throw error instanceof Error ? error : new Error("Failed to extract gzip archive");
  }
}

/**
 * Extract all entries to outDir.
 */
export function extractAll(
  archivePath: string,
  outDir: string,
  options: ExtractAllOptions = {},
): Promise<void> {
  return extractFilteredEntries(archivePath, outDir, options, () => true, false);
}

/**
 * Extract the selected archive paths in a single scan.
 * Folder selections include nested entries.
 */
export function extractEntries(
  archivePath: string,
  entryPaths: string[],
  outDir: string,
  options: ExtractAllOptions = {},
): Promise<void> {
  if (entryPaths.length === 0) {
    return Promise.reject(new Error("No entries selected"));
  }
  const resolvedOptions: ExtractAllOptions =
    options.conflictMode == null && options.overwrite == null ? { conflictMode: "merge" } : options;
  return extractFilteredEntries(
    archivePath,
    outDir,
    resolvedOptions,
    (entryName) => entryMatchesSelection(entryName, entryPaths),
    true,
  );
}

function extractFilteredEntries(
  archivePath: string,
  outDir: string,
  options: ExtractAllOptions,
  includeEntry: (entryName: string) => boolean,
  requireMatch: boolean,
): Promise<void> {
  const conflictMode = resolveExtractAllConflictMode(options);
  const archiveKind = detectArchiveKind(archivePath);
  switch (archiveKind) {
    case "zip":
      return extractAllZip(archivePath, outDir, conflictMode, includeEntry, requireMatch);
    case "tar":
    case "tgz":
      return extractAllTar(
        archivePath,
        archiveKind,
        outDir,
        conflictMode,
        includeEntry,
        requireMatch,
      );
    case "gz":
      return extractAllGzip(archivePath, outDir, conflictMode, includeEntry);
    default:
      return Promise.reject(new Error(`Unsupported archive kind: ${archiveKind}`));
  }
}
