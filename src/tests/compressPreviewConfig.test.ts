import { afterEach, describe, expect, it, vi } from "vitest";
import type * as compressPreviewConfigModule from "../editor/compressPreviewConfig";

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
    vi.doMock(
      "vscode",
      () => ({
        workspace: {
          getConfiguration: vi.fn(() => ({ get })),
        },
      }),
      { virtual: true },
    );

    const { readTempPreviewMaxAgeMs } =
      (await import("../editor/compressPreviewConfig")) as typeof compressPreviewConfigModule;

    expect(readTempPreviewMaxAgeMs()).toBe(365 * 24 * 60 * 60 * 1000);
    expect(get).toHaveBeenCalledWith("tempPreviewMaxAgeDays", 7);
  });

  it("uses default days when the setting is not finite", async () => {
    const get = vi.fn((key: string, defaultValue: number) => {
      if (key === "tempPreviewMaxAgeDays") {
        return Number.NaN;
      }
      return defaultValue;
    });
    vi.doMock(
      "vscode",
      () => ({
        workspace: {
          getConfiguration: vi.fn(() => ({ get })),
        },
      }),
      { virtual: true },
    );

    const { readTempPreviewMaxAgeMs } =
      (await import("../editor/compressPreviewConfig")) as typeof compressPreviewConfigModule;

    expect(readTempPreviewMaxAgeMs()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
