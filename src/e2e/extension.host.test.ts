import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tar from "tar-stream";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
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
  type?: string;
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
    expect(state.zipPath).toBe(uri.fsPath);
    expect(state.html.length).toBeGreaterThan(0);
    return state;
  });
}

describe("Compress Preview extension host", () => {
  beforeAll(async () => {
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

    expect(document.getText()).toContain('"name": "compress-preview-fixture"');
  });

  it("reads TAR-based fixture entries through the virtual document provider", async () => {
    const tarPath = path.join(os.tmpdir(), "compress-preview-e2e.tar");
    fs.rmSync(tarPath, { force: true });
    await createTarFixture(tarPath, [{ name: "docs/readme.txt", content: "Sample TAR fixture\n" }]);
    const uri = previewUri(vscode.Uri.file(tarPath), "docs/readme.txt");

    const document = await vscode.workspace.openTextDocument(uri);

    expect(document.getText()).toContain("Sample TAR fixture");
    fs.rmSync(tarPath, { force: true });
  });

  it("reads GZIP entries as a single decompressed virtual document", async () => {
    const gzipPath = path.join(os.tmpdir(), "compress-preview-e2e.log.gz");
    fs.rmSync(gzipPath, { force: true });
    createGzipFixture(gzipPath, "Sample gzip fixture\n");
    const uri = previewUri(vscode.Uri.file(gzipPath), "compress-preview-e2e.log");

    const document = await vscode.workspace.openTextDocument(uri);

    expect(document.getText()).toContain("Sample gzip fixture");
    fs.rmSync(gzipPath, { force: true });
  });

  it("rejects invalid preview URIs", async () => {
    await expect(
      vscode.workspace.openTextDocument(vscode.Uri.parse("compress-preview://preview")),
    ).rejects.toThrow(/Invalid compress-preview URI/);
  });

  it("opens supported archives with the custom editor", async () => {
    const archiveUri = fixtureUri("large-sample.zip");
    const state = await openCustomEditorFor(archiveUri);

    expect(state.html).toContain("large-archive/data.js");
  });

  it("opens text entries from the real custom editor flow", async () => {
    await openCustomEditorFor(fixtureUri("sample-app.apk"));
    await clearEditorMessages();

    await postEditorMessage({ type: "openEntry", path: "docs/manifest.json" });

    await waitFor(() => {
      expect(vscode.window.activeTextEditor).toBeTruthy();
      expect(vscode.window.activeTextEditor?.document.uri.scheme).toBe("compress-preview");
      expect(vscode.window.activeTextEditor?.document.getText()).toContain(
        '"name": "compress-preview-fixture"',
      );
    });

    const state = await getEditorState();
    expect(state?.sentMessages.at(-1)).toEqual({ type: "openResult", success: true });
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
      expect(fs.existsSync(nextState.lastBinaryPreviewPath)).toBe(true);
      expect(nextState.sentMessages.at(-1)).toEqual({ type: "openResult", success: true });
      return nextState;
    });

    await clearEditorMessages();
    await postEditorMessage({ type: "openEntry", path: "assets/pixel.png" });
    const reusedState = await getEditorState();
    expect(reusedState?.lastBinaryPreviewPath).toBe(state.lastBinaryPreviewPath);
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
      expect(fs.existsSync(targetPath)).toBe(true);
      expect(fs.readFileSync(targetPath, "utf8")).toContain('"compress-preview-fixture"');
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
      expect(fs.existsSync(extractedPath)).toBe(true);
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
      expect(fs.existsSync(path.join(defaultDir, "docs", "manifest.json"))).toBe(true);
      expect(fs.readFileSync(path.join(defaultDir, "README.txt"), "utf8")).toContain(
        "Archive fixture",
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
      expect(state?.sentMessages.at(-1)).toEqual({
        type: "extractResult",
        success: false,
        error: "Cancelled",
      });
    });
    expect(fs.existsSync(path.join(defaultDir, "stale.txt"))).toBe(true);

    await setEditorOverrides({ nextWarningChoice: "Overwrite" });
    await clearEditorMessages();
    await postEditorMessage({ type: "extractAll" });
    await waitFor(() => {
      expect(fs.existsSync(path.join(defaultDir, "docs", "manifest.json"))).toBe(true);
      expect(fs.existsSync(path.join(defaultDir, "stale.txt"))).toBe(false);
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
      expect(fs.existsSync(path.join(alternateParent, "sample-app", "docs", "manifest.json"))).toBe(
        true,
      );
    });

    fs.rmSync(defaultDir, { recursive: true, force: true });
    fs.rmSync(alternateParent, { recursive: true, force: true });
  });

  it("renders partial results and supports retrying the load", async () => {
    await setEditorOverrides({ listTimeoutMs: 1 });
    const archiveUri = fixtureUri("large-sample.zip");
    const initialState = await openCustomEditorFor(archiveUri);

    expect(
      initialState.html.includes("Showing a partial entry list") ||
        initialState.html.includes("large-archive/data.js"),
    ).toBe(true);

    await setEditorOverrides({ listTimeoutMs: 10_000 });
    await postEditorMessage({ type: "retryLoad" });
    const retriedState = await waitFor(async () => {
      const state = await getEditorState();
      if (!state) {
        throw new Error("Editor state not available");
      }
      expect(state.html).toContain("large-archive/data.js");
      return state;
    });

    expect(retriedState.html).toContain("large-archive/data.js");
  });

  it("renders a file-not-found error in the custom editor", async () => {
    const missingUri = vscode.Uri.file(path.join(os.tmpdir(), `missing-${Date.now()}.zip`));
    const state = await openCustomEditorFor(missingUri);

    expect(state.html).toContain("File not found.");
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
      {
        gzip: true,
      },
    );
    createGzipFixture(gzipPath, "Sample gzip fixture\n");

    const tarState = await openCustomEditorFor(vscode.Uri.file(tarPath));
    expect(tarState.html).toContain("docs/readme.txt");

    const tgzState = await openCustomEditorFor(vscode.Uri.file(tgzPath));
    expect(tgzState.html).toContain("docs/readme.txt");

    const gzipState = await openCustomEditorFor(vscode.Uri.file(gzipPath));
    expect(gzipState.html).toContain("compress-preview-e2e-open.log");

    fs.rmSync(tarPath, { force: true });
    fs.rmSync(tgzPath, { force: true });
    fs.rmSync(gzipPath, { force: true });
  });
});
