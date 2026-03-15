const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { describe, it } = require("mocha");
const tar = require("tar-stream");
const vscode = require("vscode");
const zlib = require("zlib");

function fixtureUri(fileName) {
  return vscode.Uri.file(path.resolve(__dirname, "..", "..", "..", ".fixtures", fileName));
}

function previewUri(archiveUri, entryPath) {
  return vscode.Uri.parse(
    `compress-preview://preview?zip=${encodeURIComponent(archiveUri.fsPath)}&entry=${encodeURIComponent(entryPath)}`,
  );
}

async function createTarFixture(targetPath, entries) {
  await new Promise((resolve, reject) => {
    const pack = tar.pack();
    const output = fs.createWriteStream(targetPath);

    output.on("close", resolve);
    output.on("error", reject);
    pack.on("error", reject);
    pack.pipe(output);

    for (const entry of entries) {
      pack.entry({ name: entry.name, type: entry.type }, entry.content ?? "", (error) => {
        if (error) {
          reject(error);
        }
      });
    }

    pack.finalize();
  });
}

function createGzipFixture(targetPath, content) {
  fs.writeFileSync(targetPath, zlib.gzipSync(content));
}

describe("Compress Preview E2E", () => {
  it("registers the content provider and can read ZIP-based fixture entries", async () => {
    const extension = vscode.extensions.getExtension("bircni.compress-preview");
    assert.ok(extension, "Extension should be installed in the extension host");
    await extension.activate();

    const uri = previewUri(fixtureUri("sample-app.apk"), "docs/manifest.json");
    const document = await vscode.workspace.openTextDocument(uri);

    assert.ok(document.getText().includes('"name": "compress-preview-fixture"'));
  });

  it("reads TAR-based fixture entries through the virtual document provider", async () => {
    const tarPath = path.join(os.tmpdir(), "compress-preview-e2e.tar");
    fs.rmSync(tarPath, { force: true });
    await createTarFixture(tarPath, [{ name: "docs/readme.txt", content: "Sample TAR fixture\n" }]);
    const uri = previewUri(vscode.Uri.file(tarPath), "docs/readme.txt");

    const document = await vscode.workspace.openTextDocument(uri);

    assert.ok(document.getText().includes("Sample TAR fixture"));
    fs.rmSync(tarPath, { force: true });
  });

  it("reads GZIP entries as a single decompressed virtual document", async () => {
    const gzipPath = path.join(os.tmpdir(), "compress-preview-e2e.log.gz");
    fs.rmSync(gzipPath, { force: true });
    createGzipFixture(gzipPath, "Sample gzip fixture\n");
    const uri = previewUri(vscode.Uri.file(gzipPath), "compress-preview-e2e.log");

    const document = await vscode.workspace.openTextDocument(uri);

    assert.ok(document.getText().includes("Sample gzip fixture"));
    fs.rmSync(gzipPath, { force: true });
  });

  it("rejects invalid preview URIs", async () => {
    await assert.rejects(
      () => vscode.workspace.openTextDocument(vscode.Uri.parse("compress-preview://preview")),
      /Invalid compress-preview URI/,
    );
  });

  it("opens supported archives with the custom editor", async () => {
    const archiveUri = fixtureUri("large-sample.zip");
    const beforeEditors = vscode.window.visibleTextEditors.length;

    await vscode.commands.executeCommand("vscode.openWith", archiveUri, "compressPreview");

    assert.ok(vscode.window.activeTextEditor === undefined);
    assert.ok(vscode.window.visibleTextEditors.length <= beforeEditors);
  });
});
