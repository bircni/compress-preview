import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { PassThrough } from "stream";
import * as yauzl from "yauzl";
import { listEntries, openEntryReadStream } from "../archive/archive";
import type * as archiveModule from "../archive/archive";

jest.mock("yauzl", () => ({
  open: jest.fn(),
}));

class FakeZipFile extends EventEmitter {
  close = jest.fn();
  readEntry = jest.fn();
  openReadStream = jest.fn();
}

function makeEntry(fileName: string, overrides: Partial<yauzl.Entry> = {}): yauzl.Entry {
  return {
    fileName,
    uncompressedSize: 4,
    compressedSize: 2,
    getLastModDate: () => new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  } as yauzl.Entry;
}

describe("archive mocked branches", () => {
  const openMock = yauzl.open as jest.MockedFunction<typeof yauzl.open>;
  const archivePath = path.join(process.cwd(), ".tmp", "mock-archive.zip");

  beforeEach(() => {
    openMock.mockReset();
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    fs.writeFileSync(archivePath, "zip");
  });

  afterEach(() => {
    jest.useRealTimers();
    fs.rmSync(archivePath, { force: true });
  });

  it("rejects listEntries when yauzl.open returns an error", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(new Error("open failed")));

    await expect(listEntries(archivePath)).rejects.toThrow("open failed");
  });

  it("rejects listEntries when no zipfile is returned", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(null, undefined));

    await expect(listEntries(archivePath)).rejects.toThrow("Failed to open zip");
  });

  it("returns a partial list when the timeout elapses", async () => {
    const zipfile = new FakeZipFile();
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const result = await listEntries(archivePath, { timeoutMs: 1 });

    expect(result.isPartial).toBe(true);
    expect(result.message).toContain("Partial");
    expect(zipfile.close).toHaveBeenCalled();
    expect(zipfile.readEntry).toHaveBeenCalled();
  });

  it("rejects listEntries when the zip emits an error", async () => {
    const zipfile = new FakeZipFile();
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = listEntries(archivePath);
    zipfile.emit("error", new Error("zip broke"));

    await expect(pending).rejects.toThrow("zip broke");
  });

  it("ignores timeout and late zip events after listEntries has already settled", async () => {
    jest.useFakeTimers();
    const zipfile = new FakeZipFile();
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = listEntries(archivePath, { timeoutMs: 10 });
    zipfile.emit("entry", makeEntry("file.txt"));
    zipfile.emit("end");
    const result = await pending;

    expect(result.isPartial).toBe(false);
    jest.advanceTimersByTime(10);
    expect(zipfile.close).not.toHaveBeenCalled();

    zipfile.emit("entry", makeEntry("late.txt"));
    zipfile.emit("end");
    zipfile.emit("error", new Error("ignored"));
    expect(zipfile.readEntry).toHaveBeenCalledTimes(2);
  });

  it("opens a matching entry stream after skipping non-matching entries", async () => {
    const zipfile = new FakeZipFile();
    const stream = new PassThrough();
    zipfile.openReadStream.mockImplementation((_entry, cb) => cb(null, stream));
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = openEntryReadStream(archivePath, "match.txt");
    zipfile.emit("entry", makeEntry("other.txt"));
    zipfile.emit("entry", makeEntry("./match.txt"));
    const result = await pending;

    expect(zipfile.readEntry).toHaveBeenCalledTimes(2);
    expect(result.entry.path).toBe("./match.txt");
    expect(result.entry.name).toBe("match.txt");
    expect(result.stream).toBe(stream);

    stream.emit("close");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("ignores late entry, end, and error events after openEntryReadStream has settled", async () => {
    const zipfile = new FakeZipFile();
    const stream = new PassThrough();
    zipfile.openReadStream.mockImplementation((_entry, cb) => cb(null, stream));
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = openEntryReadStream(archivePath, "file.txt");
    zipfile.emit("entry", makeEntry("file.txt"));
    await pending;

    stream.emit("close");
    zipfile.emit("entry", makeEntry("late.txt"));
    zipfile.emit("end");
    zipfile.emit("error", new Error("ignored"));

    expect(zipfile.close).toHaveBeenCalledTimes(1);
  });

  it("rejects when openEntryReadStream cannot open the archive", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(new Error("bad zip")));

    await expect(openEntryReadStream(archivePath, "a.txt")).rejects.toThrow("bad zip");
  });

  it("rejects when openEntryReadStream gets no zipfile", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(null, undefined));

    await expect(openEntryReadStream(archivePath, "a.txt")).rejects.toThrow("Failed to open zip");
  });

  it("rejects when openEntryReadStream receives a stream error", async () => {
    const zipfile = new FakeZipFile();
    zipfile.openReadStream.mockImplementation((_entry, cb) => cb(new Error("stream failed")));
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = openEntryReadStream(archivePath, "file.txt");
    zipfile.emit("entry", makeEntry("file.txt"));

    await expect(pending).rejects.toThrow("stream failed");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("rejects when openEntryReadStream gets no stream", async () => {
    const zipfile = new FakeZipFile();
    zipfile.openReadStream.mockImplementation((_entry, cb) => cb(null, undefined));
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = openEntryReadStream(archivePath, "file.txt");
    zipfile.emit("entry", makeEntry("file.txt"));

    await expect(pending).rejects.toThrow("No stream for entry");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("rejects when openEntryReadStream matches a directory entry", async () => {
    const zipfile = new FakeZipFile();
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = openEntryReadStream(archivePath, "folder");
    zipfile.emit("entry", makeEntry("folder/"));

    await expect(pending).rejects.toThrow("Cannot open a folder.");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("rejects when openEntryReadStream reaches the end without a matching entry", async () => {
    const zipfile = new FakeZipFile();
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = openEntryReadStream(archivePath, "missing.txt");
    zipfile.emit("entry", makeEntry("other.txt"));
    zipfile.emit("end");

    await expect(pending).rejects.toThrow("Entry not found in archive: missing.txt");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("rejects when openEntryReadStream receives a zip error before settling", async () => {
    const zipfile = new FakeZipFile();
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = openEntryReadStream(archivePath, "file.txt");
    zipfile.emit("error", "zip stream failed");

    await expect(pending).rejects.toThrow("zip stream failed");
    expect(zipfile.close).toHaveBeenCalled();
  });

  it("rejects listEntries and openEntryReadStream when detectArchiveKind returns an unsupported value", async () => {
    await jest.isolateModulesAsync(async () => {
      jest.doMock("../archive/format", () => ({
        detectArchiveKind: jest.fn(() => "rar"),
        getGzipEntryName: jest.fn(),
      }));

      const archiveModuleExports = require("../archive/archive") as typeof archiveModule;

      await expect(archiveModuleExports.listEntries(archivePath)).rejects.toThrow(
        "Unsupported archive kind: rar",
      );
      await expect(
        archiveModuleExports.openEntryReadStream(archivePath, "file.txt"),
      ).rejects.toThrow("Unsupported archive kind: rar");
    });
  });
});
