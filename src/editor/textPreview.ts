import { Readable } from "node:stream";

export const DEFAULT_MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_PREVIEW_BYTES_CAP = 100 * 1024 * 1024;

export class TextPreviewTooLargeError extends Error {
  readonly limitBytes: number;
  readonly receivedBytes: number;

  constructor(limitBytes: number, receivedBytes: number) {
    super(
      `Text preview exceeds the configured limit of ${limitBytes} bytes. Extract the file or open it once with an override.`,
    );
    this.name = "TextPreviewTooLargeError";
    this.limitBytes = limitBytes;
    this.receivedBytes = receivedBytes;
  }
}

export function isTextPreviewTooLargeError(error: unknown): boolean {
  if (error instanceof TextPreviewTooLargeError) {
    return true;
  }
  return (
    error instanceof Error &&
    (error.name === "TextPreviewTooLargeError" ||
      error.message.startsWith("Text preview exceeds the configured limit"))
  );
}

/**
 * Buffer a text preview stream, aborting once decompressed bytes exceed maxBytes.
 * Pass maxBytes = 0 to disable the limit.
 */
export function readTextPreviewStream(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let settled = false;

    const finish = (error?: unknown, value?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      stream.removeAllListeners("data");
      stream.removeAllListeners("end");
      stream.removeAllListeners("error");
      if (stream instanceof Readable) {
        stream.destroy();
      }
      if (error !== undefined) {
        reject(error instanceof Error ? error : new Error("Text preview stream failed"));
        return;
      }
      resolve(value ?? "");
    };

    stream.on("data", (chunk: Buffer | string) => {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
      total += buffer.byteLength;
      if (maxBytes > 0 && total > maxBytes) {
        finish(new TextPreviewTooLargeError(maxBytes, total));
        return;
      }
      chunks.push(buffer);
    });
    stream.on("end", () => {
      finish(undefined, Buffer.concat(chunks).toString("utf8"));
    });
    stream.on("error", (error: unknown) => {
      finish(error);
    });
  });
}
