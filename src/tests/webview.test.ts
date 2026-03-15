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
    expect(script).toContain("const statusTextEl = document.getElementById('statusText');");
  });
});
