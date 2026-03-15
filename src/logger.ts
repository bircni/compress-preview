/**
 * Structured logging for observability (constitution).
 * When setOutputChannel is called (on extension activate), logs go to the "Compress Preview" Output panel.
 */

import type { OutputChannel } from "vscode";

let outputChannel: OutputChannel | undefined;

export function setOutputChannel(channel: OutputChannel): void {
  outputChannel = channel;
}

function append(line: string): void {
  if (outputChannel) {
    outputChannel.appendLine(line);
  } else {
    console.error(line);
  }
}

export const logger = {
  info(msg: string, data?: Record<string, unknown>): void {
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    append(`[INFO] ${msg}${payload}`);
  },
  warn(msg: string, data?: Record<string, unknown>): void {
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    append(`[WARN] ${msg}${payload}`);
  },
  error(msg: string, err?: unknown): void {
    let payload = "";
    if (err instanceof Error) {
      payload = ` ${err.message}`;
    } else if (err !== null && typeof err === "object") {
      payload = ` ${JSON.stringify(err)}`;
    } else if (err != null && typeof err !== "object") {
      const prim = err as string | number | boolean | symbol | bigint;
      payload = ` ${String(prim)}`;
    }
    append(`[ERROR] ${msg}${payload}`);
  },
};
