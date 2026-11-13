import { Transform } from "node:stream";
import * as zlib from "node:zlib";
import { Decompress } from "fzstd";
import bz2 from "unbzip2-stream";
import { createXZDecoder, decodeLzma } from "xz-compat";
import type { SingleFileKind, TarKind } from "./format";

type CompressedKind = Exclude<TarKind, "tar"> | SingleFileKind;

type DecompressStream = NodeJS.ReadWriteStream & {
  destroy: (error?: Error) => void;
};

function createZstdTransform(): Transform {
  const decoderRef: { current?: InstanceType<typeof Decompress> } = {};
  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        decoderRef.current?.push(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk));
        callback();
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },
    flush(callback) {
      try {
        decoderRef.current?.push(new Uint8Array(0), true);
        callback();
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
  decoderRef.current = new Decompress((data) => {
    transform.push(Buffer.from(data));
  });
  return transform;
}

const LZMA_ALONE_HEADER_BYTES = 13;
const LZMA_UNKNOWN_SIZE = 0xffff_ffff_ffff_ffffn;

/**
 * Decode the legacy `.lzma` ("LZMA-alone") container: 5-byte properties, 8-byte
 * little-endian uncompressed size, then raw LZMA1 data. LZMA1 has no chunk
 * boundaries, so the input is buffered and decoded on flush.
 */
function createLzmaAloneTransform(): Transform {
  const chunks: Buffer[] = [];
  const transform = new Transform({
    transform(chunk: Buffer | Uint8Array, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
    flush(callback) {
      try {
        const input = Buffer.concat(chunks);
        if (input.length < LZMA_ALONE_HEADER_BYTES) {
          throw new Error("Invalid LZMA stream: header is truncated");
        }
        const declaredSize = input.readBigUInt64LE(5);
        if (declaredSize !== LZMA_UNKNOWN_SIZE && declaredSize > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("Invalid LZMA stream: uncompressed size is too large");
        }
        // Unknown size means the stream ends with an end-of-payload marker.
        const outSize =
          declaredSize === LZMA_UNKNOWN_SIZE ? Number.POSITIVE_INFINITY : Number(declaredSize);
        decodeLzma(input.subarray(LZMA_ALONE_HEADER_BYTES), input.subarray(0, 5), outSize, {
          write: (buffer: Uint8Array) => transform.push(Buffer.from(buffer)),
        });
        callback();
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });
  return transform;
}

export function createDecompressTransform(kind: CompressedKind): DecompressStream {
  switch (kind) {
    case "gz":
    case "tgz":
      return zlib.createGunzip();
    case "bz2":
    case "tbz":
      return bz2();
    case "xz":
    case "txz":
      return createXZDecoder();
    case "zst":
    case "tzst":
      return createZstdTransform();
    case "lzma":
    case "tlz":
      return createLzmaAloneTransform();
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported compressed kind: ${String(exhaustive)}`);
    }
  }
}
