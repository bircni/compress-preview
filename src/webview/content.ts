import * as fs from "fs";
import * as path from "path";

/** Optional initial data embedded in HTML so the first paint does not rely on postMessage. */
export type InitialEntriesPayload = {
  entries?: {
    path: string;
    name: string;
    isDirectory: boolean;
    size?: number;
    compressedSize?: number;
    mtime?: string | number;
  }[];
  isPartial?: boolean;
  message?: string;
  /** When set, show this error instead of the tree. */
  error?: string;
};

const TEMPLATE_FILE = "content.html";
const TEMPLATE_SEARCH_PATHS = [
  path.join(__dirname, TEMPLATE_FILE),
  path.join(__dirname, "webview", TEMPLATE_FILE),
  path.join(process.cwd(), "src", "webview", TEMPLATE_FILE),
  path.join(process.cwd(), "dist", "webview", TEMPLATE_FILE),
];

function getTemplateHtml(): string {
  for (const templatePath of TEMPLATE_SEARCH_PATHS) {
    if (fs.existsSync(templatePath)) {
      return fs.readFileSync(templatePath, "utf8");
    }
  }
  throw new Error(`Missing webview template: ${TEMPLATE_FILE}`);
}

/**
 * Webview HTML and script for compress preview: hierarchy (indented list by path) and entry metadata.
 * @param cspSource - Webview cspSource so inline script/style are allowed (required for CSP).
 * @param initialData - When set, entries are embedded in the page so the tree shows without postMessage.
 */
export function getInitialHtml(cspSource: string, initialData?: InitialEntriesPayload): string {
  const initialScript =
    initialData != null
      ? `<script id="initial-entries" type="application/json">${JSON.stringify({
          entries: initialData.entries,
          isPartial: initialData.isPartial,
          message: initialData.message,
          error: initialData.error,
        }).replace(/</g, "\\u003c")}</script>`
      : "";

  return getTemplateHtml()
    .replaceAll("__CSP_SOURCE__", cspSource)
    .replace("__INITIAL_SCRIPT__", initialScript);
}
