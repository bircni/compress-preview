import { afterEach, describe, expect, it, vi } from "vitest";

describe("compressPreviewConfig", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("reads temp preview max age with clamping", async () => {
    const get = vi.fn((key: string, defaultValue: number) => {
      if (key === "tempPreviewMaxAgeDays") {
        return 400;
      }
      return defaultValue;
    });
    vi.doMock("vscode", () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get })),
      },
    }));

    const { readTempPreviewMaxAgeMs } = await import("../editor/compressPreviewConfig");

    expect(readTempPreviewMaxAgeMs()).toBe(365 * 24 * 60 * 60 * 1000);
    expect(get).toHaveBeenCalledWith("tempPreviewMaxAgeDays", 7);
  });

  it("uses default days when the setting is not finite", async () => {
    const get = vi.fn((key: string, defaultValue: number) => {
      if (key === "tempPreviewMaxAgeDays") {
        return NaN;
      }
      return defaultValue;
    });
    vi.doMock("vscode", () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get })),
      },
    }));

    const { readTempPreviewMaxAgeMs } = await import("../editor/compressPreviewConfig");

    expect(readTempPreviewMaxAgeMs()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("reads the text preview byte limit with clamping", async () => {
    const get = vi.fn((key: string, defaultValue: number) => {
      if (key === "maxTextPreviewBytes") {
        return 500;
      }
      return defaultValue;
    });
    vi.doMock("vscode", () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get })),
      },
    }));

    const { readMaxTextPreviewBytes } = await import("../editor/compressPreviewConfig");

    expect(readMaxTextPreviewBytes()).toBe(1024);
    expect(get).toHaveBeenCalledWith("maxTextPreviewBytes", 2 * 1024 * 1024);
  });

  it("treats a non-positive text preview limit as unlimited", async () => {
    const get = vi.fn((key: string, defaultValue: number) => {
      if (key === "maxTextPreviewBytes") {
        return 0;
      }
      return defaultValue;
    });
    vi.doMock("vscode", () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get })),
      },
    }));

    const { readMaxTextPreviewBytes } = await import("../editor/compressPreviewConfig");

    expect(readMaxTextPreviewBytes()).toBe(0);
  });

  it("caps oversized text preview limits and uses the default when not finite", async () => {
    const get = vi.fn((key: string, defaultValue: number) => {
      if (key === "maxTextPreviewBytes") {
        return Number.NaN;
      }
      return defaultValue;
    });
    vi.doMock("vscode", () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get })),
      },
    }));

    const configModule = await import("../editor/compressPreviewConfig");
    expect(configModule.readMaxTextPreviewBytes()).toBe(2 * 1024 * 1024);

    vi.resetModules();
    const getCapped = vi.fn((key: string, defaultValue: number) => {
      if (key === "maxTextPreviewBytes") {
        return 500 * 1024 * 1024;
      }
      return defaultValue;
    });
    vi.doMock("vscode", () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({ get: getCapped })),
      },
    }));
    const cappedModule = await import("../editor/compressPreviewConfig");
    expect(cappedModule.readMaxTextPreviewBytes()).toBe(100 * 1024 * 1024);
  });
});
