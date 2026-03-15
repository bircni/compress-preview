import * as path from "path";

export type ArchiveKind = "zip" | "tar" | "tgz" | "gz";

export const ZIP_BASED_ARCHIVE_EXTENSIONS = [
  ".zip",
  ".jar",
  ".apk",
  ".vsix",
  ".xpi",
  ".whl",
  ".war",
  ".ear",
] as const;

export const TAR_ARCHIVE_EXTENSIONS = [".tar"] as const;
export const TGZ_ARCHIVE_EXTENSIONS = [".tgz", ".tar.gz"] as const;
export const GZIP_ARCHIVE_EXTENSIONS = [".gz"] as const;

export const SUPPORTED_ARCHIVE_EXTENSIONS = [
  ...ZIP_BASED_ARCHIVE_EXTENSIONS,
  ...TAR_ARCHIVE_EXTENSIONS,
  ...TGZ_ARCHIVE_EXTENSIONS,
  ...GZIP_ARCHIVE_EXTENSIONS,
] as const;

export function detectArchiveKind(filePath: string): ArchiveKind {
  const lowerPath = filePath.toLowerCase();
  if (ZIP_BASED_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "zip";
  }
  if (TGZ_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "tgz";
  }
  if (TAR_ARCHIVE_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "tar";
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
