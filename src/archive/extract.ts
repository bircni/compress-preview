/**
 * Extract single entry or all entries to disk.
 */

import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import tar from "tar-stream";
import * as yauzl from "yauzl";
import { detectArchiveKind, getGzipEntryName, stripSupportedArchiveExtension } from "./format";

export type ExtractAllOptions = {
  overwrite?: boolean;
};

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

function resolveArchiveDestination(rootDir: string, entryName: string): string {
  const normalizedName = entryName.replace(/\\/g, "/");
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
    const wantPath = entryPath.replace(/^\.\//, "").replace(/\\/g, "/");
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
      const normalizedPath = header.name.replace(/\\/g, "/").replace(/\/$/, "");
      if (normalizedPath !== wantPath && header.name !== entryPath) {
        stream.resume();
        stream.on("end", () => next());
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
      return Promise.reject(new Error(`Unsupported archive kind: ${String(archiveKind)}`));
  }
}

function prepareExtractAllTarget(outDir: string, overwrite: boolean): string {
  const resolvedOutDir = path.resolve(outDir);
  if (fs.existsSync(resolvedOutDir) && !overwrite) {
    throw new Error("Target directory already exists; use overwrite or choose another path");
  }
  if (overwrite && fs.existsSync(resolvedOutDir)) {
    fs.rmSync(resolvedOutDir, { recursive: true });
  }
  fs.mkdirSync(resolvedOutDir, { recursive: true });
  return resolvedOutDir;
}

function extractAllZip(archivePath: string, outDir: string, overwrite: boolean): Promise<void> {
  let resolvedOutDir: string;
  try {
    resolvedOutDir = prepareExtractAllTarget(outDir, overwrite);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
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

        let pending = 0;
        let entriesDone = false;
        let done = false;

        const maybeResolve = () => {
          if (done) {
            return;
          }
          if (entriesDone && pending === 0) {
            done = true;
            zipfile.close();
            resolve();
          }
        };

        const onDone = (error?: Error) => {
          if (error) {
            done = true;
            zipfile.close();
            reject(error);
            return;
          }
          pending--;
          zipfile.readEntry();
          maybeResolve();
        };

        zipfile.on("entry", (entry: yauzl.Entry): void => {
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
                zipfile.readEntry();
                return;
              }
              if (!readStream) {
                onDone(new Error("No stream"));
                zipfile.readEntry();
                return;
              }
              const writeStream = fs.createWriteStream(destPath);
              readStream.pipe(writeStream);
              writeStream.on("finish", () => onDone());
              writeStream.on("error", (error) => onDone(error));
              readStream.on("error", (error) =>
                onDone(error instanceof Error ? error : new Error(String(error))),
              );
            },
          );
        });

        zipfile.on("error", reject);
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
  overwrite: boolean,
): Promise<void> {
  let resolvedOutDir: string;
  try {
    resolvedOutDir = prepareExtractAllTarget(outDir, overwrite);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
  return new Promise((resolve, reject) => {
    const { source, input, destroy } = createTarInputStream(archivePath, archiveKind);
    const extract = tar.extract();
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
        stream.on("end", () => next());
        return;
      }

      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const writeStream = fs.createWriteStream(destPath);
      stream.pipe(writeStream);
      writeStream.on("finish", () => next());
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
      resolve();
    });

    source.on("error", finishWithError);
    input.on("error", finishWithError);
    extract.on("error", finishWithError);
    input.pipe(extract);
  });
}

function extractAllGzip(archivePath: string, outDir: string, overwrite: boolean): Promise<void> {
  let resolvedOutDir: string;
  try {
    resolvedOutDir = prepareExtractAllTarget(outDir, overwrite);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
  const targetPath = resolveArchiveDestination(resolvedOutDir, getGzipEntryName(archivePath));
  return extractGzipEntry(archivePath, getGzipEntryName(archivePath), targetPath);
}

/**
 * Extract all entries to outDir.
 */
export function extractAll(
  archivePath: string,
  outDir: string,
  options: ExtractAllOptions = {},
): Promise<void> {
  const overwrite = options.overwrite ?? false;
  const archiveKind = detectArchiveKind(archivePath);
  switch (archiveKind) {
    case "zip":
      return extractAllZip(archivePath, outDir, overwrite);
    case "tar":
    case "tgz":
      return extractAllTar(archivePath, archiveKind, outDir, overwrite);
    case "gz":
      return extractAllGzip(archivePath, outDir, overwrite);
    default:
      return Promise.reject(new Error(`Unsupported archive kind: ${String(archiveKind)}`));
  }
}
