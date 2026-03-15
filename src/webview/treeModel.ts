import type { ArchiveEntry } from "../archive/entry";

export type ArchiveTreeNode = {
  key: string;
  parentPath: string;
  synthetic: boolean;
  entry: ArchiveEntry;
  children: ArchiveTreeNode[];
};

function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function compareEntries(a: ArchiveEntry, b: ArchiveEntry): number {
  const aPath = normalizePath(a.path);
  const bPath = normalizePath(b.path);
  const aParts = aPath.length > 0 ? aPath.split("/") : [];
  const bParts = bPath.length > 0 ? bPath.split("/") : [];
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (index >= aParts.length) {
      return -1;
    }
    if (index >= bParts.length) {
      return 1;
    }
    const aPart = aParts[index];
    const bPart = bParts[index];
    if (aPart !== bPart) {
      return aPart.localeCompare(bPart, undefined, { numeric: true, sensitivity: "base" });
    }
  }

  if (a.isDirectory !== b.isDirectory) {
    return a.isDirectory ? -1 : 1;
  }

  return aPath.localeCompare(bPath, undefined, { numeric: true, sensitivity: "base" });
}

function createFolderEntry(folderPath: string): ArchiveEntry {
  const normalizedPath = normalizePath(folderPath);
  const parts = normalizedPath.length > 0 ? normalizedPath.split("/") : [];
  const folderName = parts.length > 0 ? (parts.at(-1) ?? "root") : "root";
  return {
    path: `${normalizedPath}/`,
    name: folderName,
    isDirectory: true,
  };
}

function createNode(entry: ArchiveEntry, parentPath: string, synthetic: boolean): ArchiveTreeNode {
  return {
    key: normalizePath(entry.path),
    parentPath,
    synthetic,
    entry,
    children: [],
  };
}

function ensureFolderNode(
  nodeMap: Map<string, ArchiveTreeNode>,
  rootNodes: ArchiveTreeNode[],
  folderPath: string,
): ArchiveTreeNode | null {
  const key = normalizePath(folderPath);
  if (key.length === 0) {
    return null;
  }
  const existingNode = nodeMap.get(key);
  if (existingNode) {
    return existingNode;
  }

  const parentPath = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "";
  const parentNode = ensureFolderNode(nodeMap, rootNodes, parentPath);
  const nextNode = createNode(createFolderEntry(key), parentPath, true);
  nodeMap.set(key, nextNode);
  if (parentNode) {
    parentNode.children.push(nextNode);
  } else {
    rootNodes.push(nextNode);
  }
  return nextNode;
}

function sortNodeChildren(node: ArchiveTreeNode): void {
  node.children.sort((left, right) => compareEntries(left.entry, right.entry));
  node.children.forEach(sortNodeChildren);
}

export function buildArchiveTree(entries: ArchiveEntry[]): ArchiveTreeNode[] {
  const rootNodes: ArchiveTreeNode[] = [];
  const nodeMap = new Map<string, ArchiveTreeNode>();

  entries
    .slice()
    .sort(compareEntries)
    .forEach((rawEntry) => {
      const normalizedPath = normalizePath(rawEntry.path || rawEntry.name || "");
      const parentPath = normalizedPath.includes("/")
        ? normalizedPath.slice(0, normalizedPath.lastIndexOf("/"))
        : "";
      const parentNode = ensureFolderNode(nodeMap, rootNodes, parentPath);
      const nextEntry: ArchiveEntry = {
        path: rawEntry.path,
        name: rawEntry.name,
        isDirectory: rawEntry.isDirectory,
        size: rawEntry.size,
        compressedSize: rawEntry.compressedSize,
        mtime: rawEntry.mtime,
      };
      const existingNode = nodeMap.get(normalizedPath);
      if (existingNode) {
        existingNode.entry = nextEntry;
        existingNode.synthetic = false;
        return;
      }
      const nextNode = createNode(nextEntry, parentPath, false);
      nodeMap.set(normalizedPath, nextNode);
      if (parentNode) {
        parentNode.children.push(nextNode);
      } else {
        rootNodes.push(nextNode);
      }
    });

  rootNodes.sort((left, right) => compareEntries(left.entry, right.entry));
  rootNodes.forEach(sortNodeChildren);
  return rootNodes;
}
