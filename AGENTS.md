# AI Agent Guide for Compress Preview

This document provides essential context and guidelines for AI agents working on this VS Code extension. Follow these instructions so contributions align with project standards.

## Quick Start Checklist

Before making changes:

1. Read this file completely
2. Understand the project structure (see below)
3. Run `npm run validate` to ensure current state is clean
4. Identify the correct files to modify under `src/`
5. Add or update tests in `src/tests/` as needed
6. Run `npm run validate` again before committing

## Project Context

**What This Project Does:**

- VS Code extension that **previews `.zip` files** in a custom editor instead of the default binary view
- Lists files and folders inside the archive in a webview
- Opens **text-based files** (e.g. `.txt`, `.json`, `.md`) read-only in the editor via a custom `compress-preview://` URI scheme
- **Extract**: single file or “Extract all” (sibling folder named after the zip, or user-chosen path)
- Handles **large archives** with a time-bound list and partial-result state (retry to load more)

**Tech Stack:**

- TypeScript (strict), Node.js (see `.node-version`)
- VS Code Extension API (custom editor, `TextDocumentContentProvider`)
- [yauzl](https://github.com/thejoshwolfe/yauzl) for reading zip files
- Single webview (HTML + inline script in `src/webview/content.html`), HTML template loaded at runtime via `src/webview/content.ts`
- Jest for tests
- esbuild for bundling, vsce for packaging
- ESLint, Prettier

## Project Structure

### Source Code (`src/`)

**Entry and wiring:**

- `extension.ts` – Activation: output channel, `ZipContentProvider` registration, custom editor provider (`compressPreview`)

**Archive (zip reading):**

- `archive/archive.ts` – List entries (time-bound), open read stream for one entry, archive size; uses yauzl with `lazyEntries: true`
- `archive/entry.ts` – Types: `ArchiveEntry`, `EntryContentStream`; helper `entryNameFromPath`
- `archive/extract.ts` – Extract one entry or all entries; `extractAllTargetDir` (sibling folder rule)

**Editor and content provider:**

- `editor/zipEditor.ts` – `ZipPreviewEditorProvider`: opens zip as custom document, resolves webview, loads entries into HTML, handles webview messages (`openEntry`, `extractEntry`, `extractAll`, `getEntries`, `retryLoad`)
- `editor/zipContentProvider.ts` – `TextDocumentContentProvider` for `compress-preview://` URIs; `makeZipPreviewUri(zipPath, entryPath)`; streams entry content as UTF-8 text

**Webview:**

- `webview/content.html` – Single-file UI: archive tree, loading/error/partial states, Retry, Extract all; inline script talks to host via `acquireVsCodeApi()` and `postMessage`
- `webview/content.ts` – `getInitialHtml(cspSource, initialData)` loads template from disk, injects CSP and optional initial JSON for first paint

**Utilities:**

- `logger.ts` – `setOutputChannel`, `logger.info/warn/error`; logs to “Compress Preview” output channel

**Tests:**

- Tests live in `src/tests/` with naming `*.test.ts` (e.g. `archive.test.ts`, `extract.test.ts`, `webview.test.ts`, `extension.test.ts`)
- Some tests use mocks (e.g. `archive.mock.test.ts`, `extract.mock.test.ts`)

### Other Directories

- `dist/` – Build output (DO NOT EDIT; generated). Includes `extension.js`, `webview/content.html`, `extension.vsix`
- `scripts/` – Release script (`release.js`)
- `assets/` – Icon (`icon.svg`; package.json references `icon.png` for marketplace – add or generate PNG as needed)
- `.fixtures/` – Test fixtures (e.g. `large-sample.zip`)

## Available Commands

**Build & development:**

```bash
npm run compile        # TypeScript only (tsconfig.build.json)
npm run bundle         # esbuild → dist/extension.js
npm run copy:webview   # Copy content.html to dist/webview/
npm run package        # Produce dist/extension.vsix
npm run build          # compile + bundle + copy:webview + package
npm run clean          # Remove dist/
npm run watch          # tsc watch (no bundle)
```

**Testing:**

```bash
npm test               # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report
npm run test:report    # Tests then report path
```

**Quality:**

```bash
npm run lint           # ESLint
npm run format         # Prettier check
npm run format:write   # Prettier fix
npm run check-unused   # depcheck
npm run validate       # check-unused + lint + format + test:coverage + build
```

**Security:**

```bash
npm run audit          # npm audit (--audit-level high)
```

**Release / install (dev):**

```bash
npm run release        # Version, changelog (cliff), tag (see scripts/release.js)
npm run install:debug  # Build and install .vsix into VS Code
npm run uninstall:debug # Uninstall extension
```

## Critical Rules for AI Agents

### 1. File Modification Boundaries

**Do:**

- Modify source under `src/` (excluding `dist/`, which is generated)
- Add or update tests in `src/tests/*.test.ts`
- Update `package.json` for dependencies, scripts, or contribution points (e.g. `customEditors`, activation events)
- Update README or docs when adding user-facing behavior or config

**Do not:**

- Edit files in `dist/`
- Change `.vscodeignore` or build config without good reason
- Edit `CHANGELOG.md` by hand (generated by release process)

### 2. Custom Editor and Webview

- The custom editor is registered for `*.zip` with view type `compressPreview`. Only one document type.
- Webview HTML is set once after `listEntries` completes (with a short defer). Initial data is embedded in the page via a `<script type="application/json">` block so the first paint doesn’t depend on postMessage.
- All host ↔ webview communication is via `webview.postMessage` / `webview.onDidReceiveMessage`. Message types: `getEntries`, `retryLoad`, `openEntry`, `extractEntry`, `extractAll`; host replies with `openResult`, `extractResult`, etc.

### 3. Archive and Extract

- Use `listEntries(zipPath, { timeoutMs })` for the tree; support partial results (`isPartial`, `message`).
- Use `openEntryReadStream(zipPath, entryPath)` for reading one entry; caller consumes the stream (e.g. `zipContentProvider` with `streamToString`, or pipe to file for binary).
- Extract: `extractEntry(zipPath, entryPath, outPath)` for one file/dir; `extractAll(zipPath, outDir, { overwrite })` for full unpack. Target dir for “Extract all” is `extractAllTargetDir(zipPath)` (sibling folder) unless user picks another.
- Paths: normalize entry paths (strip `./`, normalize slashes). When writing to disk, guard against path traversal (e.g. ensure resolved path stays under `outDir`).

### 4. Testing

- Add or update tests in `src/tests/` for new or changed behavior.
- Run `npm test` (and ideally `npm run validate`) before committing.
- Use existing patterns: create zips with `archiver` in tests, mock fs/vscode when needed (see `archive.mock.test.ts`, `extract.mock.test.ts`).

### 5. Code Style

- TypeScript strict mode; avoid `any`.
- Use existing patterns: `ArchiveEntry`, `listEntries`, `openEntryReadStream`, `makeZipPreviewUri`, `getInitialHtml`.
- Naming: PascalCase for classes, camelCase for functions and variables.

### 6. Git and Commits

- Prefer [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): description`, `fix(scope): description`, `chore: description`, etc.
- Scope can be a subarea: e.g. `feat(webview): …`, `fix(extract): …`, `chore(deps): …`.

### 7. Validation Before Committing

Run:

```bash
npm run validate
```

This runs check-unused, lint, format, test:coverage, and build. Fix any failures before committing.

## Common Tasks and Patterns

### Adding a new text extension (open in editor)

- Extend `TEXT_EXTENSIONS` in `src/editor/zipEditor.ts`. Entries whose extension is in this set (or missing) open via `makeZipPreviewUri`; others get a save dialog.

### Changing the archive list or timeout

- `src/archive/archive.ts`: `listEntries`, `DEFAULT_TIMEOUT_MS`, `LOADING_INDICATOR_THRESHOLD`.
- Editor passes `timeoutMs` from a constant; could later be a VS Code setting.

### Changing extract behavior or paths

- `src/archive/extract.ts`: `extractEntry`, `extractAll`, `extractAllTargetDir`. Ensure resolved output paths stay under the target dir (path traversal safety).

### Changing webview UI or messages

- `src/webview/content.html`: structure, styles, and inline script (message handlers, render functions).
- `src/webview/content.ts`: `getInitialHtml`, template path resolution, initial JSON shape.
- `src/editor/zipEditor.ts`: `onDidReceiveMessage` handler and `postMessage` replies.

### Exposing a setting (e.g. list timeout)

- Add to `package.json` under `contributes.configuration`, then read in the editor with `vscode.workspace.getConfiguration('compress-preview')` and pass into `listEntries`.

## Definition of Done

Before considering a task complete:

- [ ] Code compiles (`npm run compile` or `npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] Tests added/updated for new or changed behavior
- [ ] Lint passes (`npm run lint`)
- [ ] Format check passes (`npm run format`); run `npm run format:write` if needed
- [ ] `npm run validate` passes
- [ ] Commit message follows Conventional Commits
- [ ] Changes are focused and minimal

## Quick Reference

**Commands:**

```bash
npm run validate   # Full check before commit
npm test          # Tests
npm run build     # Build extension
npm run lint      # Lint
npm run audit     # Security audit
```

**Locations:**

- Source: `src/` (archive/, editor/, webview/, logger.ts)
- Tests: `src/tests/*.test.ts`
- Build output: `dist/` (do not edit)

**Commit format:**

```
<type>(<scope>): <description>

e.g. feat(webview): add filter for entry names
     fix(extract): prevent path traversal out of target dir
     chore(deps): bump yauzl
```

When in doubt, follow existing patterns in the codebase.
