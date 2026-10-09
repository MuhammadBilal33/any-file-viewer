# CLAUDE.md

`any-file-viewer` — an npm library that shows a file inside a web page: PDF, Word, Excel,
PowerPoint, CSV, images, video, audio, text and code, HTML and ZIP. Framework-free core plus a
React wrapper. Moved out of `Customer-Chat-System-FE/packages/file-viewer` on 2026-10-09 so it can
be published on its own. No app uses it yet.

Write in simple, plain English (code comments, docs, replies). Short sentences, easy words.

## Commands

```bash
npm install
npm run build      # tsc -> dist/ + copy styles.css. This is the type check.
npm test           # build, then node --test "tests/**/*.test.mjs"
npm run demo       # build + test page on http://127.0.0.1:3200/ (PowerShell other port: $env:PORT=3201; npm run demo)
npm pack --dry-run # see exactly what would be published
```

`npm test` must pass before any publish (`prepublishOnly` runs it). There is no ESLint here yet;
the strict tsconfig (`noUnusedLocals`, `strict`) is the code check.

## Layout

- `src/core/` — `viewer.ts` (`createFileViewer`), `detect.ts` (extension → MIME → magic bytes),
  `source.ts` (`loadBytes` with the size limit), `options.ts`, `labels.ts`, `errors.ts`, `types.ts`,
  `registry.ts` (one lazy `import()` per kind).
- `src/renderers/` — one file per kind; `presentation/` is our own .pptx reader.
- `src/utils/` — pure helpers (tested) plus small DOM helpers.
- `src/react/` — `FileViewer` component (`"use client"`), exported as `any-file-viewer/react`.
- `tests/` — `node --test` suites against `dist/`. Pure parts only.
- `demo/` — test page, plain Node server, generated samples. Not published (`files` in package.json).

Imports use `.js` endings (NodeNext). Named exports only. No `any`.

## Rules to keep

- **PDF worker comes from the host's own origin** (`pdf.workerSrc`). A CDN worker is ORB-blocked
  inside iframes. No worker set → `config` error.
- pdf.js gets a **copy** of the bytes (`slice(0)`): it transfers the buffer to its worker, and
  Download would otherwise get an empty file.
- `isEvalSupported: false` on `getDocument` (CVE-2024-4367).
- HTML: `sandbox=""` + a CSP `<meta>` put first (`lockedHtmlDocument`). Never add `allow-scripts`.
- Word: `neutralizeLinks` keeps only http / https / mailto / #. Cells and text use `textContent`.
- SheetJS comes from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, never the npm `xlsx`
  (0.18.5 has known CVEs).
- PowerPoint is a simple preview: text, pictures, tables, plain hex colours, layout/master
  placeholders, group transforms. Theme colours, charts and SmartArt are not drawn.
- Encrypted Office files start with the OLE2 header → `password_protected`.
- Format libraries are optional peer dependencies. Never make them hard dependencies.
- Loading states are skeletons, not spinners. New animations must be listed in the
  `prefers-reduced-motion` block of `styles.css`.

## Testing in a browser

The test page was checked in real headless Chrome through the DevTools protocol on 2026-10-09.
Do NOT use Chrome `--virtual-time-budget` screenshots for PDFs: virtual time stalls the pdf.js
worker and the page sits on the skeleton.

## Before publishing

- It is the user's **personal** package (npm user `muhammad_bilal_78809`), not a company one.
  Never move it back under the `@cwit` scope. Name `any-file-viewer`, MIT license, public access.
- npm needs two-factor login to publish: `npm publish --otp=<6-digit code>`.
- Add `repository` and `homepage` once the GitHub repo exists.
- Bump `version` and add a `CHANGELOG.md` entry for every release.
