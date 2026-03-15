import { Script } from "node:vm";
import { getInitialHtml } from "../webview/content";

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
});
