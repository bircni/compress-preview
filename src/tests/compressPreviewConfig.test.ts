import type * as compressPreviewConfigModule from "../editor/compressPreviewConfig";

describe("compressPreviewConfig", () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it("reads temp preview max age with clamping", () => {
    const get = jest.fn((key: string, defaultValue: number) => {
      if (key === "tempPreviewMaxAgeDays") {
        return 400;
      }
      return defaultValue;
    });
    jest.doMock(
      "vscode",
      () => ({
        workspace: {
          getConfiguration: jest.fn(() => ({ get })),
        },
      }),
      { virtual: true },
    );

    const { readTempPreviewMaxAgeMs } =
      require("../editor/compressPreviewConfig") as typeof compressPreviewConfigModule;

    expect(readTempPreviewMaxAgeMs()).toBe(365 * 24 * 60 * 60 * 1000);
    expect(get).toHaveBeenCalledWith("tempPreviewMaxAgeDays", 7);
  });

  it("uses default days when the setting is not finite", () => {
    const get = jest.fn((key: string, defaultValue: number) => {
      if (key === "tempPreviewMaxAgeDays") {
        return Number.NaN;
      }
      return defaultValue;
    });
    jest.doMock(
      "vscode",
      () => ({
        workspace: {
          getConfiguration: jest.fn(() => ({ get })),
        },
      }),
      { virtual: true },
    );

    const { readTempPreviewMaxAgeMs } =
      require("../editor/compressPreviewConfig") as typeof compressPreviewConfigModule;

    expect(readTempPreviewMaxAgeMs()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
