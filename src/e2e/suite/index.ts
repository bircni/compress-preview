import path from "node:path";
import { globSync } from "glob";
import mochaRunner from "mocha";

export async function run(): Promise<void> {
  const mocha = new mochaRunner({ ui: "bdd", color: true, timeout: 60_000 });
  const testsRoot = path.resolve(__dirname, "..");
  const testFiles = globSync("**/*.host.test.js", { cwd: testsRoot });
  for (const f of testFiles) {
    mocha.addFile(path.resolve(testsRoot, f));
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${String(failures)} test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
