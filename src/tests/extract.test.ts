/**
 * Unit tests for src/archive/extract.ts — extract single, extract all, target dir.
 */

import * as fs from "fs";
import * as path from "path";
import archiver from "archiver";
import { extractAllTargetDir, extractEntry, extractAll } from "../archive/extract";

const TMP_DIR = path.join(process.cwd(), ".tmp/unit-extract");

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
});
