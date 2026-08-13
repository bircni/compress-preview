import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as zipContentProviderModule from "../editor/zipContentProvider";

function mockPreviewConfig(maxTextPreviewBytes = 2 * 1024 * 1024): void {
  vi.doMock("../editor/compressPreviewConfig", () => ({
    readMaxTextPreviewBytes: () => maxTextPreviewBytes,
  }));
}

describe("zipContentProvider", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("reads UTF-8 entry content from the archive stream", async () => {
    const openEntryReadStream = vi.fn().mockImplementation(async () => {
      const stream = new PassThrough();
      queueMicrotask(() => stream.end("hello world"));
      return {
        entry: { path: "docs/readme.txt", name: "readme.txt", isDirectory: false },
        stream,
      };
    });

    vi.doMock("vscode", () => ({ Uri: { parse: (value: string) => ({ query: value }) } }), {
      virtual: true,
    });
    vi.doMock("../archive/archive", () => ({ openEntryReadStream }));
    mockPreviewConfig();

    const { ZipContentProvider } =
      (await import("../editor/zipContentProvider")) as typeof zipContentProviderModule;
    const provider = new ZipContentProvider();
    const content = await provider.provideTextDocumentContent({
      query: "zip=%2Ftmp%2Farchive.zip&entry=docs%2Freadme.txt",
      path: "",
    } as never);

    expect(openEntryReadStream).toHaveBeenCalledWith("/tmp/archive.zip", "docs/readme.txt");
    expect(content).toBe("hello world");
  });

  it("reads string chunks from entry streams", async () => {
    const openEntryReadStream = vi.fn().mockImplementation(async () => {
      const stream = new PassThrough();
      stream.setEncoding("utf8");
      queueMicrotask(() => stream.end("hello from string chunk"));
      return {
        entry: { path: "docs/readme.txt", name: "readme.txt", isDirectory: false },
        stream,
      };
    });

    vi.doMock("vscode", () => ({ workspace: {} }), { virtual: true });
    vi.doMock("../archive/archive", () => ({ openEntryReadStream }));
    mockPreviewConfig();

    const { ZipContentProvider } =
      (await import("../editor/zipContentProvider")) as typeof zipContentProviderModule;
    const provider = new ZipContentProvider();
    const content = await provider.provideTextDocumentContent({
      query: "zip=%2Ftmp%2Farchive.zip&entry=docs%2Freadme.txt",
      path: "",
    } as never);

    expect(content).toBe("hello from string chunk");
  });

  it("falls back to the URI path when the entry query parameter is omitted", async () => {
    const openEntryReadStream = vi.fn().mockResolvedValue({
      entry: { path: "docs/readme.txt", name: "readme.txt", isDirectory: false },
      stream: new PassThrough(),
    });

    vi.doMock("vscode", () => ({ workspace: {} }), { virtual: true });
    vi.doMock("../archive/archive", () => ({ openEntryReadStream }));
    mockPreviewConfig();

    const { ZipContentProvider } =
      (await import("../editor/zipContentProvider")) as typeof zipContentProviderModule;
    const provider = new ZipContentProvider();
    const pending = provider.provideTextDocumentContent({
      query: "zip=%2Ftmp%2Farchive.zip",
      path: "/docs/readme.txt",
    } as never);

    const { stream } = (await openEntryReadStream.mock.results[0].value) as { stream: PassThrough };
    queueMicrotask(() => stream.end("path fallback"));

    expect(await pending).toBe("path fallback");
    expect(openEntryReadStream).toHaveBeenCalledWith("/tmp/archive.zip", "docs/readme.txt");
  });

  it("rejects invalid preview URIs", async () => {
    vi.doMock("vscode", () => ({}), { virtual: true });
    vi.doMock("../archive/archive", () => ({ openEntryReadStream: vi.fn() }));
    mockPreviewConfig();

    const { ZipContentProvider } =
      (await import("../editor/zipContentProvider")) as typeof zipContentProviderModule;
    const provider = new ZipContentProvider();

    await expect(
      provider.provideTextDocumentContent({ query: "", path: "" } as never),
    ).rejects.toThrow("Invalid compress-preview URI");
  });

  it("registers the content provider and encodes preview URIs", async () => {
    const registerTextDocumentContentProvider = vi.fn(() => ({ dispose: vi.fn() }));
    const parse = vi.fn((value: string) => ({ value }));

    vi.doMock(
      "vscode",
      () => ({
        workspace: {
          registerTextDocumentContentProvider,
        },
        Uri: {
          parse,
        },
      }),
      { virtual: true },
    );
    vi.doMock("../archive/archive", () => ({ openEntryReadStream: vi.fn() }));
    mockPreviewConfig();

    const { registerZipContentProvider, makeZipPreviewUri } =
      (await import("../editor/zipContentProvider")) as typeof zipContentProviderModule;
    const context = { subscriptions: [] as unknown[] };

    registerZipContentProvider(context as never);
    const uri = makeZipPreviewUri("/tmp/archive name.zip", "docs/hello world.txt");

    expect(registerTextDocumentContentProvider).toHaveBeenCalledWith(
      "compress-preview",
      expect.anything(),
    );
    expect(context.subscriptions).toHaveLength(1);
    expect(parse).toHaveBeenCalledWith(
      "compress-preview://preview/docs/hello%20world.txt?zip=%2Ftmp%2Farchive%20name.zip&entry=docs%2Fhello%20world.txt",
    );
    expect(uri).toEqual({ value: expect.any(String) });
  });

  it("puts the entry name in the URI path so the editor tab is labelled", async () => {
    const parse = vi.fn((value: string) => ({ value }));
    vi.doMock("vscode", () => ({ workspace: {}, Uri: { parse } }), { virtual: true });
    vi.doMock("../archive/archive", () => ({ openEntryReadStream: vi.fn() }));
    mockPreviewConfig();

    const { makeZipPreviewUri } =
      (await import("../editor/zipContentProvider")) as typeof zipContentProviderModule;

    const pathOf = (entryPath: string): string => {
      makeZipPreviewUri("/tmp/chart.zip", entryPath);
      const raw = parse.mock.lastCall?.[0] ?? "";
      return decodeURIComponent(
        raw.slice("compress-preview://preview".length).split("?", 1)[0] ?? "",
      );
    };

    expect(pathOf("templates/values.yaml")).toBe("/templates/values.yaml");
    expect(pathOf("notes.txt")).toBe("/notes.txt");
    // leading "./" and backslash separators must not collapse the name away
    expect(pathOf("./templates/_helpers.tpl")).toBe("/templates/_helpers.tpl");
    expect(pathOf(String.raw`templates\values.yaml`)).toBe("/templates/values.yaml");
  });

  it("escapes characters that would otherwise split the preview URI", async () => {
    const parse = vi.fn((value: string) => ({ value }));
    vi.doMock("vscode", () => ({ workspace: {}, Uri: { parse } }), { virtual: true });
    vi.doMock("../archive/archive", () => ({ openEntryReadStream: vi.fn() }));
    mockPreviewConfig();

    const { makeZipPreviewUri } =
      (await import("../editor/zipContentProvider")) as typeof zipContentProviderModule;

    makeZipPreviewUri("/tmp/chart.zip", "docs/re#ad?me.yaml");
    const raw = parse.mock.lastCall?.[0] ?? "";

    expect(raw).toContain("/docs/re%23ad%3Fme.yaml?zip=");
    expect(raw).toContain("entry=docs%2Fre%23ad%3Fme.yaml");
  });

  it("rejects when the decompressed preview exceeds the configured byte limit", async () => {
    const openEntryReadStream = vi.fn().mockImplementation(async () => {
      const stream = new PassThrough();
      queueMicrotask(() => stream.end("abcdefghijklmnop"));
      return {
        entry: { path: "huge.log", name: "huge.log", isDirectory: false },
        stream,
      };
    });

    vi.doMock("vscode", () => ({ workspace: {} }), { virtual: true });
    vi.doMock("../archive/archive", () => ({ openEntryReadStream }));
    mockPreviewConfig(8);

    const { ZipContentProvider } =
      (await import("../editor/zipContentProvider")) as typeof zipContentProviderModule;
    const provider = new ZipContentProvider();

    await expect(
      provider.provideTextDocumentContent({
        query: "zip=%2Ftmp%2Farchive.zip&entry=huge.log",
        path: "",
      } as never),
    ).rejects.toMatchObject({ name: "TextPreviewTooLargeError", limitBytes: 8 });
  });

  it("skips the byte limit when the URI requests a one-time large preview", async () => {
    const openEntryReadStream = vi.fn().mockImplementation(async () => {
      const stream = new PassThrough();
      queueMicrotask(() => stream.end("abcdefghijklmnop"));
      return {
        entry: { path: "huge.log", name: "huge.log", isDirectory: false },
        stream,
      };
    });

    vi.doMock("vscode", () => ({ workspace: {} }), { virtual: true });
    vi.doMock("../archive/archive", () => ({ openEntryReadStream }));
    mockPreviewConfig(8);

    const { ZipContentProvider } =
      (await import("../editor/zipContentProvider")) as typeof zipContentProviderModule;
    const provider = new ZipContentProvider();
    const content = await provider.provideTextDocumentContent({
      query: "zip=%2Ftmp%2Farchive.zip&entry=huge.log&allowLarge=1",
      path: "",
    } as never);

    expect(content).toBe("abcdefghijklmnop");
  });

  it("encodes the one-time large preview flag on the URI", async () => {
    const parse = vi.fn((value: string) => ({ value }));
    vi.doMock("vscode", () => ({ workspace: {}, Uri: { parse } }), { virtual: true });
    vi.doMock("../archive/archive", () => ({ openEntryReadStream: vi.fn() }));
    mockPreviewConfig();

    const { makeZipPreviewUri } =
      (await import("../editor/zipContentProvider")) as typeof zipContentProviderModule;

    makeZipPreviewUri("/tmp/chart.zip", "huge.log", { allowLarge: true });
    const raw = parse.mock.lastCall?.[0] ?? "";

    expect(raw).toContain("entry=huge.log&allowLarge=1");
  });
});
