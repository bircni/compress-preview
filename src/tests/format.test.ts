import {
  detectArchiveKind,
  getGzipEntryName,
  stripSupportedArchiveExtension,
} from "../archive/format";

describe("archive format helpers", () => {
  it.each([
    ["/tmp/archive.zip", "zip"],
    ["/tmp/archive.jar", "zip"],
    ["/tmp/archive.apk", "zip"],
    ["/tmp/archive.tar", "tar"],
    ["/tmp/archive.tgz", "tgz"],
    ["/tmp/archive.tar.gz", "tgz"],
    ["/tmp/archive.gz", "gz"],
  ])("detects %s as %s", (archivePath, expectedKind) => {
    expect(detectArchiveKind(archivePath)).toBe(expectedKind);
  });

  it("rejects unsupported archive extensions", () => {
    expect(() => detectArchiveKind("/tmp/archive.txt")).toThrow("Unsupported archive format");
  });

  it.each([
    ["archive.zip", "archive"],
    ["archive.tar.gz", "archive"],
    ["archive.gz", "archive"],
    ["archive.bin", "archive.bin"],
  ])("strips supported extension from %s", (fileName, expected) => {
    expect(stripSupportedArchiveExtension(fileName)).toBe(expected);
  });

  it("derives the synthetic gzip entry name from the archive path", () => {
    expect(getGzipEntryName("/tmp/system.log.gz")).toBe("system.log");
  });
});
