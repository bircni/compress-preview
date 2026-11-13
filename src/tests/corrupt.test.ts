import * as fs from "node:fs";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listEntries, openEntryReadStream } from "../archive/archive";
import { extractAll, extractEntry } from "../archive/extract";

const TMP_DIR = path.join(process.cwd(), ".tmp/unit-corrupt");

// Valid magic followed by garbage, so decoders fail mid-stream rather than up front.
const CORRUPT_STREAMS = [
  ["bad.txt.gz", Buffer.from("1f8b0800000000000003ffffffff", "hex"), /invalid|incorrect/],
  ["bad.txt.bz2", Buffer.from("not bzip2 data at all"), /magic/i],
  ["bad.txt.xz", Buffer.from("fd377a585a0000ffffffff", "hex"), /.+/],
  ["bad.txt.zst", Buffer.from("28b52ffd", "hex"), /unexpected EOF/],
  ["garbage.txt.zst", Buffer.from("28b52ffdffffffffffffffff", "hex"), /.+/],
  ["bad.txt.lzma", Buffer.from("5d00", "hex"), /header is truncated/],
] as const;

async function drain(stream: NodeJS.ReadableStream): Promise<number> {
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += (chunk as Buffer).length;
  }
  return bytes;
}

beforeAll(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe.each(CORRUPT_STREAMS)("corrupt %s", (fileName, content, message) => {
  const archivePath = path.join(TMP_DIR, fileName);
  const entryName = fileName.replace(/\.[^.]+$/, "");

  beforeAll(() => {
    fs.writeFileSync(archivePath, content);
  });

  it("errors while reading the entry stream", async () => {
    const { entries } = await listEntries(archivePath);
    expect(entries.map((entry) => entry.path)).toEqual([entryName]);
    const { stream } = await openEntryReadStream(archivePath, entryName);
    await expect(drain(stream)).rejects.toThrow(message);
  });

  it("removes the partial output when single-entry extraction fails", async () => {
    const outPath = path.join(TMP_DIR, `${fileName}.out`, entryName);
    await expect(extractEntry(archivePath, entryName, outPath)).rejects.toThrow(message);
    expect(fs.existsSync(outPath)).toBe(false);
  });

  it("leaves no target directory when extract all fails", async () => {
    const outDir = path.join(TMP_DIR, `${fileName}.all`);
    await expect(extractAll(archivePath, outDir)).rejects.toThrow(message);
    expect(fs.existsSync(outDir)).toBe(false);
    expect(fs.readdirSync(TMP_DIR).filter((name) => name.includes(".extract-"))).toEqual([]);
  });
});

describe("failed single-entry extraction", () => {
  it("does not delete a file that existed before extraction", async () => {
    const archivePath = path.join(TMP_DIR, "existing.txt.gz");
    fs.writeFileSync(archivePath, CORRUPT_STREAMS[0][1]);
    const outPath = path.join(TMP_DIR, "existing.txt");
    fs.writeFileSync(outPath, "keep me");

    await expect(extractEntry(archivePath, "existing.txt", outPath)).rejects.toThrow();
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
