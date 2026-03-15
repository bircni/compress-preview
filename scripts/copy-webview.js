const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const sourcePath = path.join(rootDir, "src", "webview", "content.html");
const targetDir = path.join(rootDir, "dist", "webview");
const targetPath = path.join(targetDir, "content.html");

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(sourcePath, targetPath);
