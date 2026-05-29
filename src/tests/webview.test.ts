import { Script } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { getInitialHtml } from "../webview/content";
import type * as webviewContentModule from "../webview/content";

function extractInlineScript(html: string): string {
  const matches = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const script = matches.at(-1)?.[1];
  if (!script) {
    throw new Error("Expected an inline script in generated HTML");
  }
  return script;
}

describe("getInitialHtml", () => {
  it("emits a parseable inline script", () => {
    const html = getInitialHtml("vscode-webview:", {
      entries: [
        {
          path: "docs/readme.txt",
          name: "readme.txt",
          isDirectory: false,
        },
      ],
    });

    const script = extractInlineScript(html);

    expect(() => new Script(script)).not.toThrow();
    expect(html).not.toContain('id="debug"');
    expect(script).toContain("var statusTextEl = document.getElementById('statusText');");
    expect(script).toContain("function compareEntries(a, b)");
    expect(script).toContain("function buildTree(entries)");
    expect(script).toContain("function renderVisibleTree()");
    expect(html).toContain('placeholder="Search files"');
    expect(html).toContain('data-sort="size"');
    expect(html).toContain('data-sort="mtime"');
    expect(html).toContain('data-col="kind"');
    expect(html).toContain("colResizeHandle");
    expect(html).toContain("layoutTableColumns");
    expect(html).toContain('data-filter="binary"');
    expect(html).toContain('id="expandAllBtn"');
  });

  it("does not request entries again when initial data is embedded", () => {
    const html = getInitialHtml("vscode-webview:", {
      entries: [
        {
          path: "docs/readme.txt",
          name: "readme.txt",
          isDirectory: false,
        },
      ],
    });

    expect(html).toContain("var hasInitialData = false;");
    expect(html).toContain("if (vscode && !hasInitialData)");
  });

  it("omits the initial JSON script when no data is provided", () => {
    const html = getInitialHtml("vscode-webview:");

    expect(html).not.toContain('id="initial-entries"');
    expect(html).toContain("Loading archive contents...");
  });

  it("escapes unsafe characters in embedded initial data", () => {
    const html = getInitialHtml("vscode-webview:", {
      error: "</script><div>boom</div>",
    });

    expect(html).toContain("\\u003c/script>");
    expect(html).not.toContain("</script><div>boom</div>");
  });

  it("throws when the webview template cannot be found", async () => {
    vi.resetModules();
    vi.doMock("fs", () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
    }));

    const { getInitialHtml: missingTemplateHtml } =
      (await import("../webview/content")) as typeof webviewContentModule;

    expect(() => missingTemplateHtml("vscode-webview:")).toThrow("Missing webview template");
  });

  it("injects the codicons stylesheet href when provided", () => {
    const html = getInitialHtml("vscode-webview://webview/", undefined, {
      codiconsStyleHref: "vscode-webview://webview/codicon.css",
    });

    expect(html).toContain('href="vscode-webview://webview/codicon.css"');
  });

  it("embeds partial result metadata in the initial JSON payload", () => {
    const html = getInitialHtml("vscode-webview:", {
      entries: [{ path: "a.txt", name: "a.txt", isDirectory: false }],
      isPartial: true,
      message: "Stopped early",
    });

    expect(html).toContain('"isPartial":true');
    expect(html).toContain("Stopped early");
  });
});
