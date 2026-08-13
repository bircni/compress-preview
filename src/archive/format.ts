import * as path from "node:path";

export type TarKind = "tar" | "tgz" | "tbz" | "txz" | "tzst";
export type SingleFileKind = "gz" | "bz2" | "xz" | "zst";
export type ArchiveKind = "zip" | TarKind | SingleFileKind | "7z";

const ZIP_BASED_ARCHIVE_EXTENSIONS = [
  ".zip",
  ".jar",
  ".apk",
  ".vsix",
  ".xpi",
  ".whl",
  ".war",
  ".ear",
  ".epub",
  ".docx",
  ".pptx",
  ".xlsx",
  ".odt",
  ".ods",
  ".odp",
  ".aar",
  ".crx",
  ".nupkg",
  ".cbz",
  ".kmz",
  ".ipa",
  ".appx",
  ".msix",
] as const;

const TAR_ARCHIVE_EXTENSIONS = [".tar"] as const;
const TGZ_ARCHIVE_EXTENSIONS = [".tgz", ".tar.gz"] as const;
const TBZ_ARCHIVE_EXTENSIONS = [".tbz2", ".tbz", ".tar.bz2", ".tar.bzip2"] as const;
const TXZ_ARCHIVE_EXTENSIONS = [".txz", ".tar.xz"] as const;
const TZST_ARCHIVE_EXTENSIONS = [".tzst", ".tar.zst", ".tar.zstd"] as const;
const GZIP_ARCHIVE_EXTENSIONS = [".gz"] as const;
const BZIP2_ARCHIVE_EXTENSIONS = [".bz2", ".bzip2"] as const;
const XZ_ARCHIVE_EXTENSIONS = [".xz", ".lzma"] as const;
const ZSTD_ARCHIVE_EXTENSIONS = [".zst", ".zstd"] as const;
const SEVEN_ZIP_ARCHIVE_EXTENSIONS = [".7z"] as const;

const SUPPORTED_ARCHIVE_EXTENSIONS = [
  ...TBZ_ARCHIVE_EXTENSIONS,
  ...TXZ_ARCHIVE_EXTENSIONS,
  ...TZST_ARCHIVE_EXTENSIONS,
  ...TGZ_ARCHIVE_EXTENSIONS,
  ...BZIP2_ARCHIVE_EXTENSIONS,
  ...XZ_ARCHIVE_EXTENSIONS,
  ...ZSTD_ARCHIVE_EXTENSIONS,
  ...SEVEN_ZIP_ARCHIVE_EXTENSIONS,
  ...ZIP_BASED_ARCHIVE_EXTENSIONS,
  ...TAR_ARCHIVE_EXTENSIONS,
  ...GZIP_ARCHIVE_EXTENSIONS,
] as const;

export function isTarKind(kind: ArchiveKind): kind is TarKind {
  return kind === "tar" || kind === "tgz" || kind === "tbz" || kind === "txz" || kind === "tzst";
}

export function isSingleFileKind(kind: ArchiveKind): kind is SingleFileKind {
  return kind === "gz" || kind === "bz2" || kind === "xz" || kind === "zst";
}

export function detectArchiveKind(filePath: string): ArchiveKind {
  const lowerPath = filePath.toLowerCase();
  if (ZIP_BASED_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "zip";
  }
  if (TBZ_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "tbz";
  }
  if (TXZ_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "txz";
  }
  if (TZST_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "tzst";
  }
  if (TGZ_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "tgz";
  }
  if (TAR_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "tar";
  }
  if (SEVEN_ZIP_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "7z";
  }
  if (BZIP2_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "bz2";
  }
  if (XZ_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "xz";
  }
  if (ZSTD_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "zst";
  }
  if (GZIP_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "gz";
  }

  throw new Error(`Unsupported archive format: ${path.basename(filePath)}`);
}

export function stripSupportedArchiveExtension(fileName: string): string {
  const lowerName = fileName.toLowerCase();
  const matchingExtension = SUPPORTED_ARCHIVE_EXTENSIONS.find((extension) =>
    lowerName.endsWith(extension),
  );
  if (!matchingExtension) {
    return fileName;
  }

  return fileName.slice(0, -matchingExtension.length);
}

export function getGzipEntryName(filePath: string): string {
  const baseName = path.basename(filePath);
  return stripSupportedArchiveExtension(baseName);
}
