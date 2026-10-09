# Changelog

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
