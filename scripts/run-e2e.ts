import path from "node:path";
import { runTests } from "@vscode/test-electron";

const scriptDir = path.dirname(path.resolve(process.argv[1] ?? ""));

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(scriptDir, "..");
  const extensionTestsPath = path.resolve(scriptDir, "..", "src", "e2e", "suite", "index.js");
  const userDataDir = path.resolve(scriptDir, "..", ".tmp", "vscode-e2e-user-data");
  process.env.COMPRESS_PREVIEW_ENABLE_TEST_COMMANDS = "1";

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      path.resolve(scriptDir, ".."),
      "--disable-extensions",
      `--user-data-dir=${userDataDir}`,
    ],
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
