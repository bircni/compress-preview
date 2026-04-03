import fs from "node:fs";
import path from "node:path";
import yazl from "yazl";

const scriptDir = path.dirname(path.resolve(process.argv[1] ?? ""));
const rootDir = path.resolve(scriptDir, "..");
const fixturesDir = path.join(rootDir, ".fixtures");
const tempDir = path.join(rootDir, ".tmp", "archive-fixture-src");
const FIXTURE_DATE = new Date("2024-01-01T00:00:00.000Z");

const zipBasedFixtures = [
  "sample-library.jar",
  "sample-app.apk",
  "sample-extension.vsix",
  "sample-addon.xpi",
  "sample-wheel.whl",
  "sample-webapp.war",
  "sample-enterprise.ear",
] as const;

type CollectedFile = { absolutePath: string; archivePath: string };

function collectFiles(dir: string, rootDirForNames: string): CollectedFile[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(absolutePath, rootDirForNames);
      }

      return [
        {
          absolutePath,
          archivePath: path.relative(rootDirForNames, absolutePath).replace(/\\/g, "/"),
        },
      ];
    });
}

async function writeZipArchive(targetFile: string, sourceDir: string): Promise<void> {
  const files = collectFiles(sourceDir, sourceDir);

  await new Promise<void>((resolve, reject) => {
    const zipFile = new yazl.ZipFile();
    const output = fs.createWriteStream(targetFile);

    output.on("close", () => {
      resolve();
    });
    output.on("error", reject);
    zipFile.outputStream.on("error", reject).pipe(output);

    for (const file of files) {
      zipFile.addFile(file.absolutePath, file.archivePath, {
        mtime: FIXTURE_DATE,
        mode: 0o100644,
        compress: true,
        forceDosTimestamp: true,
      });
    }

    zipFile.end();
  });
}

async function main(): Promise<void> {
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
    await writeZipArchive(path.join(fixturesDir, fileName), tempDir);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
