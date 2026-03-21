/**
 * Unit tests for src/archive/extract.ts — extract single, extract all, target dir.
 */

import * as fs from "fs";
import * as path from "path";
import archiver from "archiver";
import tar from "tar-stream";
import * as zlib from "zlib";
import { extractAllTargetDir, extractEntry, extractAll } from "../archive/extract";

const TMP_DIR = path.join(process.cwd(), ".tmp/unit-extract");
const FIXTURES_DIR = path.join(process.cwd(), ".fixtures");

type TarFixtureEntry = {
  name: string;
  content?: string;
  type?: tar.Headers["type"];
};

function createZip(zipPath: string, files: { name: string; content: string }[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 0 } });
    out.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(out);
    for (const f of files) {
      archive.append(f.content, { name: f.name });
    }
    archive.finalize();
  });
}

function createTar(
  tarPath: string,
  files: TarFixtureEntry[],
  options: { gzip?: boolean } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const pack = tar.pack();
    const out = fs.createWriteStream(tarPath);
    const target = options.gzip ? pack.pipe(zlib.createGzip()) : pack;
    target.pipe(out);
    out.on("close", resolve);
    out.on("error", reject);
    pack.on("error", reject);
    files.forEach((file) => {
      if (file.type === "directory") {
        pack.entry({ name: file.name, type: "directory" }, (error) => {
          if (error) {
            reject(error);
          }
        });
        return;
      }
      pack.entry({ name: file.name, type: file.type }, file.content ?? "", (error) => {
        if (error) {
          reject(error);
        }
      });
    });
    pack.finalize();
  });
}

function createGzip(gzipPath: string, content: string): void {
  fs.writeFileSync(gzipPath, zlib.gzipSync(content));
}

beforeAll(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  try {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true });
    }
  } catch {
    // ignore
  }
});

