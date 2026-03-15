const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const extensionTestsPath = path.resolve(__dirname, "..", "src", "e2e", "suite", "index.js");
  const userDataDir = path.resolve(__dirname, "..", ".tmp", "vscode-e2e-user-data");

  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [path.resolve(__dirname, ".."), "--disable-extensions", `--user-data-dir=${userDataDir}`],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
