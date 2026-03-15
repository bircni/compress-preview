/** Optional initial data embedded in HTML so the first paint does not rely on postMessage. */
export type InitialEntriesPayload = {
  entries?: {
    path: string;
    name: string;
    isDirectory: boolean;
    size?: number;
    compressedSize?: number;
    mtime?: string | number;
  }[];
  isPartial?: boolean;
  message?: string;
  /** When set, show this error instead of the tree. */
  error?: string;
};

/**
 * Webview HTML and script for zip preview: hierarchy (indented list by path) and entry metadata.
 * @param cspSource - Webview cspSource so inline script/style are allowed (required for CSP).
 * @param initialData - When set, entries are embedded in the page so the tree shows without postMessage.
 */
export function getInitialHtml(cspSource: string, initialData?: InitialEntriesPayload): string {
  const initialScript =
    initialData != null
      ? `<script id="initial-entries" type="application/json">${JSON.stringify({
          entries: initialData.entries,
          isPartial: initialData.isPartial,
          message: initialData.message,
          error: initialData.error,
        }).replace(/</g, "\\u003c")}</script>`
      : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' ${cspSource}; style-src 'unsafe-inline' ${cspSource};">
  <style>
    :root {
      --panel-border: color-mix(in srgb, var(--vscode-panel-border, rgba(255, 255, 255, 0.12)) 78%, transparent);
      --panel-bg: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 90%, white 10%);
      --panel-bg-strong: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 82%, white 18%);
      --panel-bg-soft: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 94%, white 6%);
      --muted: var(--vscode-descriptionForeground, #8b949e);
      --accent: var(--vscode-textLink-foreground, #4ea1ff);
      --accent-soft: color-mix(in srgb, var(--vscode-textLink-foreground, #4ea1ff) 16%, transparent);
      --danger-soft: color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 16%, transparent);
      --success-soft: color-mix(in srgb, var(--vscode-testing-iconPassed, #73c991) 18%, transparent);
      --shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
      --radius-lg: 18px;
      --radius-md: 12px;
      --radius-sm: 10px;
    }
    body {
      font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
      font-size: var(--vscode-font-size, 13px);
      padding: 18px;
      margin: 0;
      color: var(--vscode-foreground, #d4d4d4);
      background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 14%, transparent), transparent 34%),
        linear-gradient(180deg, var(--panel-bg-soft), var(--vscode-editor-background, transparent));
      min-height: 100vh;
    }
    .shell {
      max-width: 980px;
      margin: 0 auto;
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      background: linear-gradient(180deg, var(--panel-bg), var(--panel-bg-soft));
      box-shadow: var(--shadow);
    }
    .hero {
      padding: 22px 22px 16px;
      border-bottom: 1px solid var(--panel-border);
      background:
        linear-gradient(135deg, var(--accent-soft), transparent 42%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent);
    }
    .eyebrow {
      margin: 0 0 6px;
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .titleRow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .title {
      margin: 0;
      font-size: 28px;
      line-height: 1.1;
      font-weight: 700;
      letter-spacing: -0.03em;
    }
    .subtitle {
      margin: 8px 0 0;
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      color: var(--muted);
      max-width: 60ch;
      line-height: 1.5;
    }
    .statusPill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--panel-bg-strong);
      border: 1px solid var(--panel-border);
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: 12px;
      color: var(--muted);
    }
    .statusDot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 6px var(--accent-soft);
      animation: pulse 1.6s ease-in-out infinite;
    }
    .content {
      padding: 18px;
      display: grid;
      gap: 14px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .summary {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      color: var(--muted);
      font-size: 12px;
    }
    .buttonRow {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    button,
    .linkButton {
      appearance: none;
      border: 1px solid var(--panel-border);
      background: linear-gradient(180deg, var(--panel-bg-strong), var(--panel-bg));
      color: var(--vscode-button-foreground, var(--vscode-foreground));
      padding: 9px 14px;
      border-radius: 999px;
      cursor: pointer;
      font: inherit;
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
      text-decoration: none;
    }
    button:hover,
    .linkButton:hover {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--accent) 40%, var(--panel-border));
    }
    .buttonPrimary {
      background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 22%, var(--panel-bg-strong)), var(--panel-bg));
      color: var(--vscode-foreground);
    }
    .panel {
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--panel-bg-soft) 92%, white 8%);
      overflow: hidden;
    }
    .state {
      margin: 0;
      padding: 16px 18px;
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      line-height: 1.5;
    }
    #loading {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--muted);
    }
    #loading::before {
      content: "";
      width: 14px;
      height: 14px;
      border-radius: 999px;
      border: 2px solid color-mix(in srgb, var(--accent) 30%, transparent);
      border-top-color: var(--accent);
      animation: spin 0.9s linear infinite;
    }
    #error {
      display: none;
      color: var(--vscode-errorForeground);
      background: var(--danger-soft);
    }
    #empty {
      display: none;
      color: var(--muted);
    }
    #tree {
      list-style: none;
      padding: 8px;
      margin: 0;
    }
    #tree .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      margin: 4px 0;
      border-radius: var(--radius-sm);
      border: 1px solid transparent;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent);
      transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
    }
    #tree .row:hover {
      background: color-mix(in srgb, var(--accent) 7%, var(--panel-bg-strong));
      border-color: color-mix(in srgb, var(--accent) 18%, var(--panel-border));
      transform: translateY(-1px);
    }
    #tree .row .name {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #tree .row .name::before {
      content: "•";
      color: var(--accent);
      opacity: 0.8;
      font-size: 16px;
      line-height: 1;
    }
    #tree .row[data-kind="dir"] .name::before {
      content: "◦";
      color: var(--muted);
    }
    #tree .row .name a,
    #tree .row .folderName {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #tree .row .name a {
      color: var(--vscode-foreground);
      text-decoration: none;
      border-bottom: 1px solid transparent;
    }
    #tree .row .name a:hover {
      border-bottom-color: color-mix(in srgb, var(--accent) 50%, transparent);
    }
    #tree .row .meta {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: 11px;
      color: var(--muted);
      text-align: right;
      white-space: nowrap;
    }
    #partial {
      display: none;
      padding: 14px 16px;
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-md);
      background: var(--success-soft);
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      color: var(--vscode-foreground);
      line-height: 1.5;
    }
    #partial.is-error {
      background: var(--danger-soft);
      color: var(--vscode-errorForeground);
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.9; }
      50% { transform: scale(0.86); opacity: 0.6; }
    }
    @media (max-width: 700px) {
      body {
        padding: 10px;
      }
      .hero,
      .content {
        padding: 14px;
      }
      .title {
        font-size: 24px;
      }
      #tree .row {
        grid-template-columns: 1fr;
      }
      #tree .row .meta {
        text-align: left;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="hero">
      <p class="eyebrow">Archive Preview</p>
      <div class="titleRow">
        <div>
          <h1 class="title">Inside this ZIP</h1>
          <p class="subtitle">Browse entries, inspect text files, and extract what you need without leaving the editor.</p>
        </div>
        <div class="statusPill"><span class="statusDot"></span><span id="statusText">Preparing archive</span></div>
      </div>
    </div>
    <div class="content">
      <div class="toolbar">
        <div id="summary" class="summary">Waiting for archive metadata…</div>
        <div class="buttonRow">
          <button id="retryBtn" type="button" style="display:none;">Retry</button>
          <button id="extractAllBtn" class="buttonPrimary" type="button" style="display:none;">Extract all</button>
        </div>
      </div>
      <div class="panel">
        <div id="loading" class="state">Loading archive contents…</div>
        <div id="error" class="state"></div>
        <div id="empty" class="state">This archive does not contain any visible entries.</div>
        <ul id="tree"></ul>
      </div>
      <div id="partial"></div>
    </div>
  </div>
  ${initialScript}
  <script>
    var vscode;
    try {
      vscode = acquireVsCodeApi();
    } catch (e) {}
    const treeEl = document.getElementById('tree');
    const errorEl = document.getElementById('error');
    const emptyEl = document.getElementById('empty');
    const loadingEl = document.getElementById('loading');
    const partialEl = document.getElementById('partial');
    const extractAllBtn = document.getElementById('extractAllBtn');
    const retryBtn = document.getElementById('retryBtn');
    const summaryEl = document.getElementById('summary');
    const statusTextEl = document.getElementById('statusText');

    function formatSize(n) {
      if (n == null) return '';
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / (1024 * 1024)).toFixed(2) + ' MB';
    }
    function formatMtime(m) {
      if (m == null) return '';
      var d = m instanceof Date ? m : new Date(m);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString();
    }
    function metaHtml(e) {
      var parts = [];
      if (e.size != null) parts.push(formatSize(e.size));
      if (e.compressedSize != null) parts.push('compressed: ' + formatSize(e.compressedSize));
      if (e.mtime != null) parts.push(formatMtime(e.mtime));
      return parts.length ? '<span class="meta">' + parts.join(' · ') + '</span>' : '';
    }
    function depth(path) {
      var p = (path || '').replace(/\\\\/g, '/').replace(/\\/$/, '');
      return p ? p.split('/').length : 0;
    }
    function renderEntries(entries) {
      if (!entries || !entries.length) return '';
      var sorted = entries.slice().sort(function(a, b) { return (a.path || '').localeCompare(b.path || ''); });
      return sorted.map(function(e) {
        var d = depth(e.path);
        var indent = (d * 14) + 'px';
        var name = e.isDirectory ? (e.name || e.path || '') + '/' : (e.name || e.path || '');
        var label = e.isDirectory ? '<span class="folderName">' + escapeHtml(name) + '</span>' : '<a href="#" data-path="' + escapeHtml(e.path) + '">' + escapeHtml(name) + '</a>';
        return '<li class="row" data-kind="' + (e.isDirectory ? 'dir' : 'file') + '" style="padding-left: calc(12px + ' + indent + ')"><span class="name">' + label + '</span>' + metaHtml(e) + '</li>';
      }).join('');
    }
    function escapeHtml(s) {
      if (s == null) return '';
      var div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    }
    function bindEntryLinks() {
      treeEl.querySelectorAll('a[data-path]').forEach(function(a) {
        a.addEventListener('click', function(e) {
          e.preventDefault();
          var p = a.getAttribute('data-path');
          if (p && vscode) {
            vscode.postMessage({ type: 'openEntry', path: p });
          }
        });
      });
    }
    function setStatus(text) {
      if (statusTextEl) {
        statusTextEl.textContent = text;
      }
    }
    function setSummary(text) {
      if (summaryEl) {
        summaryEl.textContent = text;
      }
    }
    function clearMessages() {
      if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
      }
      if (partialEl) {
        partialEl.style.display = 'none';
        partialEl.className = '';
        partialEl.innerHTML = '';
      }
    }
    function showRetry(show) {
      if (retryBtn) {
        retryBtn.style.display = show ? 'inline-flex' : 'none';
      }
    }
    function setEntries(entries, isPartial, message) {
      var count = entries ? entries.length : 0;
      clearMessages();
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = count ? 'none' : 'block';
      treeEl.innerHTML = renderEntries(entries || []);
      bindEntryLinks();
      if (extractAllBtn) extractAllBtn.style.display = count ? 'inline-flex' : 'none';
      setStatus(count ? 'Archive ready' : 'Archive is empty');
      setSummary(count ? count + ' entr' + (count === 1 ? 'y' : 'ies') + ' available' : 'No entries found');
      showRetry(Boolean(isPartial));
      if (isPartial && message && partialEl) {
        partialEl.style.display = 'block';
        partialEl.innerHTML = 'Showing a partial entry list. ' + escapeHtml(message) + ' <button id="retryBtnInline" type="button">Retry</button>';
        var retryBtnInline = document.getElementById('retryBtnInline');
        if (retryBtnInline && vscode) {
          retryBtnInline.onclick = function() { vscode.postMessage({ type: 'retryLoad' }); };
        }
      }
    }
    function setError(message) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (treeEl) treeEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'none';
      if (extractAllBtn) extractAllBtn.style.display = 'none';
      if (errorEl) {
        errorEl.style.display = 'block';
        errorEl.textContent = message || 'Error';
      }
      setStatus('Could not read archive');
      setSummary('The preview could not be rendered.');
      showRetry(true);
    }

    var initialEl = document.getElementById('initial-entries');
    if (initialEl && initialEl.textContent) {
      try {
        var data = JSON.parse(initialEl.textContent);
        if (data.error) {
          setError(data.error);
        } else {
          setEntries(data.entries || [], data.isPartial, data.message);
        }
      } catch (err) {}
    }

    window.addEventListener('message', function(e) {
      var msg = e.data;
      if (msg.type === 'init') {
        if (vscode) vscode.postMessage({ type: 'getEntries' });
      } else if (msg.type === 'loading') {
        if (loadingEl) loadingEl.style.display = msg.show ? 'flex' : 'none';
        if (msg.show) {
          setStatus('Reading archive');
          setSummary('Loading archive contents…');
          showRetry(false);
        }
      } else if (msg.type === 'error') {
        setError(msg.message || 'Error');
      } else if (msg.type === 'entries') {
        setEntries(msg.entries || [], msg.isPartial, msg.message);
      } else if (msg.type === 'openResult' || msg.type === 'extractResult') {
        if (msg.success === false && msg.error) {
          if (partialEl) {
            partialEl.style.display = 'block';
            partialEl.className = 'is-error';
            partialEl.innerHTML = escapeHtml(msg.error);
          }
        }
      }
    });
    if (retryBtn) retryBtn.addEventListener('click', function() { if (vscode) vscode.postMessage({ type: 'retryLoad' }); });
    if (extractAllBtn) extractAllBtn.addEventListener('click', function() { if (vscode) vscode.postMessage({ type: 'extractAll' }); });
    if (vscode) {
      vscode.postMessage({ type: 'getEntries' });
    }
  </script>
</body>
</html>`;
}
