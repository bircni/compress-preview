import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const TEMP_PREVIEW_ROOT = path.join(os.tmpdir(), "compress-preview");

/** Default max age (7 days) for `cleanupTempPreviews` when no value is passed. */
export const DEFAULT_TEMP_PREVIEW_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

export function normalizeArchiveEntrySegments(entryPath: string): string[] {
  return entryPath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
}

export function getEntryExtractionTarget(baseDir: string, entryPath: string): string {
  return path.join(baseDir, ...normalizeArchiveEntrySegments(entryPath));
}

export function createTempPreviewPath(zipPath: string, entryPath: string): string {
  const relativePath = path.join(...normalizeArchiveEntrySegments(entryPath));
  const archiveHash = createHash("sha1").update(path.resolve(zipPath)).digest("hex").slice(0, 12);
  return path.join(TEMP_PREVIEW_ROOT, archiveHash, relativePath);
}

export function shouldReuseTempPreview(archivePath: string, tempPreviewPath: string): boolean {
  if (!fs.existsSync(archivePath) || !fs.existsSync(tempPreviewPath)) {
    return false;
  }

  const archiveStat = fs.statSync(archivePath);
  const previewStat = fs.statSync(tempPreviewPath);
  return previewStat.mtimeMs >= archiveStat.mtimeMs;
}

export async function markTempPreviewUsed(tempPreviewPath: string): Promise<void> {
  const previewDir = path.dirname(tempPreviewPath);
  const stamp = new Date();

  await fs.promises.mkdir(previewDir, { recursive: true });

  if (fs.existsSync(tempPreviewPath)) {
    await fs.promises.utimes(tempPreviewPath, stamp, stamp);
  }

  const archiveCacheDir = path.dirname(previewDir);
  await fs.promises.utimes(archiveCacheDir, stamp, stamp);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

export async function cleanupTempPreviews(
  maxAgeMs: number = DEFAULT_TEMP_PREVIEW_MAX_AGE_MS,
): Promise<void> {
  if (!fs.existsSync(TEMP_PREVIEW_ROOT)) {
    return;
  }

  const now = Date.now();
  let rootEntries: fs.Dirent[];
  try {
    rootEntries = await fs.promises.readdir(TEMP_PREVIEW_ROOT, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return;
    }
    throw error;
  }

  await Promise.all(
    rootEntries.map(async (entry) => {
      if (!entry.isDirectory()) {
        return;
      }
      const candidatePath = path.join(TEMP_PREVIEW_ROOT, entry.name);
      let stats: fs.Stats;
      try {
        stats = await fs.promises.stat(candidatePath);
      } catch (error) {
        if (hasErrorCode(error, "ENOENT")) {
          return;
        }
        throw error;
      }

      if (now - stats.mtimeMs > maxAgeMs) {
        await fs.promises.rm(candidatePath, { recursive: true, force: true });
      }
    }),
  );
}
