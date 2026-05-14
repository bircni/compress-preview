import { PassThrough } from "stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as zipContentProviderModule from "../editor/zipContentProvider";

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

    const { ZipContentProvider } =
      (await import("../editor/zipContentProvider")) as typeof zipContentProviderModule;
    const provider = new ZipContentProvider();
    const pending = provider.provideTextDocumentContent({
      query: "zip=%2Ftmp%2Farchive.zip",
      path: "/docs/readme.txt",
    } as never);

    const stream = (await openEntryReadStream.mock.results[0].value).stream as PassThrough;
    queueMicrotask(() => stream.end("path fallback"));

    expect(await pending).toBe("path fallback");
    expect(openEntryReadStream).toHaveBeenCalledWith("/tmp/archive.zip", "docs/readme.txt");
  });

  it("rejects invalid preview URIs", async () => {
    vi.doMock("vscode", () => ({}), { virtual: true });
    vi.doMock("../archive/archive", () => ({ openEntryReadStream: vi.fn() }));

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
      "compress-preview://preview?zip=%2Ftmp%2Farchive%20name.zip&entry=docs%2Fhello%20world.txt",
    );
    expect(uri).toEqual({ value: expect.any(String) });
  });
});
