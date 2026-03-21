import { Script } from "node:vm";
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

  it("throws when the webview template cannot be found", () => {
    jest.isolateModules(() => {
      jest.doMock("fs", () => ({
        existsSync: jest.fn(() => false),
        readFileSync: jest.fn(),
      }));

      const { getInitialHtml: missingTemplateHtml } =
        require("../webview/content") as typeof webviewContentModule;

      expect(() => missingTemplateHtml("vscode-webview:")).toThrow("Missing webview template");
    });
  });
});
