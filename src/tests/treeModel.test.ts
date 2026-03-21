import { buildArchiveTree } from "../webview/treeModel";

describe("buildArchiveTree", () => {
  it("creates synthetic folders when entries omit explicit directory records", () => {
    const tree = buildArchiveTree([
      {
        path: "nested/deeper/file.txt",
        name: "file.txt",
        isDirectory: false,
      },
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      key: "nested",
      synthetic: true,
      entry: {
        path: "nested/",
        name: "nested",
        isDirectory: true,
      },
    });
    expect(tree[0].children[0]).toMatchObject({
      key: "nested/deeper",
      synthetic: true,
      entry: {
        path: "nested/deeper/",
        name: "deeper",
        isDirectory: true,
      },
    });
    expect(tree[0].children[0].children[0]).toMatchObject({
      key: "nested/deeper/file.txt",
      synthetic: false,
      entry: {
        path: "nested/deeper/file.txt",
        name: "file.txt",
        isDirectory: false,
      },
    });
  });

  it("replaces synthetic folders with explicit directory entries", () => {
    const tree = buildArchiveTree([
      {
        path: "nested/deeper/file.txt",
        name: "file.txt",
        isDirectory: false,
      },
      {
        path: "nested/",
        name: "nested",
        isDirectory: true,
      },
    ]);

    expect(tree[0].synthetic).toBe(false);
    expect(tree[0].entry).toMatchObject({
      path: "nested/",
      name: "nested",
      isDirectory: true,
    });
  });

  it("sorts directories before files and applies numeric ordering", () => {
    const tree = buildArchiveTree([
      { path: "item-10.txt", name: "item-10.txt", isDirectory: false },
      { path: "item-2.txt", name: "item-2.txt", isDirectory: false },
      { path: "folder/file.txt", name: "file.txt", isDirectory: false },
    ]);

    expect(tree.map((node) => node.entry.path)).toEqual(["folder/", "item-2.txt", "item-10.txt"]);
  });

  it("normalizes Windows-style separators when building parent folders", () => {
    const tree = buildArchiveTree([
      {
        path: ".\\nested\\file.txt",
        name: "file.txt",
        isDirectory: false,
      },
    ]);

    expect(tree[0].entry.path).toBe("nested/");
    expect(tree[0].children[0].entry.path).toBe(".\\nested\\file.txt");
  });

  it("orders deeper paths after their parents and keeps directories ahead of files with the same base path", () => {
    const tree = buildArchiveTree([
      { path: "same", name: "same", isDirectory: false },
      { path: "same/", name: "same", isDirectory: true },
      { path: "same/deeper.txt", name: "deeper.txt", isDirectory: false },
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].entry.path).toBe("same");
    expect(tree[0].children[0].entry.path).toBe("same/deeper.txt");
  });
});
