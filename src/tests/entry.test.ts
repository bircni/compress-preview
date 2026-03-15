/**
 * Unit tests for src/archive/entry.ts — entry metadata and name helper.
 */

import { entryNameFromPath } from "../archive/entry";

describe("entry", () => {
  it("entryNameFromPath returns basename", () => {
    expect(entryNameFromPath("folder/file.txt")).toBe("file.txt");
    expect(entryNameFromPath("a/b/c")).toBe("c");
    expect(entryNameFromPath("root")).toBe("root");
  });

  it("entryNameFromPath strips trailing slash", () => {
    expect(entryNameFromPath("folder/")).toBe("folder");
  });
});
