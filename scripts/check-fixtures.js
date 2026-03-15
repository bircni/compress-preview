const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const yauzl = require("yauzl");

const rootDir = path.resolve(__dirname, "..");
const zipBasedFixtures = [
  ".fixtures/sample-library.jar",
  ".fixtures/sample-app.apk",
  ".fixtures/sample-extension.vsix",
  ".fixtures/sample-addon.xpi",
  ".fixtures/sample-wheel.whl",
  ".fixtures/sample-webapp.war",
  ".fixtures/sample-enterprise.ear",
];
const allFixtures = [...zipBasedFixtures, ".fixtures/large-sample.zip"];
const expectedPngHeader = Buffer.from("89504e470d0a1a0a", "hex");

function git(args) {
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function assertFileExists(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing fixture: ${relativePath}`);
  }
}

function assertLfsTracked(relativePath) {
  const attributes = git(["check-attr", "filter", "--", relativePath]);
  if (!attributes.endsWith(": lfs")) {
    throw new Error(`Fixture is not tracked by Git LFS: ${relativePath}`);
  }
}

function listZipEntries(archivePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (error, zipfile) => {
      if (error) {
        reject(error);
        return;
      }
      if (!zipfile) {
        reject(new Error(`Failed to open archive fixture: ${archivePath}`));
        return;
      }

      const entries = [];
      zipfile.on("entry", (entry) => {
        entries.push(entry.fileName);
        zipfile.readEntry();
      });
      zipfile.on("end", () => {
        zipfile.close();
        resolve(entries);
      });
      zipfile.on("error", (entryError) => {
        zipfile.close();
        reject(entryError);
      });
      zipfile.readEntry();
    });
  });
}

function readZipEntry(archivePath, entryPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (error, zipfile) => {
      if (error) {
        reject(error);
        return;
      }
      if (!zipfile) {
        reject(new Error(`Failed to open archive fixture: ${archivePath}`));
        return;
      }

      let settled = false;
      const finish = (callback) => (value) => {
        if (settled) {
          return;
        }
        settled = true;
        zipfile.close();
        callback(value);
      };

      zipfile.on("entry", (entry) => {
        if (entry.fileName !== entryPath) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            finish(reject)(streamError);
            return;
          }
          if (!stream) {
            finish(reject)(new Error(`Missing stream for ${entryPath}`));
            return;
          }

          const chunks = [];
          stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on("end", () => finish(resolve)(Buffer.concat(chunks)));
          stream.on("error", finish(reject));
        });
      });

      zipfile.on("end", () => {
        finish(reject)(new Error(`Missing fixture entry: ${entryPath}`));
      });
      zipfile.on("error", finish(reject));
      zipfile.readEntry();
    });
  });
}

async function assertZipBasedFixtureContents(relativePath) {
  const archivePath = path.join(rootDir, relativePath);
  const entries = await listZipEntries(archivePath);

  for (const requiredEntry of [
    "README.txt",
    "docs/manifest.json",
    "assets/config.ini",
    "assets/pixel.png",
  ]) {
    if (!entries.includes(requiredEntry)) {
      throw new Error(`Fixture ${relativePath} is missing ${requiredEntry}`);
    }
  }

  const readme = (await readZipEntry(archivePath, "README.txt")).toString("utf8");
  if (!readme.includes("Archive fixture for supported ZIP-based formats.")) {
    throw new Error(`Fixture ${relativePath} has unexpected README.txt contents`);
  }

  const manifest = JSON.parse(
    (await readZipEntry(archivePath, "docs/manifest.json")).toString("utf8"),
  );
  if (manifest.name !== "compress-preview-fixture" || manifest.entry !== "README.txt") {
    throw new Error(`Fixture ${relativePath} has unexpected docs/manifest.json contents`);
  }

  const config = (await readZipEntry(archivePath, "assets/config.ini")).toString("utf8");
  if (config !== "[fixture]\nmode=example\n") {
    throw new Error(`Fixture ${relativePath} has unexpected assets/config.ini contents`);
  }

  const png = await readZipEntry(archivePath, "assets/pixel.png");
  if (!png.subarray(0, expectedPngHeader.length).equals(expectedPngHeader)) {
    throw new Error(`Fixture ${relativePath} has an unexpected pixel.png payload`);
  }
}

async function assertLargeArchiveFixture(relativePath) {
  const archivePath = path.join(rootDir, relativePath);
  const entries = await listZipEntries(archivePath);

  for (const requiredEntry of [
    "large-archive/data.js",
    "large-archive/long-1.txt",
    "large-archive/long-2.txt",
    "large-archive/long-3.txt",
    "large-archive/nested/deeper/nested-long.txt",
  ]) {
    if (!entries.includes(requiredEntry)) {
      throw new Error(`Fixture ${relativePath} is missing ${requiredEntry}`);
    }
  }

  if (entries.some((entryPath) => entryPath.startsWith(".tmp/"))) {
    throw new Error(`Fixture ${relativePath} still contains the old .tmp root`);
  }
}

async function main() {
  allFixtures.forEach((relativePath) => {
    assertFileExists(relativePath);
    assertLfsTracked(relativePath);
  });

  for (const relativePath of zipBasedFixtures) {
    await assertZipBasedFixtureContents(relativePath);
  }
  await assertLargeArchiveFixture(".fixtures/large-sample.zip");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
