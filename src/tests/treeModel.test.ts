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
});
