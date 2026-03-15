/**
 * Extract single entry or all entries to disk. Sibling-folder rule: same dir as zip, folder name = zip base name.
 */

import * as fs from "fs";
import * as path from "path";
import * as yauzl from "yauzl";

export type ExtractAllOptions = {
  overwrite?: boolean;
};

/**
 * Compute target directory for "extract all": same directory as zip, folder name = zip base name without .zip.
 * Example: data/uuu/artifact.zip -> data/uuu/artifact
 */
export function extractAllTargetDir(zipPath: string): string {
  const resolved = path.resolve(zipPath);
  const dir = path.dirname(resolved);
  const base = path.basename(resolved, ".zip");
  return path.join(dir, base);
}

/**
 * Extract a single entry from the zip to outPath (file or directory).
 */
export function extractEntry(zipPath: string, entryPath: string, outPath: string): Promise<void> {
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

        zipfile.on("entry", (entry: yauzl.Entry): void => {
          const normalized = entry.fileName.replace(/\/$/, "");
          if (normalized !== entryPath && entry.fileName !== entryPath) {
            zipfile.readEntry();
            return;
          }
          if (entry.fileName.endsWith("/")) {
            fs.mkdirSync(outPath, { recursive: true });
            zipfile.readEntry();
            resolve();
            return;
          }
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
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
              const writeStream = fs.createWriteStream(outPath);
              readStream.pipe(writeStream);
              writeStream.on("finish", () => {
                zipfile.close();
                resolve();
              });
              writeStream.on("error", (e) => {
                zipfile.close();
                reject(e);
              });
            },
          );
        });

        zipfile.on("error", reject);
        zipfile.readEntry();
      },
    );
  });
}

/**
 * Extract all entries to outDir. If overwrite is false and outDir exists, caller should prompt (handled in extension).
 */
export function extractAll(
  zipPath: string,
  outDir: string,
  options: ExtractAllOptions = {},
): Promise<void> {
  const overwrite = options.overwrite ?? false;
  return new Promise((resolve, reject) => {
    if (fs.existsSync(outDir) && !overwrite) {
      reject(new Error("Target directory already exists; use overwrite or choose another path"));
      return;
    }
    if (overwrite && fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
    fs.mkdirSync(outDir, { recursive: true });
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

        const onDone = (e?: Error) => {
          if (e) {
            done = true;
            zipfile.close();
            reject(e);
            return;
          }
          pending--;
          zipfile.readEntry();
          maybeResolve();
        };

        zipfile.on("entry", (entry: yauzl.Entry): void => {
          const normalizedName = entry.fileName.replace(/\\/g, "/");
          const destPath = path.join(outDir, ...normalizedName.split("/").filter(Boolean));
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
              writeStream.on("error", (e) => onDone(e));
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
