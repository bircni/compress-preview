import { EventEmitter } from "events";
import { PassThrough } from "stream";
import * as yauzl from "yauzl";
import { listEntries, openEntryReadStream } from "../archive/archive";

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

  beforeEach(() => {
    openMock.mockReset();
  });

  it("rejects listEntries when yauzl.open returns an error", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(new Error("open failed")));

    await expect(listEntries(__filename)).rejects.toThrow("open failed");
  });

  it("rejects listEntries when no zipfile is returned", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(null, undefined));

    await expect(listEntries(__filename)).rejects.toThrow("Failed to open zip");
  });

  it("returns a partial list when the timeout elapses", async () => {
    const zipfile = new FakeZipFile();
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const result = await listEntries(__filename, { timeoutMs: 1 });

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

    const pending = listEntries(__filename);
    zipfile.emit("error", new Error("zip broke"));

    await expect(pending).rejects.toThrow("zip broke");
  });

  it("opens a matching entry stream after skipping non-matching entries", async () => {
    const zipfile = new FakeZipFile();
    const stream = new PassThrough();
    zipfile.openReadStream.mockImplementation((_entry, cb) => cb(null, stream));
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = openEntryReadStream(__filename, "match.txt");
    zipfile.emit("entry", makeEntry("other.txt"));
    zipfile.emit("entry", makeEntry("./match.txt"));
    const result = await pending;

    expect(zipfile.readEntry).toHaveBeenCalledTimes(2);
    expect(result.entry.path).toBe("./match.txt");
    expect(result.entry.name).toBe("match.txt");
    expect(result.stream).toBe(stream);
  });

  it("rejects when openEntryReadStream cannot open the archive", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(new Error("bad zip")));

    await expect(openEntryReadStream(__filename, "a.txt")).rejects.toThrow("bad zip");
  });

  it("rejects when openEntryReadStream gets no zipfile", async () => {
    openMock.mockImplementation((_zipPath, _options, cb) => cb(null, undefined));

    await expect(openEntryReadStream(__filename, "a.txt")).rejects.toThrow("Failed to open zip");
  });

  it("rejects when openEntryReadStream receives a stream error", async () => {
    const zipfile = new FakeZipFile();
    zipfile.openReadStream.mockImplementation((_entry, cb) => cb(new Error("stream failed")));
    openMock.mockImplementation((_zipPath, _options, cb) =>
      cb(null, zipfile as unknown as yauzl.ZipFile),
    );

    const pending = openEntryReadStream(__filename, "file.txt");
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

    const pending = openEntryReadStream(__filename, "file.txt");
    zipfile.emit("entry", makeEntry("file.txt"));

    await expect(pending).rejects.toThrow("No stream for entry");
    expect(zipfile.close).toHaveBeenCalled();
  });
});
