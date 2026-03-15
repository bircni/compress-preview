import type * as loggerModule from "../logger";

describe("logger", () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it("writes info, warn, and error messages to the output channel", () => {
    jest.isolateModules(() => {
      const appendLine = jest.fn();
      const mod = require("../logger") as typeof loggerModule;

      mod.setOutputChannel({ appendLine } as never);

      mod.logger.info("loaded", { count: 2 });
      mod.logger.warn("slow", { timeoutMs: 100 });
      mod.logger.error("failed", new Error("boom"));
      mod.logger.error("payload", { code: "E_TEST" });
      mod.logger.error("primitive", 42);

      expect(appendLine).toHaveBeenNthCalledWith(1, '[INFO] loaded {"count":2}');
      expect(appendLine).toHaveBeenNthCalledWith(2, '[WARN] slow {"timeoutMs":100}');
      expect(appendLine).toHaveBeenNthCalledWith(3, "[ERROR] failed boom");
      expect(appendLine).toHaveBeenNthCalledWith(4, '[ERROR] payload {"code":"E_TEST"}');
      expect(appendLine).toHaveBeenNthCalledWith(5, "[ERROR] primitive 42");
    });
  });

  it("falls back to console.error when no output channel is set", () => {
    jest.isolateModules(() => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
      const mod = require("../logger") as typeof loggerModule;

      mod.logger.info("startup");

      expect(consoleSpy).toHaveBeenCalledWith("[INFO] startup");
    });
  });
});
