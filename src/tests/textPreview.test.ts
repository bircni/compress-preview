import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  isTextPreviewTooLargeError,
  readTextPreviewStream,
  TextPreviewTooLargeError,
} from "../editor/textPreview";

describe("textPreview", () => {
  it("concatenates buffer and string chunks", async () => {
    const stream = new PassThrough();
    const pending = readTextPreviewStream(stream, 1024);
    stream.write("hello ");
    stream.end(Buffer.from("world"));

    await expect(pending).resolves.toBe("hello world");
  });

  it("rejects and destroys the stream once the byte limit is exceeded", async () => {
    const stream = new PassThrough();
    const pending = readTextPreviewStream(stream, 8);
    stream.write("abcdefghijklmnop");

    await expect(pending).rejects.toMatchObject({
      name: "TextPreviewTooLargeError",
      limitBytes: 8,
    });
    expect(stream.destroyed).toBe(true);
  });

  it("does not apply a limit when maxBytes is 0", async () => {
    const stream = new PassThrough();
    const pending = readTextPreviewStream(stream, 0);
    stream.end("a".repeat(64));

    await expect(pending).resolves.toHaveLength(64);
  });

  it("rejects when the source stream errors", async () => {
    const stream = new PassThrough();
    const pending = readTextPreviewStream(stream, 1024);
    stream.destroy(new Error("read failed"));

    await expect(pending).rejects.toThrow("read failed");
  });

  it("recognizes oversized preview errors by name or message", () => {
    expect(isTextPreviewTooLargeError(new TextPreviewTooLargeError(8, 16))).toBe(true);
    const named = new Error("Text preview exceeds the configured limit of 8 bytes.");
    named.name = "TextPreviewTooLargeError";
    expect(isTextPreviewTooLargeError(named)).toBe(true);
    expect(isTextPreviewTooLargeError(new Error("open failed"))).toBe(false);
  });
});
