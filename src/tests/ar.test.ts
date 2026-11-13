import * as fs from "node:fs";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listEntries, openEntryReadStream } from "../archive/archive";
import { extractAll, extractEntries, extractEntry } from "../archive/extract";

const TMP_DIR = path.join(process.cwd(), ".tmp/unit-ar");

// `ar rcD lib.a short.txt a-very-long-member-name.txt odd` (GNU, with `//` name table).
const GNU_LIB =
  "ITxhcmNoPgovLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAzMCAgICAgICAgYAphLXZlcnktbG9uZy1tZW1iZXItbmFtZS50eHQvCgpzaG9ydC50eHQvICAgICAgMCAgICAgICAgICAgMCAgICAgMCAgICAgNjQ0ICAgICA5ICAgICAgICAgYApoZWxsbyBhcgoKLzAgICAgICAgICAgICAgIDAgICAgICAgICAgIDAgICAgIDAgICAgIDY0NCAgICAgMTcgICAgICAgIGAKbG9uZyBuYW1lIG1lbWJlcgoKb2RkLyAgICAgICAgICAgIDAgICAgICAgICAgIDAgICAgIDAgICAgIDY0NCAgICAgMyAgICAgICAgIGAKb2RkCg==";
// `dpkg-deb -Zgzip -b` of a minimal package.
const SAMPLE_DEB =
  "ITxhcmNoPgpkZWJpYW4tYmluYXJ5ICAgMCAgICAgICAgICAgMCAgICAgMCAgICAgMTAwNjQ0ICA0ICAgICAgICAgYAoyLjAKY29udHJvbC50YXIuZ3ogIDAgICAgICAgICAgIDAgICAgIDAgICAgIDEwMDY0NCAgMjA5ICAgICAgIGAKH4sIAAAAAAACA+3STWrDMBCGYa11Cp3AsZPYAVNKA9kGuupeiKExVawgT8DHj8gupT8rFwrvA2IGNMzmm2plFlcXu7a91+Jz/aLfde3auNb8geukPjtnckr609xv//9UtQpp1Jziwvl32+23+Teb7jH/plmXc3E1+S/u1YcP/y69O0mMyb5JnoY09q6parvP4TSoBL3mMuBjtEc/jFqe5N7N7ml+kdmfL1GqkM7P9iBTyMNF7wtUJrUGAAAAAAAAAAAAAAAAwIJuptVKUwAoAAAKZGF0YS50YXIuZ3ogICAgIDAgICAgICAgICAgIDAgICAgIDAgICAgIDEwMDY0NCAgMTg0ICAgICAgIGAKH4sIAAAAAAACA+3UvQrCMBRA4cw+RZ6gib1JOgt2dPENihYqFAJp+/4WxyJ1sT/K+ZYbuNkOSWbU4uyo8P41R9P55lwEnyvt1QqGrq+S1irF2M/d+7T/UZkZumR21v9oXRD6r9e/a6pUm/30P/rg6b92/3u8mX30z0X4/zfp39RtG83W/cUJ73/D/tfydL6U3+wfnJvpL5P+TmxQ2tJ/cc3joAAAAAAAAAAAAAD8hyfRMgLzACgAAA==";

type Member = { name: string; data: string | Buffer; mtime?: number };

function header(name: string, size: number, mtime = 0): string {
  return `${name.padEnd(16)}${String(mtime).padEnd(12)}${"0".padEnd(6)}${"0".padEnd(6)}${"644".padEnd(8)}${String(size).padEnd(10)}\`\n`;
}

function pad(buffer: Buffer): Buffer {
  return buffer.length % 2 === 0 ? buffer : Buffer.concat([buffer, Buffer.from("\n")]);
}

/** Build a BSD-style archive: `#1/<len>` names stored inline before the data. */
function buildBsd(members: Member[]): Buffer {
  const parts: Buffer[] = [Buffer.from("!<arch>\n")];
  for (const member of members) {
    const name = Buffer.from(member.name);
    const data = Buffer.from(member.data);
    parts.push(
      Buffer.from(header(`#1/${name.length}`, name.length + data.length, member.mtime)),
      pad(Buffer.concat([name, data])),
    );
  }
  return Buffer.concat(parts);
}

/** Build a GNU-style archive with a `/` symbol table and `//` long-name table. */
function buildGnu(members: Member[]): Buffer {
  const longNames = members.filter((member) => member.name.length > 15);
  let table = "";
  const offsets = new Map<string, number>();
  for (const member of longNames) {
    offsets.set(member.name, table.length);
    table += `${member.name}/\n`;
  }
  const symbols = Buffer.alloc(4);
  const parts: Buffer[] = [
    Buffer.from("!<arch>\n"),
    Buffer.from(header("/", symbols.length)),
    symbols,
  ];
  if (table.length > 0) {
    parts.push(Buffer.from(header("//", table.length)), pad(Buffer.from(table)));
  }
  for (const member of members) {
    const data = Buffer.from(member.data);
    const offset = offsets.get(member.name);
    const name = offset === undefined ? `${member.name}/` : `/${offset}`;
    parts.push(Buffer.from(header(name, data.length, member.mtime)), pad(data));
  }
  return Buffer.concat(parts);
}

function writeArchive(fileName: string, content: Buffer | string): string {
  const archivePath = path.join(TMP_DIR, fileName);
  fs.writeFileSync(
    archivePath,
    typeof content === "string" ? Buffer.from(content, "base64") : content,
  );
  return archivePath;
}

