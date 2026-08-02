import path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const extensionDevelopmentPath = repoRoot;
  const extensionTestsPath = path.resolve(__dirname, "suite", "index.js");

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [repoRoot, "--disable-extensions"],
      extensionTestsEnv: {
        ...process.env,
        COMPRESS_PREVIEW_ENABLE_TEST_COMMANDS: "1",
      },
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

void main();
