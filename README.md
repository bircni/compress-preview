# Zip Preview

Preview the contents of a `.zip` file directly inside VS Code.

Zip Preview replaces the usual binary file experience with a focused archive view so you can inspect entries, open text files, and extract files without leaving the editor.

## What It Does

- Opens `.zip` files in a custom preview view.
- Lists files and folders inside the archive.
- Lets you open text-based files directly in VS Code.
- Lets you extract one file or the full archive.
- Handles large archives with loading and partial-result states instead of hanging forever.

## Screenshots

_Coming soon_

## How To Use

1. Open any `.zip` file in VS Code.
2. Browse the archive contents in the preview.
3. Click a text file to open it read-only in the editor.
4. Use **Extract all** to unpack the archive.

## What Opens In The Editor

Text-like files open directly in VS Code, including common formats such as:

- `.txt`
- `.json`
- `.md`
- `.xml`
- `.html`
- `.css`
- `.js`
- `.ts`
- `.yml`
- `.yaml`
- `.csv`
- `.log`

Binary files are offered as a save/extract flow instead.

## Notes

- The preview is read-only.
- Very large archives may show a partial list first, with a retry option.
- Folder entries are shown in the archive view but cannot be opened as files.

## Install

Install from the VS Code Marketplace, or install a generated `.vsix` package manually.

## Feedback

Issues and feature requests: <https://github.com/bircni/zip-preview/issues>

## License

MIT
