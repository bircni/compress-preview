import { execSync } from "node:child_process";

/**
 * Release helper script for this project.
 * - Runs validation checks
 * - Gets next version with git-cliff (or a custom version via --version)
 * - Generates CHANGELOG.md
 * - Bumps package.json version
 * - Commits changes and creates git tag
 * - Prints push/undo instructions
 */

function run(cmd: string, opts: { stdio?: "pipe" | "inherit" } = {}): string {
  try {
    return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts }).trim();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Command failed: ${cmd}\n${message}`, { cause: err });
  }
}

function log(msg: string): void {
  console.log(`\x1b[36m${msg}\x1b[0m`);
}

function error(msg: string): void {
  console.error(`\x1b[31m${msg}\x1b[0m`);
}

function parseArgs(argv: string[]): { customVersion: string | null | undefined } {
  const args = argv.slice(2);
  let customVersion: string | null | undefined = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--version" || arg === "-v") {
      customVersion = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--version=")) {
      customVersion = arg.split("=")[1];
      continue;
    }
  }

  return { customVersion };
}

try {
  const { customVersion } = parseArgs(process.argv);
  if (customVersion === "") {
    throw new Error("Custom version cannot be empty. Use --version <x.y.z>.");
  }
  if (customVersion === undefined) {
    throw new Error("Missing value for --version. Use --version <x.y.z>.");
  }
  const branch = run("git rev-parse --abbrev-ref HEAD");
  if (branch !== "main") {
    throw new Error(`You must be on the main branch to run this script. Current branch: ${branch}`);
  }
  const status = run("git status --porcelain");
  if (status) {
    throw new Error(
      "Your working tree is not clean. Please commit or stash your changes before running this script.",
    );
  }

  log("🔍 Running validation checks...");
  log("  📝 Validating feature file structure...");
  run("npm run lint");
  log("  🧪 Running tests...");
  run("npm test");
  log("  🔨 Building extension...");
  run("npm run build");
  log("✅ All validation checks passed");

  log("🔍 Checking git-cliff availability...");
  try {
    run("npx --yes git-cliff --version", { stdio: "pipe" });
  } catch {
    throw new Error(
      "git-cliff is not available. Run 'npm install' to install dev dependencies, or install globally with: npm install -g git-cliff",
    );
  }

  let nextVersion: string | null | undefined = customVersion;
  if (nextVersion) {
    log(`🔍 Using custom version: ${nextVersion}`);
  } else {
    log("🔍 Determining next version with git-cliff...");
    nextVersion = run("npx git-cliff --bumped-version");
    if (!nextVersion) {
      throw new Error(
        "Failed to determine next version. Ensure you have conventional commits since the last tag.",
      );
    }
  }
  nextVersion = nextVersion.replace(/^v/, "");
  const tagVersion = `v${nextVersion}`;
  log(`Next version: ${nextVersion} (tag: ${tagVersion})`);

  log("📝 Generating CHANGELOG.md...");
  run(`npx git-cliff -o CHANGELOG.md --tag ${tagVersion}`);

  log("🔢 Bumping package.json version...");
  run(`npm version ${nextVersion} --no-git-tag-version`);

  log("✅ Committing changes...");
  run("git add CHANGELOG.md package.json package-lock.json");
  run(`git commit -m "chore(release): ${tagVersion}"`);

  log("🏷️  Creating git tag...");
  run(`git tag ${tagVersion}`);

  log("🎉 Release prep complete!");
  console.log("\nNext steps:");
  console.log(`  1. Push changes including the new tag:\n     git push origin main --follow-tags`);
  console.log(
    `  2. If you need to undo, run:\n     git reset --hard HEAD~1\n     git tag -d ${tagVersion}`,
  );
} catch (err: unknown) {
  error("Release failed:");
  const message = err instanceof Error ? err.message : String(err);
  error(message);
  if (err instanceof Error && err.stack && process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
}
