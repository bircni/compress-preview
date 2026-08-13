import { Readable } from "node:stream";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("7z-iterator", () => {
  class FakeIterator {
    async *[Symbol.asyncIterator]() {
      yield {
        path: "../evil.txt",
        type: "file",
        stream: Readable.from(["evil"]),
        destroy(): void {},
      };
    }

    destroy(): void {}
  }

  return { default: FakeIterator };
});

import { extractAllSevenZip } from "../archive/sevenZip";

describe("sevenZip path safety", () => {
  const tmpDir = path.join(process.cwd(), ".tmp/mock-sevenzip");

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rejects entries that escape the output directory", async () => {
    fs.mkdirSync(tmpDir, { recursive: true });

    await expect(extractAllSevenZip("archive.7z", tmpDir, () => true, false)).rejects.toThrow(
      "Unsafe archive entry path",
    );
    expect(fs.existsSync(path.join(tmpDir, "evil.txt"))).toBe(false);
  });
});
