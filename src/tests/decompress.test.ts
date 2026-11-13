import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import { createDecompressTransform } from "../archive/decompress";

// "hello compressed" as LZMA-alone with an unknown size (end-of-payload marker).
const HELLO_LZMA = "XQAAgAD//////////wA0GUnujekSFAmXrhSOHI7zbca3///e8gAA";

async function decode(kind: Parameters<typeof createDecompressTransform>[0], input: Buffer) {
  const chunks: Buffer[] = [];
  const decoder = createDecompressTransform(kind);
  decoder.on("data", (chunk: Buffer) => chunks.push(chunk));
  // Split input to exercise buffering across multiple chunks.
  await pipeline(Readable.from([input.subarray(0, 7), input.subarray(7)]), decoder);
  return Buffer.concat(chunks).toString("utf8");
}

describe("createDecompressTransform (lzma)", () => {
  it("decodes LZMA-alone streams split across chunks", async () => {
    await expect(decode("lzma", Buffer.from(HELLO_LZMA, "base64"))).resolves.toBe(
      "hello compressed",
    );
  });

  it("honours a declared uncompressed size", async () => {
    const input = Buffer.from(HELLO_LZMA, "base64");
    input.writeBigUInt64LE(5n, 5);
    await expect(decode("lzma", input)).resolves.toBe("hello");
  });

  it("rejects a truncated header", async () => {
    await expect(decode("lzma", Buffer.from([0x5d, 0, 0]))).rejects.toThrow("header is truncated");
  });

  it("rejects an implausibly large declared size", async () => {
    const input = Buffer.from(HELLO_LZMA, "base64");
    input.writeBigUInt64LE(1n << 60n, 5);
    await expect(decode("tlz", input)).rejects.toThrow("uncompressed size is too large");
  });
});
