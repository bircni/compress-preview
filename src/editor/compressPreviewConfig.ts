import * as vscode from "vscode";

const CONFIG_SECTION = "compress-preview";

/** Max age for cached binary preview folders under the OS temp `compress-preview/` tree, in milliseconds. */
export function readTempPreviewMaxAgeMs(): number {
  const raw = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<number>("tempPreviewMaxAgeDays", 7);
  const days = Number.isFinite(raw) ? Math.round(raw) : 7;
  const clamped = Math.min(365, Math.max(1, days));
  return clamped * 24 * 60 * 60 * 1000;
}
