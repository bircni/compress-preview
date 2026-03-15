/**
 * Archive entry metadata and content stream (data-model: ArchiveEntry).
 */

export type ArchiveEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  size?: number;
  compressedSize?: number;
  mtime?: Date | number;
};

export type EntryContentStream = {
  entry: ArchiveEntry;
  stream: NodeJS.ReadableStream;
};

/**
 * Build display name from path (basename).
 */
export function entryNameFromPath(entryPath: string): string {
  const name = entryPath.replace(/\/$/, "");
  const base = name.split("/").pop();
  return base ?? name;
}
