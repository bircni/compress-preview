import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { PassThrough } from "stream";
import * as yauzl from "yauzl";
import { extractAll, extractEntry } from "../archive/extract";
import type * as extractModule from "../archive/extract";

jest.mock("yauzl", () => ({
  open: jest.fn(),
}));

class FakeZipFile extends EventEmitter {
  close = jest.fn();
  readEntry = jest.fn();
  openReadStream = jest.fn();
}

function makeEntry(fileName: string): yauzl.Entry {
  return {
    fileName,
    uncompressedSize: 4,
    compressedSize: 2,
    getLastModDate: () => new Date("2024-01-01T00:00:00.000Z"),
  } as yauzl.Entry;
}

describe("extract mocked branches", () => {
  const openMock = yauzl.open as jest.MockedFunction<typeof yauzl.open>;
  const tmpDir = path.join(process.cwd(), ".tmp/mock-extract");

  beforeEach(() => {
    openMock.mockReset();
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rejects extractEntry when yauzl.open fails", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(new Error("open failed")));

    await expect(extractEntry("zip.zip", "file.txt", path.join(tmpDir, "out.txt"))).rejects.toThrow(
      "open failed",
    );
  });

  it("rejects extractEntry when no zipfile is returned", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(null, undefined));

    await expect(extractEntry("zip.zip", "file.txt", path.join(tmpDir, "out.txt"))).rejects.toThrow(
      "Failed to open zip",
    );
  });

  it("creates a directory when extracting a directory entry", async () => {
    const zipfile = new FakeZipFile();
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );
    const outPath = path.join(tmpDir, "folder");

    const pending = extractEntry("zip.zip", "folder", outPath);
    zipfile.emit("entry", makeEntry("folder/"));
    await pending;

    expect(fs.existsSync(outPath)).toBe(true);
    expect(zipfile.readEntry).toHaveBeenCalled();
  });

  it("rejects extractEntry when openReadStream returns no stream", async () => {
    const zipfile = new FakeZipFile();
    zipfile.openReadStream.mockImplementation((_entry, cb) => cb(null, undefined));
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = extractEntry("zip.zip", "file.txt", path.join(tmpDir, "out.txt"));
    zipfile.emit("entry", makeEntry("file.txt"));

    await expect(pending).rejects.toThrow("No stream for entry");
  });

  it("rejects extractEntry when the matching entry stream fails to open", async () => {
    const zipfile = new FakeZipFile();
    zipfile.openReadStream.mockImplementation((_entry, cb) => cb(new Error("stream failed")));
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = extractEntry("zip.zip", "file.txt", path.join(tmpDir, "out.txt"));
    zipfile.emit("entry", makeEntry("file.txt"));

    await expect(pending).rejects.toThrow("stream failed");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("rejects extractEntry when the matching entry is missing", async () => {
    const zipfile = new FakeZipFile();
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = extractEntry("zip.zip", "missing.txt", path.join(tmpDir, "out.txt"));
    zipfile.emit("entry", makeEntry("other.txt"));
    zipfile.emit("end");

    await expect(pending).rejects.toThrow("Entry not found in archive: missing.txt");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("rejects extractAll when yauzl.open fails", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(new Error("open failed")));

    await expect(
      extractAll("zip.zip", path.join(tmpDir, "out"), { overwrite: true }),
    ).rejects.toThrow("open failed");
  });

  it("rejects extractAll when no zipfile is returned", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(null, undefined));

    await expect(
      extractAll("zip.zip", path.join(tmpDir, "out"), { overwrite: true }),
    ).rejects.toThrow("Failed to open zip");
  });

  it("rejects extractAll when an entry stream fails to open", async () => {
    const zipfile = new FakeZipFile();
    zipfile.openReadStream.mockImplementation((_entry, cb) => cb(new Error("stream failed")));
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = extractAll("zip.zip", path.join(tmpDir, "out"), { overwrite: true });
    zipfile.emit("entry", makeEntry("file.txt"));

    await expect(pending).rejects.toThrow("stream failed");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("converts non-Error read stream failures during extractAll", async () => {
    const zipfile = new FakeZipFile();
    const stream = new PassThrough();
    zipfile.openReadStream.mockImplementation((_entry, cb) => cb(null, stream));
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = extractAll("zip.zip", path.join(tmpDir, "out"), { overwrite: true });
    zipfile.emit("entry", makeEntry("file.txt"));
    stream.emit("error", "stream-string-error");

    await expect(pending).rejects.toThrow("stream-string-error");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("rejects extractAll when an entry stream is missing", async () => {
    const zipfile = new FakeZipFile();
    zipfile.openReadStream.mockImplementation((_entry, cb) => cb(null, undefined));
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = extractAll("zip.zip", path.join(tmpDir, "out"), { overwrite: true });
    zipfile.emit("entry", makeEntry("file.txt"));

    await expect(pending).rejects.toThrow("No stream");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("rejects extractAll when an entry escapes the output directory", async () => {
    const zipfile = new FakeZipFile();
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = extractAll("zip.zip", path.join(tmpDir, "out"), { overwrite: true });
    zipfile.emit("entry", makeEntry("../outside.txt"));

    await expect(pending).rejects.toThrow("Unsafe archive entry path");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("ignores duplicate end events after extractAll has already resolved", async () => {
    const zipfile = new FakeZipFile();
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = extractAll("zip.zip", path.join(tmpDir, "out"), { overwrite: true });
    zipfile.emit("end");
    await pending;
    zipfile.emit("end");

    expect(zipfile.close).toHaveBeenCalledTimes(1);
  });

  it("rejects extractAll and extractEntry when detectArchiveKind returns an unsupported value", async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock("../archive/format", () => ({
        detectArchiveKind: jest.fn(() => "rar"),
        getGzipEntryName: jest.fn(),
        stripSupportedArchiveExtension: jest.fn((value: string) => value),
      }));

      const extractModuleExports = require("../archive/extract") as typeof extractModule;

      await expect(
        extractModuleExports.extractEntry("archive.rar", "file.txt", path.join(tmpDir, "out.txt")),
      ).rejects.toThrow("Unsupported archive kind: rar");
      await expect(
        extractModuleExports.extractAll("archive.rar", path.join(tmpDir, "out"), {
          overwrite: true,
        }),
      ).rejects.toThrow("Unsupported archive kind: rar");
    });
  });
});
