import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import {
  cleanupTempPreviews,
  createTempPreviewPath,
  getEntryExtractionTarget,
  markTempPreviewUsed,
  normalizeArchiveEntrySegments,
  shouldReuseTempPreview,
} from "../editor/archivePaths";

describe("archivePaths", () => {
  it("normalizes archive entry segments", () => {
    expect(normalizeArchiveEntrySegments("./nested\\deeper/file.txt")).toEqual([
      "nested",
      "deeper",
      "file.txt",
    ]);
  });

  it("preserves relative structure for single-entry extraction", () => {
    expect(getEntryExtractionTarget("/tmp/out", "nested/deeper/file.txt")).toBe(
      path.join("/tmp/out", "nested", "deeper", "file.txt"),
    );
  });

  it("creates temp preview paths under the OS temp directory", () => {
    const tempPath = createTempPreviewPath("/archives/sample.zip", "images/logo.png");

    expect(tempPath.startsWith(path.join(os.tmpdir(), "compress-preview"))).toBe(true);
    expect(tempPath.endsWith(path.join("images", "logo.png"))).toBe(true);
  });

  it("reuses temp previews that are newer than the source archive", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-paths-"));
    const archivePath = path.join(tempDir, "sample.zip");
    const previewPath = path.join(tempDir, "preview.png");

    fs.writeFileSync(archivePath, "archive");
    fs.writeFileSync(previewPath, "preview");
    const now = new Date();
    const future = new Date(now.getTime() + 10_000);
    fs.utimesSync(archivePath, now, now);
    fs.utimesSync(previewPath, future, future);

    expect(shouldReuseTempPreview(archivePath, previewPath)).toBe(true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not reuse temp previews when the preview file is missing or stale", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-paths-"));
    const archivePath = path.join(tempDir, "sample.zip");
    const previewPath = path.join(tempDir, "preview.png");

    fs.writeFileSync(archivePath, "archive");
    expect(shouldReuseTempPreview(archivePath, previewPath)).toBe(false);

    fs.writeFileSync(previewPath, "preview");
    const now = new Date();
    const past = new Date(now.getTime() - 10_000);
    fs.utimesSync(archivePath, now, now);
    fs.utimesSync(previewPath, past, past);

    expect(shouldReuseTempPreview(archivePath, previewPath)).toBe(false);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("updates preview and archive cache timestamps when marking a temp preview as used", async () => {
    const previewPath = createTempPreviewPath("/archives/sample.zip", "images/logo.png");
    const previewDir = path.dirname(previewPath);
    const archiveCacheDir = path.dirname(previewDir);
    fs.mkdirSync(previewDir, { recursive: true });
    fs.writeFileSync(previewPath, "preview");

    const oldDate = new Date(Date.now() - 1000 * 60 * 60);
    fs.utimesSync(previewPath, oldDate, oldDate);
    fs.utimesSync(archiveCacheDir, oldDate, oldDate);

    await markTempPreviewUsed(previewPath);

    expect(fs.statSync(previewPath).mtimeMs).toBeGreaterThan(oldDate.getTime());
    expect(fs.statSync(archiveCacheDir).mtimeMs).toBeGreaterThan(oldDate.getTime());

    fs.rmSync(path.dirname(archiveCacheDir), { recursive: true, force: true });
  });

  it("creates the cache directory when marking a missing preview as used", async () => {
    const previewPath = createTempPreviewPath("/archives/missing.zip", "images/logo.png");
    const previewDir = path.dirname(previewPath);
    const archiveCacheDir = path.dirname(previewDir);
    fs.rmSync(archiveCacheDir, { recursive: true, force: true });

    await markTempPreviewUsed(previewPath);

    expect(fs.existsSync(archiveCacheDir)).toBe(true);
    expect(fs.existsSync(previewPath)).toBe(false);

    fs.rmSync(path.dirname(archiveCacheDir), { recursive: true, force: true });
  });

  it("cleans up expired preview directories", async () => {
    const previewPath = createTempPreviewPath("/archives/old.zip", "bin/file.bin");
    const hashDir = path.dirname(path.dirname(previewPath));
    const cacheRoot = path.dirname(hashDir);
    fs.mkdirSync(path.dirname(previewPath), { recursive: true });
    fs.writeFileSync(previewPath, "preview");

    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 8);
    fs.utimesSync(hashDir, oldDate, oldDate);

    await cleanupTempPreviews();

    expect(fs.existsSync(hashDir)).toBe(false);
    fs.rmSync(cacheRoot, { recursive: true, force: true });
  });

  it("returns immediately when the preview cache root does not exist", async () => {
    const cacheRoot = path.join(os.tmpdir(), "compress-preview");
    fs.rmSync(cacheRoot, { recursive: true, force: true });

    await expect(cleanupTempPreviews()).resolves.toBeUndefined();
  });

  it("ignores non-directory entries in the preview cache root", async () => {
    const cacheRoot = path.join(os.tmpdir(), "compress-preview");
    fs.mkdirSync(cacheRoot, { recursive: true });
    fs.writeFileSync(path.join(cacheRoot, "note.txt"), "ignore me");

    await cleanupTempPreviews();

    expect(fs.existsSync(path.join(cacheRoot, "note.txt"))).toBe(true);
    fs.rmSync(cacheRoot, { recursive: true, force: true });
  });
});
