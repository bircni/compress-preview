import fs from "node:fs";
import path from "node:path";

const scriptDir = path.dirname(path.resolve(process.argv[1] ?? ""));
const rootDir = path.resolve(scriptDir, "..");
const sourcePath = path.join(rootDir, "src", "webview", "content.html");
const targetDir = path.join(rootDir, "dist", "webview");
const targetPath = path.join(targetDir, "content.html");
const codiconsDir = path.join(rootDir, "node_modules", "@vscode", "codicons", "dist");

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(sourcePath, targetPath);

for (const asset of ["codicon.css", "codicon.ttf"]) {
  fs.copyFileSync(path.join(codiconsDir, asset), path.join(targetDir, asset));
}
