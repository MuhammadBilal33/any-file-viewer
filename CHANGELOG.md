# Changelog

## 0.1.2 - 2026-10-09

- Fixed: wide CSV, Excel and ZIP tables showed no sideways scrollbar (it sat under the last row),
  so the right-hand columns looked cut off. The viewer area now scrolls both ways.
- Fixed: the header row and the row numbers now stay in place while scrolling. In Excel the header
  row sits under the sheet tabs.
- Tables have padding and an outer border instead of touching the edges.
- Long cells still end in "…" but show their full text on hover. Columns may be a bit wider.

## 0.1.1 - 2026-10-09

- Fixed: with the React component inside a box that only has a max-height (a modal, for example),
  a long document grew past the box and covered what sat below it. The viewer now takes the box's
  real height and scrolls inside it.
- Added the GitHub repository, homepage and issues links to the package.

## 0.1.0 - 2026-10-09

First version.

- One viewer for PDF, Word, Excel and OpenDocument sheets, PowerPoint (simple preview), CSV and
  TSV, images, video, audio, text and code, HTML and ZIP.
- Framework-free core (`createFileViewer`) and a React wrapper (`any-file-viewer/react`).
- File type found from the name, then the MIME type, then the first bytes.
- Each format loads its library only when needed. pdf.js, docx-preview, SheetJS and JSZip are
  optional peer dependencies.
- PDF pages draw only near the screen and are freed when far away. Text can be selected. Page
  box, zoom and fit to width.
- Sheets and CSV load rows in pages, with sticky headers and row numbers.
- Safety: HTML runs in a sandboxed frame with no network, unsafe links are removed from
  documents, PDF fonts never use `eval`, and a size limit stops huge files.
- Light and dark mode, translatable labels, keyboard and screen-reader support.
