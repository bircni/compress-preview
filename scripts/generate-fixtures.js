const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const rootDir = path.resolve(__dirname, "..");
const fixturesDir = path.join(rootDir, ".fixtures");
const tempDir = path.join(rootDir, ".tmp", "archive-fixture-src");

const zipBasedFixtures = [
  "sample-library.jar",
  "sample-app.apk",
  "sample-extension.vsix",
  "sample-addon.xpi",
  "sample-wheel.whl",
  "sample-webapp.war",
  "sample-enterprise.ear",
];

async function writeZipArchive(targetFile, sourceDir, rootInArchive = false) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(targetFile);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir + path.sep, rootInArchive);
    archive.finalize();
  });
}

async function main() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(tempDir, "docs"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "assets"), { recursive: true });

  fs.writeFileSync(
    path.join(tempDir, "README.txt"),
    "Archive fixture for supported ZIP-based formats.\n",
  );
  fs.writeFileSync(
    path.join(tempDir, "docs", "manifest.json"),
    JSON.stringify(
      {
        name: "compress-preview-fixture",
        version: "1.0.0",
        entry: "README.txt",
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(tempDir, "assets", "config.ini"), "[fixture]\nmode=example\n");
  fs.writeFileSync(
    path.join(tempDir, "assets", "pixel.png"),
    Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360606060000000050001a5f645400000000049454e44ae426082",
      "hex",
    ),
  );

  for (const fileName of zipBasedFixtures) {
    await writeZipArchive(path.join(fixturesDir, fileName), tempDir, false);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