describe("extract", () => {
  it("extractAllTargetDir returns sibling folder with base name", () => {
    expect(extractAllTargetDir("/data/uuu/artifact.zip")).toMatch(/artifact$/);
    expect(extractAllTargetDir("artifact.zip")).toMatch(/artifact$/);
    expect(extractAllTargetDir("/tmp/plugin.vsix")).toMatch(/plugin$/);
    expect(extractAllTargetDir("/tmp/app.apk")).toMatch(/app$/);
    expect(extractAllTargetDir("/tmp/bundle.tar.gz")).toMatch(/bundle$/);
    expect(extractAllTargetDir("/tmp/data.gz")).toMatch(/data$/);
  });

  it("extractEntry writes file to outPath", async () => {
    const zipPath = path.join(TMP_DIR, "extract-one.zip");
    await createZip(zipPath, [{ name: "one.txt", content: "content one" }]);
    const outPath = path.join(TMP_DIR, "out-one.txt");
    await extractEntry(zipPath, "one.txt", outPath);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.readFileSync(outPath, "utf8")).toBe("content one");
  });

  it("extractAll writes all entries to outDir", async () => {
    const zipPath = path.join(TMP_DIR, "extract-all.zip");
    await createZip(zipPath, [
      { name: "a.txt", content: "a" },
      { name: "b.txt", content: "b" },
    ]);
    const outDir = path.join(TMP_DIR, "extract-all-out");
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
    await extractAll(zipPath, outDir, { overwrite: true });
    expect(fs.readFileSync(path.join(outDir, "a.txt"), "utf8")).toBe("a");
    expect(fs.readFileSync(path.join(outDir, "b.txt"), "utf8")).toBe("b");
  });

  it("extractAll rejects if outDir exists and overwrite is false", async () => {
    const zipPath = path.join(TMP_DIR, "extract-all.zip");
    const outDir = path.join(TMP_DIR, "existing-dir");
    fs.mkdirSync(outDir, { recursive: true });
    await expect(extractAll(zipPath, outDir, { overwrite: false })).rejects.toThrow(
      /already exists/,
    );
  });

  it("extractAll removes an existing target directory when overwrite is true", async () => {
    const zipPath = path.join(TMP_DIR, "extract-overwrite.zip");
    await createZip(zipPath, [{ name: "fresh.txt", content: "fresh" }]);
    const outDir = path.join(TMP_DIR, "overwrite-out");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "stale.txt"), "stale");

    await extractAll(zipPath, outDir, { overwrite: true });

    expect(fs.existsSync(path.join(outDir, "stale.txt"))).toBe(false);
    expect(fs.readFileSync(path.join(outDir, "fresh.txt"), "utf8")).toBe("fresh");
  });

  it("extracts the fixture APK preserving nested files", async () => {
    const fixturePath = path.join(FIXTURES_DIR, "sample-app.apk");
    const outDir = path.join(TMP_DIR, "fixture-apk-out");
    fs.rmSync(outDir, { recursive: true, force: true });

    await extractAll(fixturePath, outDir, { overwrite: true });

    expect(fs.readFileSync(path.join(outDir, "README.txt"), "utf8")).toContain("Archive fixture");
    expect(fs.readFileSync(path.join(outDir, "docs", "manifest.json"), "utf8")).toContain(
      '"compress-preview-fixture"',
    );
  });

  it("extracts the corrected large fixture without the old .tmp prefix", async () => {
    const fixturePath = path.join(FIXTURES_DIR, "large-sample.zip");
    const outDir = path.join(TMP_DIR, "fixture-large-out");
    fs.rmSync(outDir, { recursive: true, force: true });

    await extractAll(fixturePath, outDir, { overwrite: true });

    expect(fs.existsSync(path.join(outDir, "large-archive", "data.js"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, ".tmp"))).toBe(false);
  });

  it("extracts a single file from a tar archive", async () => {
    const tarPath = path.join(TMP_DIR, "extract-one.tar");
    await createTar(tarPath, [{ name: "nested/file.txt", content: "tar-entry" }]);
    const outPath = path.join(TMP_DIR, "tar-out.txt");

    await extractEntry(tarPath, "nested/file.txt", outPath);

    expect(fs.readFileSync(outPath, "utf8")).toBe("tar-entry");
  });

  it("extracts a directory entry from a tar archive", async () => {
    const tarPath = path.join(TMP_DIR, "extract-dir.tar");
    await createTar(tarPath, [{ name: "nested/", type: "directory" }]);
    const outPath = path.join(TMP_DIR, "tar-dir-out");
    fs.rmSync(outPath, { recursive: true, force: true });

    await extractEntry(tarPath, "nested", outPath);

    expect(fs.statSync(outPath).isDirectory()).toBe(true);
  });

  it("rejects when a tar entry is missing", async () => {
    const tarPath = path.join(TMP_DIR, "extract-missing.tar");
    await createTar(tarPath, [{ name: "nested/file.txt", content: "tar-entry" }]);

    await expect(
      extractEntry(tarPath, "missing.txt", path.join(TMP_DIR, "missing.txt")),
    ).rejects.toThrow("Entry not found in archive: missing.txt");
  });

  it("extracts all files from a tgz archive", async () => {
    const tgzPath = path.join(TMP_DIR, "extract-all.tgz");
    await createTar(
      tgzPath,
      [
        { name: "nested/file.txt", content: "tgz-entry" },
        { name: "nested/other.txt", content: "tgz-other" },
      ],
      { gzip: true },
    );
    const outDir = path.join(TMP_DIR, "tgz-out");
    fs.rmSync(outDir, { recursive: true, force: true });

    await extractAll(tgzPath, outDir, { overwrite: true });

    expect(fs.readFileSync(path.join(outDir, "nested", "file.txt"), "utf8")).toBe("tgz-entry");
    expect(fs.readFileSync(path.join(outDir, "nested", "other.txt"), "utf8")).toBe("tgz-other");
  });

  it("extracts the decompressed file from a gz archive", async () => {
    const gzipPath = path.join(TMP_DIR, "extract.log.gz");
    createGzip(gzipPath, "gzip-entry");
    const outDir = path.join(TMP_DIR, "gz-out");
    fs.rmSync(outDir, { recursive: true, force: true });

    await extractAll(gzipPath, outDir, { overwrite: true });

    expect(fs.readFileSync(path.join(outDir, "extract.log"), "utf8")).toBe("gzip-entry");
  });

  it("rejects when extracting an invalid gzip archive", async () => {
    const gzipPath = path.join(TMP_DIR, "invalid.gz");
    fs.writeFileSync(gzipPath, "not-a-valid-gzip-stream");
    const outDir = path.join(TMP_DIR, "invalid-gz-out");
    fs.rmSync(outDir, { recursive: true, force: true });

    await expect(extractAll(gzipPath, outDir, { overwrite: true })).rejects.toThrow();
    await expect(
      extractEntry(gzipPath, "invalid", path.join(TMP_DIR, "invalid.txt")),
    ).rejects.toThrow();
  });

  it("rejects when a gz entry name does not match", async () => {
    const gzipPath = path.join(TMP_DIR, "wrong-name.gz");
    createGzip(gzipPath, "gzip-entry");

    await expect(
      extractEntry(gzipPath, "other.txt", path.join(TMP_DIR, "other.txt")),
    ).rejects.toThrow("Entry not found in archive: other.txt");
  });

  it("rejects tar extraction when an entry escapes the output directory", async () => {
    const tarPath = path.join(TMP_DIR, "unsafe.tar");
    await createTar(tarPath, [{ name: "../evil.txt", content: "evil" }]);
    const outDir = path.join(TMP_DIR, "unsafe-out");
    fs.rmSync(outDir, { recursive: true, force: true });

    await expect(extractAll(tarPath, outDir, { overwrite: true })).rejects.toThrow(
      "Unsafe archive entry path",
    );
  });
});
