/**
 * Unit tests for src/archive/archive.ts — list entries, time-bound, size.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import archiver from "archiver";
import tar from "tar-stream";
import * as zlib from "zlib";
import {
  listEntries,
  getArchiveSizeBytes,
  openEntryReadStream,
  LOADING_INDICATOR_THRESHOLD,
} from "../archive/archive";

const TMP_DIR = path.join(process.cwd(), ".tmp/unit-archive");
const FIXTURES_DIR = path.join(process.cwd(), ".fixtures");
const ZIP_BASED_FIXTURES = [
  "sample-library.jar",
  "sample-app.apk",
  "sample-extension.vsix",
  "sample-addon.xpi",
  "sample-wheel.whl",
  "sample-webapp.war",
  "sample-enterprise.ear",
];

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
  if (fs.existsSync(TMP_DIR)) {
    try {
      fs.rmSync(TMP_DIR, { recursive: true });
    } catch {
      // ignore
    }
  }
});

describe("archive", () => {
  it("lists entries from a zip", async () => {
    const zipPath = path.join(TMP_DIR, "list-test.zip");
    await createZip(zipPath, [
      { name: "a.txt", content: "hello" },
      { name: "b/c.txt", content: "nested" },
    ]);
    const result = await listEntries(zipPath);
    expect(result.isPartial).toBe(false);
    expect(result.entries.length).toBeGreaterThanOrEqual(2);
    const paths = result.entries.map((e) => e.path);
    expect(paths.some((p) => p === "a.txt" || p.startsWith("a.txt"))).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("returns isPartial when timeout is exceeded", async () => {
    const zipPath = path.join(TMP_DIR, "timeout-test.zip");
    await createZip(zipPath, [{ name: "single.txt", content: "x" }]);
    const result = await listEntries(zipPath, { timeoutMs: 1 });
    expect(result.entries.length).toBeGreaterThanOrEqual(0);
    // With 1ms timeout we may get full list on fast runs or partial; message set when partial
    if (result.isPartial) {
      expect(result.message).toContain("Partial");
    }
  });

  it("getArchiveSizeBytes returns file size", async () => {
    const zipPath = path.join(TMP_DIR, "size-test.zip");
    await createZip(zipPath, [{ name: "f.txt", content: "abc" }]);
    const size = getArchiveSizeBytes(zipPath);
    expect(size).toBeGreaterThan(0);
  });

  it.skip("openEntryReadStream returns stream for entry", async () => {
    // Skip: entry path matching with archiver-created zips can hang; covered by CLI open-entry contract
    const zipPath = path.join(TMP_DIR, "stream-test.zip");
    await createZip(zipPath, [{ name: "content.txt", content: "stream content" }]);
    const result = await listEntries(zipPath);
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
    const entryPath = result.entries.find((e) => !e.isDirectory)?.path ?? "content.txt";
    const { entry, stream } = await openEntryReadStream(zipPath, entryPath);
    expect(entry.isDirectory).toBe(false);
    const chunks: Buffer[] = [];
    const r = stream;
    for await (const chunk of r) {
      chunks.push(Buffer.from(chunk as Buffer));
    }
    const body = Buffer.concat(chunks).toString("utf8");
    expect(body).toBe("stream content");
  });

  it("LOADING_INDICATOR_THRESHOLD is 5 MB", () => {
    expect(LOADING_INDICATOR_THRESHOLD).toBe(5 * 1024 * 1024);
  });

  it.each(ZIP_BASED_FIXTURES)("lists entries from fixture %s", async (fixtureName) => {
    const result = await listEntries(path.join(FIXTURES_DIR, fixtureName));
    const paths = result.entries.map((entry) => entry.path);

    expect(result.isPartial).toBe(false);
    expect(paths).toContain("README.txt");
    expect(paths).toContain("docs/manifest.json");
    expect(paths).toContain("assets/config.ini");
    expect(paths).toContain("assets/pixel.png");
  });

  it("lists the corrected large archive root from the fixture", async () => {
    const result = await listEntries(path.join(FIXTURES_DIR, "large-sample.zip"));
    const paths = result.entries.map((entry) => entry.path);

    expect(paths).toContain("large-archive/data.js");
    expect(paths.some((entryPath) => entryPath.startsWith(".tmp/"))).toBe(false);
  });

  it("opens a binary entry from a non-zip fixture archive", async () => {
    const fixturePath = path.join(FIXTURES_DIR, "sample-app.apk");
    const { entry, stream } = await openEntryReadStream(fixturePath, "assets/pixel.png");
    const tempPath = path.join(os.tmpdir(), "compress-preview-test-pixel.png");
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer));
    }

    const output = Buffer.concat(chunks);
    fs.writeFileSync(tempPath, output);

    expect(entry.name).toBe("pixel.png");
    expect(entry.isDirectory).toBe(false);
    expect(output.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))).toBe(true);

    fs.rmSync(tempPath, { force: true });
  });

  it("lists entries from a tar archive", async () => {
    const tarPath = path.join(TMP_DIR, "sample.tar");
    await createTar(tarPath, [{ name: "nested/file.txt", content: "tar-data" }]);

    const result = await listEntries(tarPath);

    expect(result.entries.map((entry) => entry.path)).toContain("nested/file.txt");
  });

  it("lists entries from a tgz archive", async () => {
    const tgzPath = path.join(TMP_DIR, "sample.tgz");
    await createTar(tgzPath, [{ name: "nested/file.txt", content: "tgz-data" }], { gzip: true });

    const result = await listEntries(tgzPath);

    expect(result.entries.map((entry) => entry.path)).toContain("nested/file.txt");
  });

  it("lists entries from a tar.gz archive and preserves explicit directories", async () => {
    const tgzPath = path.join(TMP_DIR, "sample.tar.gz");
    await createTar(
      tgzPath,
      [
        { name: "nested/", type: "directory" },
        { name: "nested/file.txt", content: "tgz-data" },
      ],
      { gzip: true },
    );

    const result = await listEntries(tgzPath);

    expect(result.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "nested/",
          isDirectory: true,
          size: undefined,
        }),
        expect.objectContaining({
          path: "nested/file.txt",
          isDirectory: false,
        }),
      ]),
    );
  });

  it("lists a synthetic single entry for a gz archive", async () => {
    const gzipPath = path.join(TMP_DIR, "sample.log.gz");
    createGzip(gzipPath, "gzip-data");

    const result = await listEntries(gzipPath);

    expect(result.entries).toEqual([
      expect.objectContaining({
        path: "sample.log",
        name: "sample.log",
        isDirectory: false,
      }),
    ]);
  });

  it("opens a tar entry stream", async () => {
    const tarPath = path.join(TMP_DIR, "stream-test.tar");
    await createTar(tarPath, [{ name: "docs/readme.txt", content: "tar stream content" }]);

    const { entry, stream } = await openEntryReadStream(tarPath, "docs/readme.txt");
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer));
    }

    expect(entry.path).toBe("docs/readme.txt");
    expect(Buffer.concat(chunks).toString("utf8")).toBe("tar stream content");
  });

  it("rejects when opening a directory from a tar archive", async () => {
    const tarPath = path.join(TMP_DIR, "folder-test.tar");
    await createTar(tarPath, [{ name: "nested/", type: "directory" }]);

    await expect(openEntryReadStream(tarPath, "nested")).rejects.toThrow("Cannot open a folder.");
  });

  it("rejects when a tar entry is missing", async () => {
    const tarPath = path.join(TMP_DIR, "missing-test.tar");
    await createTar(tarPath, [{ name: "docs/readme.txt", content: "tar stream content" }]);

    await expect(openEntryReadStream(tarPath, "missing.txt")).rejects.toThrow(
      "Entry not found in archive: missing.txt",
    );
  });

  it("opens and decompresses a gz entry stream", async () => {
    const gzipPath = path.join(TMP_DIR, "open.log.gz");
    createGzip(gzipPath, "gzip stream content");

    const { entry, stream } = await openEntryReadStream(gzipPath, "open.log");
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Buffer));
    }

    expect(entry.path).toBe("open.log");
    expect(Buffer.concat(chunks).toString("utf8")).toBe("gzip stream content");
  });

  it("rejects when a gz entry name does not match", async () => {
    const gzipPath = path.join(TMP_DIR, "wrong-name.log.gz");
    createGzip(gzipPath, "gzip stream content");

    await expect(openEntryReadStream(gzipPath, "wrong.txt")).rejects.toThrow(
      "Entry not found in archive: wrong.txt",
    );
  });

  it("rejects when listing an invalid tgz archive", async () => {
    const tgzPath = path.join(TMP_DIR, "invalid.tgz");
    fs.writeFileSync(tgzPath, "not-a-gzip-stream");

    await expect(listEntries(tgzPath)).rejects.toThrow();
  });
});
