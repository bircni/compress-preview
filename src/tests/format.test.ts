import { describe, expect, it } from "vitest";
import {
  detectArchiveKind,
  getGzipEntryName,
  isSingleFileKind,
  isTarKind,
  stripSupportedArchiveExtension,
} from "../archive/format";

describe("archive format helpers", () => {
  it.each([
    ["/tmp/archive.zip", "zip"],
    ["/tmp/archive.jar", "zip"],
    ["/tmp/archive.apk", "zip"],
    ["/tmp/archive.vsix", "zip"],
    ["/tmp/archive.xpi", "zip"],
    ["/tmp/archive.whl", "zip"],
    ["/tmp/archive.war", "zip"],
    ["/tmp/archive.ear", "zip"],
    ["/tmp/archive.epub", "zip"],
    ["/tmp/archive.docx", "zip"],
    ["/tmp/archive.pptx", "zip"],
    ["/tmp/archive.xlsx", "zip"],
    ["/tmp/archive.odt", "zip"],
    ["/tmp/archive.ods", "zip"],
    ["/tmp/archive.odp", "zip"],
    ["/tmp/archive.aar", "zip"],
    ["/tmp/archive.crx", "zip"],
    ["/tmp/archive.nupkg", "zip"],
    ["/tmp/archive.cbz", "zip"],
    ["/tmp/archive.kmz", "zip"],
    ["/tmp/archive.ipa", "zip"],
    ["/tmp/archive.appx", "zip"],
    ["/tmp/archive.msix", "zip"],
    ["/tmp/archive.tar", "tar"],
    ["/tmp/archive.tgz", "tgz"],
    ["/tmp/archive.tar.gz", "tgz"],
    ["/tmp/archive.gz", "gz"],
    ["/tmp/archive.tbz2", "tbz"],
    ["/tmp/archive.tbz", "tbz"],
    ["/tmp/archive.tar.bz2", "tbz"],
    ["/tmp/archive.tar.bzip2", "tbz"],
    ["/tmp/archive.txz", "txz"],
    ["/tmp/archive.tar.xz", "txz"],
    ["/tmp/archive.tzst", "tzst"],
    ["/tmp/archive.tar.zst", "tzst"],
    ["/tmp/archive.tar.zstd", "tzst"],
    ["/tmp/archive.bz2", "bz2"],
    ["/tmp/archive.bzip2", "bz2"],
    ["/tmp/archive.xz", "xz"],
    ["/tmp/archive.lzma", "xz"],
    ["/tmp/archive.zst", "zst"],
    ["/tmp/archive.zstd", "zst"],
    ["/tmp/archive.7z", "7z"],
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
    ["archive.tar.xz", "archive"],
    ["archive.tar.bz2", "archive"],
    ["hello.txt.bz2", "hello.txt"],
    ["notes.zst", "notes"],
    ["bundle.7z", "bundle"],
    ["archive.bin", "archive.bin"],
  ])("strips supported extension from %s", (fileName, expected) => {
    expect(stripSupportedArchiveExtension(fileName)).toBe(expected);
  });

  it("derives the synthetic gzip entry name from the archive path", () => {
    expect(getGzipEntryName("/tmp/system.log.gz")).toBe("system.log");
    expect(getGzipEntryName("/tmp/hello.txt.bz2")).toBe("hello.txt");
    expect(getGzipEntryName("/tmp/notes.xz")).toBe("notes");
    expect(getGzipEntryName("/tmp/notes.zst")).toBe("notes");
  });

  it("identifies tar and single-file kinds", () => {
    expect(isTarKind("tar")).toBe(true);
    expect(isTarKind("tgz")).toBe(true);
    expect(isTarKind("tbz")).toBe(true);
    expect(isTarKind("txz")).toBe(true);
    expect(isTarKind("tzst")).toBe(true);
    expect(isTarKind("zip")).toBe(false);
    expect(isSingleFileKind("gz")).toBe(true);
    expect(isSingleFileKind("bz2")).toBe(true);
    expect(isSingleFileKind("xz")).toBe(true);
    expect(isSingleFileKind("zst")).toBe(true);
    expect(isSingleFileKind("7z")).toBe(false);
  });
});
