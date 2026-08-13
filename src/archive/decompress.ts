import { Transform } from "node:stream";
import * as zlib from "node:zlib";
import { Decompress } from "fzstd";
import bz2 from "unbzip2-stream";
import { createXZDecoder } from "xz-compat";
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
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported compressed kind: ${String(exhaustive)}`);
    }
  }
}
