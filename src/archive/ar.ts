/**
 * Unix `ar` archives (.ar, .a, .deb). Flat list of members with 60-byte headers.
 * Supports GNU (`//` long-name table, `name/` terminators) and BSD (`#1/<len>`) naming.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ArchiveEntry, EntryContentStream } from "./entry";

const AR_MAGIC = "!<arch>\n";
const HEADER_SIZE = 60;
const BSD_LONG_NAME_PREFIX = "#1/";

type ArMember = {
  name: string;
  /** Byte offset of the member data (after header and any BSD inline name). */
  dataOffset: number;
  size: number;
  mtime: number;
};

function parseDecimal(field: string, label: string): number {
  const trimmed = field.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid ar archive: bad ${label} field`);
  }
  return Number(trimmed);
}

function readExactly(fd: number, length: number, position: number): Buffer {
  const buffer = Buffer.alloc(length);
  const bytesRead = fs.readSync(fd, buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error("Invalid ar archive: unexpected end of file");
  }
  return buffer;
}

function resolveGnuLongName(table: string | undefined, rawName: string): string {
  if (table === undefined) {
    throw new Error("Invalid ar archive: long name without a name table");
  }
  const offset = parseDecimal(rawName.slice(1), "long name offset");
  const end = table.indexOf("/\n", offset);
  if (offset >= table.length || end === -1) {
    throw new Error("Invalid ar archive: long name offset out of range");
  }
  return table.slice(offset, end);
}

function readMembers(archivePath: string): ArMember[] {
  const fd = fs.openSync(archivePath, "r");
  try {
    const fileSize = fs.fstatSync(fd).size;
    if (
      fileSize < AR_MAGIC.length ||
      readExactly(fd, AR_MAGIC.length, 0).toString("latin1") !== AR_MAGIC
    ) {
      throw new Error("Invalid ar archive: missing !<arch> signature");
    }

    const members: ArMember[] = [];
    let gnuNameTable: string | undefined;
    let position = AR_MAGIC.length;
    while (position + HEADER_SIZE <= fileSize) {
      const header = readExactly(fd, HEADER_SIZE, position).toString("latin1");
      if (header.slice(58, 60) !== "`\n") {
        throw new Error("Invalid ar archive: bad member header");
      }
      const rawName = header.slice(0, 16).trimEnd();
      const mtimeField = header.slice(16, 28).trim();
      const mtime = mtimeField.length > 0 ? parseDecimal(mtimeField, "mtime") : 0;
      const size = parseDecimal(header.slice(48, 58), "size");
      let dataOffset = position + HEADER_SIZE;
      let dataSize = size;
      if (dataOffset + size > fileSize) {
        throw new Error("Invalid ar archive: member extends past end of file");
      }

      let name: string | undefined;
      if (rawName === "//") {
        gnuNameTable = readExactly(fd, size, dataOffset).toString("utf8");
      } else if (rawName === "/" || rawName === "/SYM64/" || rawName.startsWith("__.SYMDEF")) {
        // Symbol table: not a user-visible member.
      } else if (rawName.startsWith(BSD_LONG_NAME_PREFIX)) {
        const nameLength = parseDecimal(rawName.slice(BSD_LONG_NAME_PREFIX.length), "name length");
        if (nameLength > size) {
          throw new Error("Invalid ar archive: long name exceeds member size");
        }
        name = readExactly(fd, nameLength, dataOffset).toString("utf8").replace(/\0+$/, "");
        dataOffset += nameLength;
        dataSize -= nameLength;
        if (name.startsWith("__.SYMDEF")) {
          name = undefined;
        }
      } else if (/^\/\d+$/.test(rawName)) {
        name = resolveGnuLongName(gnuNameTable, rawName);
      } else {
        name = rawName.endsWith("/") ? rawName.slice(0, -1) : rawName;
      }

      if (name !== undefined && name.length > 0) {
        members.push({ name, dataOffset, size: dataSize, mtime });
      }
      // Member data is padded to an even offset.
      position += HEADER_SIZE + size + (size % 2);
    }
    return members;
  } finally {
    fs.closeSync(fd);
  }
}

function toArchiveEntry(member: ArMember): ArchiveEntry {
  return {
    path: member.name,
    name: path.basename(member.name) || member.name,
    isDirectory: false,
    size: member.size,
    ...(member.mtime > 0 && { mtime: new Date(member.mtime * 1000) }),
  };
}

function findMember(archivePath: string, entryPath: string): ArMember {
  const member = readMembers(archivePath).find((candidate) => candidate.name === entryPath);
  if (!member) {
    throw new Error(`Entry not found in archive: ${entryPath}`);
  }
  return member;
}

function createMemberStream(archivePath: string, member: ArMember): NodeJS.ReadableStream {
  // `end` is inclusive, so it cannot express an empty range.
  return member.size === 0
    ? Readable.from([])
    : fs.createReadStream(archivePath, {
        start: member.dataOffset,
        end: member.dataOffset + member.size - 1,
      });
}

async function writeMember(archivePath: string, member: ArMember, outPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await pipeline(createMemberStream(archivePath, member), fs.createWriteStream(outPath));
}

function resolveArchiveDestination(rootDir: string, entryName: string): string {
  const safeSegments = entryName
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
  const candidatePath = path.resolve(rootDir, ...safeSegments);
  const relativePath = path.relative(rootDir, candidatePath);
  if (relativePath.length > 0 && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return candidatePath;
  }
  throw new Error(`Unsafe archive entry path: ${entryName}`);
}

export function listArEntries(archivePath: string): Promise<ArchiveEntry[]> {
  try {
    return Promise.resolve(readMembers(archivePath).map((member) => toArchiveEntry(member)));
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

export function openArEntryReadStream(
  archivePath: string,
  entryPath: string,
): Promise<EntryContentStream> {
  try {
    const member = findMember(archivePath, entryPath);
    return Promise.resolve({
      entry: toArchiveEntry(member),
      stream: createMemberStream(archivePath, member),
    });
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function extractArEntry(
  archivePath: string,
  entryPath: string,
  outPath: string,
): Promise<void> {
  await writeMember(archivePath, findMember(archivePath, entryPath), outPath);
}

export async function extractAllAr(
  archivePath: string,
  writeDir: string,
  includeEntry: (entryName: string) => boolean,
  requireMatch: boolean,
): Promise<void> {
  const members = readMembers(archivePath).filter((member) => includeEntry(member.name));
  if (members.length === 0 && requireMatch) {
    throw new Error("No matching entries to extract");
  }
  for (const member of members) {
    await writeMember(archivePath, member, resolveArchiveDestination(writeDir, member.name));
  }
}
