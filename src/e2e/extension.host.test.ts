import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tar, { type Headers as TarHeaders } from "tar-stream";
import * as vscode from "vscode";
import zlib from "node:zlib";

function fixtureUri(fileName: string): vscode.Uri {
  return vscode.Uri.file(path.resolve(__dirname, "..", "..", ".fixtures", fileName));
}

function previewUri(archiveUri: vscode.Uri, entryPath: string): vscode.Uri {
  return vscode.Uri.parse(
    `compress-preview://preview?zip=${encodeURIComponent(archiveUri.fsPath)}&entry=${encodeURIComponent(entryPath)}`,
  );
}

type TarFixtureEntry = {
  name: string;
  type?: TarHeaders["type"];
  content?: string;
};

async function createTarFixture(
  targetPath: string,
  entries: TarFixtureEntry[],
  options: { gzip?: boolean } = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const pack = tar.pack();
    const output = fs.createWriteStream(targetPath);
    const target = options.gzip ? pack.pipe(zlib.createGzip()) : pack;

    output.on("close", resolve);
    output.on("error", reject);
    pack.on("error", reject);
    target.pipe(output);

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

function createGzipFixture(targetPath: string, content: string): void {
  fs.writeFileSync(targetPath, zlib.gzipSync(content));
}

async function waitFor<T>(
  assertion: () => T | Promise<T>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 50;
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Timed out waiting for condition");
}

type EditorState = {
  zipPath: string;
  html: string;
  sentMessages: unknown[];
  lastBinaryPreviewPath?: string;
};

async function getEditorState(): Promise<EditorState | undefined> {
  return vscode.commands.executeCommand("compressPreview.__test.getState");
}

async function setEditorOverrides(overrides: Record<string, unknown>): Promise<void> {
  await vscode.commands.executeCommand("compressPreview.__test.setOverrides", overrides);
}

async function postEditorMessage(message: Record<string, unknown>): Promise<void> {
  await vscode.commands.executeCommand("compressPreview.__test.postMessage", message);
}

async function clearEditorMessages(): Promise<void> {
  await vscode.commands.executeCommand("compressPreview.__test.clearMessages");
}

async function resetEditorState(): Promise<void> {
  await vscode.commands.executeCommand("compressPreview.__test.reset");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

async function openCustomEditorFor(uri: vscode.Uri): Promise<EditorState> {
  await resetEditorState();
  await vscode.commands.executeCommand("vscode.openWith", uri, "compressPreview");
  return waitFor(async () => {
    const state = await getEditorState();
    if (!state) {
      throw new Error("Editor state not available");
    }
    assert.strictEqual(state.zipPath, uri.fsPath);
    assert.ok(state.html.length > 0);
    return state;
  });
}

describe("Compress Preview extension host", () => {
  before(async () => {
    const extension = vscode.extensions.getExtension("bircni.compress-preview");
    if (!extension) {
      throw new Error("Extension bircni.compress-preview not found");
    }
    await extension.activate();
  });

  afterEach(async () => {
    await resetEditorState();
  });

  it("registers the content provider and can read ZIP-based fixture entries", async () => {
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
      Promise.resolve(
        vscode.workspace.openTextDocument(vscode.Uri.parse("compress-preview://preview")),
      ),
      /Invalid compress-preview URI/,
    );
  });

  it("opens supported archives with the custom editor", async () => {
    const archiveUri = fixtureUri("large-sample.zip");
    const state = await openCustomEditorFor(archiveUri);

    assert.ok(state.html.includes("large-archive/data.js"));
  });

  it("opens the new zip-based format fixtures in the custom editor", async () => {
    const fixtures = [
      "sample-ebook.epub",
      "sample-document.docx",
      "sample-presentation.pptx",
      "sample-spreadsheet.xlsx",
      "sample-android-lib.aar",
      "sample-comic.cbz",
      "sample-ios-app.ipa",
      "sample-windows-app.appx",
    ];
    for (const fixture of fixtures) {
      const state = await openCustomEditorFor(fixtureUri(fixture));
      assert.ok(
        state.html.includes("docs/manifest.json"),
        `Expected ${fixture} to show entry listing`,
      );
    }
  });

  it("opens text entries from the real custom editor flow", async () => {
    await openCustomEditorFor(fixtureUri("sample-app.apk"));
    await clearEditorMessages();

    await postEditorMessage({ type: "openEntry", path: "docs/manifest.json" });

    await waitFor(() => {
      assert.ok(vscode.window.activeTextEditor);
      assert.strictEqual(vscode.window.activeTextEditor.document.uri.scheme, "compress-preview");
      assert.ok(
        vscode.window.activeTextEditor.document
          .getText()
          .includes('"name": "compress-preview-fixture"'),
      );
    });

    const state = await getEditorState();
    assert.deepStrictEqual(state?.sentMessages.at(-1), { type: "openResult", success: true });
  });

  it("opens binary entries and records the preview file path", async () => {
    await openCustomEditorFor(fixtureUri("sample-app.apk"));
    await clearEditorMessages();

    await postEditorMessage({ type: "openEntry", path: "assets/pixel.png" });

    const state = await waitFor(async () => {
      const nextState = await getEditorState();
      if (!nextState?.lastBinaryPreviewPath) {
        throw new Error("Binary preview path not yet recorded");
      }
      assert.ok(fs.existsSync(nextState.lastBinaryPreviewPath));
      assert.deepStrictEqual(nextState.sentMessages.at(-1), { type: "openResult", success: true });
      return nextState;
    });

    await clearEditorMessages();
    await postEditorMessage({ type: "openEntry", path: "assets/pixel.png" });
    const reusedState = await getEditorState();
    assert.strictEqual(reusedState?.lastBinaryPreviewPath, state.lastBinaryPreviewPath);
  });

  it("extracts a single nested entry from the custom editor flow", async () => {
    await openCustomEditorFor(fixtureUri("sample-app.apk"));
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-entry-"));
    const targetPath = path.join(targetDir, "docs", "manifest.json");

    await postEditorMessage({
      type: "extractEntry",
      path: "docs/manifest.json",
      targetPath,
    });

    await waitFor(() => {
      assert.ok(fs.existsSync(targetPath));
      assert.ok(fs.readFileSync(targetPath, "utf8").includes('"compress-preview-fixture"'));
    });

    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  it("extracts a single entry after selecting a folder", async () => {
    await openCustomEditorFor(fixtureUri("sample-app.apk"));
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-dialog-entry-"));
    await setEditorOverrides({ nextOpenDialogPaths: [targetDir] });

    await postEditorMessage({
      type: "extractEntry",
      path: "docs/manifest.json",
    });

    await waitFor(() => {
      const extractedPath = path.join(targetDir, "docs", "manifest.json");
      assert.ok(fs.existsSync(extractedPath));
    });

    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  it("extracts all entries to the default sibling folder", async () => {
    const archiveUri = fixtureUri("sample-app.apk");
    const defaultDir = path.join(path.dirname(archiveUri.fsPath), "sample-app");
    fs.rmSync(defaultDir, { recursive: true, force: true });
    await openCustomEditorFor(archiveUri);

    await postEditorMessage({ type: "extractAll" });

    await waitFor(() => {
      assert.ok(fs.existsSync(path.join(defaultDir, "docs", "manifest.json")));
      assert.ok(
        fs.readFileSync(path.join(defaultDir, "README.txt"), "utf8").includes("Archive fixture"),
      );
    });

    fs.rmSync(defaultDir, { recursive: true, force: true });
  });

  it("supports overwrite, cancel, and choose-other-folder extract-all flows", async () => {
    const archiveUri = fixtureUri("sample-app.apk");
    const defaultDir = path.join(path.dirname(archiveUri.fsPath), "sample-app");
    fs.rmSync(defaultDir, { recursive: true, force: true });
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(path.join(defaultDir, "stale.txt"), "old");
    await openCustomEditorFor(archiveUri);

    await setEditorOverrides({ nextWarningChoice: "Cancel" });
    await clearEditorMessages();
    await postEditorMessage({ type: "extractAll" });
    await waitFor(async () => {
      const state = await getEditorState();
      assert.deepStrictEqual(state?.sentMessages.at(-1), {
        type: "extractResult",
        success: false,
        error: "Cancelled",
      });
    });
    assert.ok(fs.existsSync(path.join(defaultDir, "stale.txt")));

    await setEditorOverrides({ nextWarningChoice: "Overwrite" });
    await clearEditorMessages();
    await postEditorMessage({ type: "extractAll" });
    await waitFor(() => {
      assert.ok(fs.existsSync(path.join(defaultDir, "docs", "manifest.json")));
      assert.ok(!fs.existsSync(path.join(defaultDir, "stale.txt")));
    });

    const alternateParent = fs.mkdtempSync(path.join(os.tmpdir(), "compress-preview-extract-all-"));
    fs.mkdirSync(path.join(alternateParent, "sample-app"), { recursive: true });
    await setEditorOverrides({
      nextWarningChoice: "Choose other folder",
      nextOpenDialogPaths: [alternateParent],
    });
    await clearEditorMessages();
    await postEditorMessage({ type: "extractAll" });
    await waitFor(() => {
      assert.ok(fs.existsSync(path.join(alternateParent, "sample-app", "docs", "manifest.json")));
    });

    fs.rmSync(defaultDir, { recursive: true, force: true });
    fs.rmSync(alternateParent, { recursive: true, force: true });
  });

  it("renders partial results and supports retrying the load", async () => {
    await setEditorOverrides({ listTimeoutMs: 1 });
    const archiveUri = fixtureUri("large-sample.zip");
    const initialState = await openCustomEditorFor(archiveUri);

    assert.ok(
      initialState.html.includes("Showing a partial entry list") ||
        initialState.html.includes("large-archive/data.js"),
    );

    await setEditorOverrides({ listTimeoutMs: 10_000 });
    await postEditorMessage({ type: "retryLoad" });
    const retriedState = await waitFor(async () => {
      const state = await getEditorState();
      if (!state) {
        throw new Error("Editor state not available");
      }
      assert.ok(state.html.includes("large-archive/data.js"));
      return state;
    });

    assert.ok(retriedState.html.includes("large-archive/data.js"));
  });

  it("renders a file-not-found error in the custom editor", async () => {
    const missingUri = vscode.Uri.file(
      path.join(os.tmpdir(), `missing-${Date.now().toString()}.zip`),
    );
    const state = await openCustomEditorFor(missingUri);

    assert.ok(state.html.includes("File not found."));
  });

  it("opens TAR, TGZ, and GZIP archives in the custom editor", async () => {
    const tarPath = path.join(os.tmpdir(), "compress-preview-e2e-open.tar");
    const tgzPath = path.join(os.tmpdir(), "compress-preview-e2e-open.tgz");
    const gzipPath = path.join(os.tmpdir(), "compress-preview-e2e-open.log.gz");
    fs.rmSync(tarPath, { force: true });
    fs.rmSync(tgzPath, { force: true });
    fs.rmSync(gzipPath, { force: true });
    await createTarFixture(tarPath, [{ name: "docs/readme.txt", content: "Sample TAR fixture\n" }]);
    await createTarFixture(
      tgzPath,
      [{ name: "docs/readme.txt", content: "Sample TGZ fixture\n" }],
      { gzip: true },
    );
    createGzipFixture(gzipPath, "Sample gzip fixture\n");

    const tarState = await openCustomEditorFor(vscode.Uri.file(tarPath));
    assert.ok(tarState.html.includes("docs/readme.txt"));

    const tgzState = await openCustomEditorFor(vscode.Uri.file(tgzPath));
    assert.ok(tgzState.html.includes("docs/readme.txt"));

    const gzipState = await openCustomEditorFor(vscode.Uri.file(gzipPath));
    assert.ok(gzipState.html.includes("compress-preview-e2e-open.log"));

    fs.rmSync(tarPath, { force: true });
    fs.rmSync(tgzPath, { force: true });
    fs.rmSync(gzipPath, { force: true });
  });
});
