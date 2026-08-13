import * as vscode from "vscode";
import { DEFAULT_MAX_TEXT_PREVIEW_BYTES, MAX_TEXT_PREVIEW_BYTES_CAP } from "./textPreview";

const CONFIG_SECTION = "compress-preview";

/** Max age for cached binary preview folders under the OS temp `compress-preview/` tree, in milliseconds. */
export function readTempPreviewMaxAgeMs(): number {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION).get("tempPreviewMaxAgeDays", 7);
  const days = Number.isFinite(raw) ? Math.round(raw) : 7;
  const clamped = Math.min(365, Math.max(1, days));
  return clamped * 24 * 60 * 60 * 1000;
}

/**
 * Max decompressed bytes for a text preview. `0` disables the limit.
 */
export function readMaxTextPreviewBytes(): number {
  const raw = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get("maxTextPreviewBytes", DEFAULT_MAX_TEXT_PREVIEW_BYTES);
  if (!Number.isFinite(raw)) {
    return DEFAULT_MAX_TEXT_PREVIEW_BYTES;
  }
  const rounded = Math.round(raw);
  if (rounded <= 0) {
    return 0;
  }
  return Math.min(MAX_TEXT_PREVIEW_BYTES_CAP, Math.max(1024, rounded));
}
