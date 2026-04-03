import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yauzl, { type Entry } from "yauzl";

const scriptDir = path.dirname(path.resolve(process.argv[1] ?? ""));
const rootDir = path.resolve(scriptDir, "..");
const zipBasedFixtures = [
  ".fixtures/sample-library.jar",
  ".fixtures/sample-app.apk",
  ".fixtures/sample-extension.vsix",
  ".fixtures/sample-addon.xpi",
  ".fixtures/sample-wheel.whl",
  ".fixtures/sample-webapp.war",
  ".fixtures/sample-enterprise.ear",
] as const;
const allFixtures = [...zipBasedFixtures, ".fixtures/large-sample.zip"] as const;
const expectedPngHeader = Buffer.from("89504e470d0a1a0a", "hex");

function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function assertFileExists(relativePath: string): void {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing fixture: ${relativePath}`);
  }
}

function assertLfsTracked(relativePath: string): void {
  const attributes = git(["check-attr", "filter", "--", relativePath]);
  if (!attributes.endsWith(": lfs")) {
    throw new Error(`Fixture is not tracked by Git LFS: ${relativePath}`);
  }
}

function listZipEntries(archivePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (error, zipfile) => {
      if (error) {
        reject(error);
        return;
      }

      const entries: string[] = [];
      zipfile.on("entry", (entry: Entry) => {
        entries.push(entry.fileName);
        zipfile.readEntry();
      });
      zipfile.on("end", () => {
        zipfile.close();
        resolve(entries);
      });
      zipfile.on("error", (entryError: Error) => {
        zipfile.close();
        reject(entryError);
      });
      zipfile.readEntry();
    });
  });
}

function readZipEntry(archivePath: string, entryPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (error, zipfile) => {
      if (error) {
        reject(error);
        return;
      }

      let settled = false;
      const finishResolve = (value: Buffer) => {
        if (settled) {
          return;
        }
        settled = true;
        zipfile.close();
        resolve(value);
      };
      const finishReject = (reason: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        zipfile.close();
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      };

      zipfile.on("entry", (entry: Entry) => {
        if (entry.fileName !== entryPath) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            finishReject(streamError);
            return;
          }

          const chunks: Buffer[] = [];
          stream.on("data", (chunk: string | Buffer) => {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          });
          stream.on("end", () => {
            finishResolve(Buffer.concat(chunks));
          });
          stream.on("error", (err: Error) => {
            finishReject(err);
          });
        });
      });

      zipfile.on("end", () => {
        finishReject(new Error(`Missing fixture entry: ${entryPath}`));
      });
      zipfile.on("error", (err: Error) => {
        finishReject(err);
      });
      zipfile.readEntry();
    });
  });
}

async function assertZipBasedFixtureContents(relativePath: string): Promise<void> {
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
  ) as { name?: string; entry?: string };
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

async function assertLargeArchiveFixture(relativePath: string): Promise<void> {
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

async function main(): Promise<void> {
  for (const relativePath of allFixtures) {
    assertFileExists(relativePath);
    assertLfsTracked(relativePath);
  }

  for (const relativePath of zipBasedFixtures) {
    await assertZipBasedFixtureContents(relativePath);
  }
  await assertLargeArchiveFixture(".fixtures/large-sample.zip");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