async function readEntry(archivePath: string, entryPath: string): Promise<string> {
  const { stream } = await openEntryReadStream(archivePath, entryPath);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks).toString("utf8");
}

beforeAll(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("ar archives", () => {
  it("lists and reads a GNU ar library with long names", async () => {
    const archivePath = writeArchive("lib.a", GNU_LIB);

    const listed = await listEntries(archivePath);
    expect(listed.isPartial).toBe(false);
    expect(listed.entries.map((entry) => [entry.path, entry.size])).toEqual([
      ["short.txt", 9],
      ["a-very-long-member-name.txt", 17],
      ["odd", 3],
    ]);
    await expect(readEntry(archivePath, "a-very-long-member-name.txt")).resolves.toBe(
      "long name member\n",
    );
    await expect(readEntry(archivePath, "odd")).resolves.toBe("odd");
  });

  it("lists, reads and extracts a Debian package", async () => {
    const archivePath = writeArchive("hello_1.0_all.deb", SAMPLE_DEB);

    const listed = await listEntries(archivePath);
    expect(listed.entries.map((entry) => entry.path)).toEqual([
      "debian-binary",
      "control.tar.gz",
      "data.tar.gz",
    ]);
    await expect(readEntry(archivePath, "debian-binary")).resolves.toBe("2.0\n");

    const outDir = path.join(TMP_DIR, "deb-out");
    await extractAll(archivePath, outDir, { overwrite: true });
    expect(fs.readdirSync(outDir).toSorted()).toEqual([
      "control.tar.gz",
      "data.tar.gz",
      "debian-binary",
    ]);
    expect(fs.statSync(path.join(outDir, "data.tar.gz")).size).toBe(184);
  });

  it("skips symbol tables and resolves GNU and BSD long names", async () => {
    const members: Member[] = [
      { name: "x.o", data: "abc", mtime: 1_700_000_000 },
      { name: "much-longer-than-sixteen.o", data: "" },
    ];
    for (const [fileName, content] of [
      ["gnu.a", buildGnu(members)],
      ["bsd.a", buildBsd([{ name: "__.SYMDEF SORTED", data: "syms" }, ...members])],
    ] as const) {
      const archivePath = writeArchive(fileName, content);
      const { entries } = await listEntries(archivePath);
      expect(entries.map((entry) => entry.path)).toEqual(["x.o", "much-longer-than-sixteen.o"]);
      expect(entries[0]?.mtime).toEqual(new Date(1_700_000_000_000));
      await expect(readEntry(archivePath, "x.o")).resolves.toBe("abc");
      await expect(readEntry(archivePath, "much-longer-than-sixteen.o")).resolves.toBe("");
    }
  });

  it("extracts single and selected members", async () => {
    const archivePath = writeArchive("select.ar", GNU_LIB);

    const singlePath = path.join(TMP_DIR, "single", "short.txt");
    await extractEntry(archivePath, "short.txt", singlePath);
    expect(fs.readFileSync(singlePath, "utf8")).toBe("hello ar\n");

    const selectedDir = path.join(TMP_DIR, "selected");
    await extractEntries(archivePath, ["odd"], selectedDir);
    expect(fs.readdirSync(selectedDir)).toEqual(["odd"]);

    await expect(extractEntries(archivePath, ["missing"], selectedDir)).rejects.toThrow(
      "No matching entries to extract",
    );
    await expect(extractEntry(archivePath, "missing", singlePath)).rejects.toThrow(
      "Entry not found in archive: missing",
    );
    await expect(openEntryReadStream(archivePath, "missing")).rejects.toThrow(
      "Entry not found in archive",
    );
  });

  it("refuses to extract members outside the target directory", async () => {
    const archivePath = writeArchive(
      "evil.a",
      buildGnu([{ name: "../../escaped-member.txt", data: "x" }]),
    );
    const outDir = path.join(TMP_DIR, "evil-out");

    await expect(extractAll(archivePath, outDir)).rejects.toThrow("Unsafe archive entry path");
    expect(fs.existsSync(outDir)).toBe(false);
    expect(fs.existsSync(path.join(TMP_DIR, "escaped-member.txt"))).toBe(false);
  });

  it.each([
    ["bad-magic.a", Buffer.from("not an archive"), "missing !<arch> signature"],
    ["bad-header.a", Buffer.from(`!<arch>\n${"x".repeat(60)}`), "bad member header"],
    ["truncated.a", Buffer.from(`!<arch>\n${header("a/", 100)}abc`), "past end of file"],
    ["bad-size.a", Buffer.from(`!<arch>\n${header("a/", 0).replace(/ {2}`/, "zz`")}`), "bad size"],
    ["no-table.a", Buffer.from(`!<arch>\n${header("/0", 0)}`), "without a name table"],
    [
      "bad-offset.a",
      Buffer.concat([Buffer.from(`!<arch>\n${header("//", 4)}ab/\n${header("/9", 0)}`)]),
      "offset out of range",
    ],
    ["bsd-name.a", Buffer.from(`!<arch>\n${header("#1/50", 2)}ab`), "exceeds member size"],
  ])("rejects malformed archive %s", async (fileName, content, message) => {
    const archivePath = writeArchive(fileName, content);
    await expect(listEntries(archivePath)).rejects.toThrow(message);
  });
});
