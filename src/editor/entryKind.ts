import * as path from "node:path";

type EntryKind = "text" | "binary" | "folder";

const DEFAULT_TEXT_EXTENSIONS = new Set([
  "txt",
  "json",
  "md",
  "xml",
  "html",
  "htm",
  "css",
  "js",
  "ts",
  "jsx",
  "tsx",
  "log",
  "yml",
  "yaml",
  "csv",
  "json5",
  "sh",
  "bat",
  "cmd",
  "ps1",
  "r",
  "py",
  "sql",
  "env",
  "ini",
  "cfg",
  "conf",
  "text",
  "rst",
  "adoc",
]);

export function createTextExtensionSet(extra: readonly string[] = []): Set<string> {
  const textExtensions = new Set(DEFAULT_TEXT_EXTENSIONS);
  for (const extension of extra) {
    const normalized = extension.trim().toLowerCase().replace(/^\./, "");
    if (normalized) {
      textExtensions.add(normalized);
    }
  }
  return textExtensions;
}

export function isTextEntryName(name: string, textExtensions: Set<string>): boolean {
  const ext = path.extname(name).toLowerCase().replace(/^\./, "");
  return textExtensions.has(ext) || !ext;
}

export function classifyEntryKind(
  entry: { name: string; isDirectory: boolean },
  textExtensions: Set<string>,
): EntryKind {
  if (entry.isDirectory) {
    return "folder";
  }
  return isTextEntryName(entry.name, textExtensions) ? "text" : "binary";
}
