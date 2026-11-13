import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { detectArchiveKind, SUPPORTED_ARCHIVE_EXTENSIONS } from "../archive/format";

type Manifest = {
  contributes: {
    customEditors: { viewType: string; selector: { filenamePattern: string }[] }[];
  };
};

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"),
) as Manifest;
const patterns = manifest.contributes.customEditors
  .filter((editor) => editor.viewType === "compressPreview")
  .flatMap((editor) => editor.selector.map((selector) => selector.filenamePattern));

describe("package.json custom editor selectors", () => {
  it("are unique", () => {
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it.each(patterns)("%s maps to a supported archive kind", (pattern) => {
    expect(pattern).toMatch(/^\*\.[a-z0-9.-]+$/);
    expect(() => detectArchiveKind(`/tmp/archive${pattern.slice(1)}`)).not.toThrow();
  });

  it.each(SUPPORTED_ARCHIVE_EXTENSIONS)("%s has a selector", (extension) => {
    expect(patterns).toContain(`*${extension}`);
  });
});
