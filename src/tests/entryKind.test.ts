import { describe, expect, it } from "vitest";
import { classifyEntryKind, createTextExtensionSet, isTextEntryName } from "../editor/entryKind";

describe("entryKind", () => {
  it("classifies directories, default text extensions, and binaries", () => {
    const textExtensions = createTextExtensionSet();

    expect(classifyEntryKind({ name: "docs", isDirectory: true }, textExtensions)).toBe("folder");
    expect(classifyEntryKind({ name: "readme.md", isDirectory: false }, textExtensions)).toBe(
      "text",
    );
    expect(classifyEntryKind({ name: "LICENSE", isDirectory: false }, textExtensions)).toBe("text");
    expect(classifyEntryKind({ name: "logo.png", isDirectory: false }, textExtensions)).toBe(
      "binary",
    );
  });

  it("treats configured extra extensions as text", () => {
    const textExtensions = createTextExtensionSet([".TOML", "lock"]);

    expect(isTextEntryName("settings.toml", textExtensions)).toBe(true);
    expect(classifyEntryKind({ name: "Cargo.lock", isDirectory: false }, textExtensions)).toBe(
      "text",
    );
    expect(
      classifyEntryKind({ name: "settings.toml", isDirectory: false }, createTextExtensionSet()),
    ).toBe("binary");
  });
});
