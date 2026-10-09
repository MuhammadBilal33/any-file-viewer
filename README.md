# any-file-viewer

Show almost any file inside a web page: PDF, Word, Excel, PowerPoint, CSV, images, video,
audio, text and code, HTML and ZIP. Works with any framework, or none. Ships a React wrapper.

- **Small to start.** Each file type is its own chunk. A page that only shows images never
  downloads pdf.js or SheetJS.
- **Safe by default.** File content never runs as code. HTML files open in a locked frame with
  no scripts and no network. Links inside documents keep only `http`, `https`, `mailto` and `#`.
  PDF fonts are never compiled with `eval`.
- **Fast on big files.** PDF pages draw only near the screen and are freed when you scroll away.
  Sheet and CSV rows load in pages. A size limit (50 MB by default) stops huge files early.
- **Ready for real apps.** Light and dark mode, every label can be translated, keyboard and
  screen-reader friendly, skeleton while loading, clear error cards with a Download button.

## Supported files

| Kind | Extensions | Needs |
|------|-----------|-------|
| PDF | pdf | `pdfjs-dist` 5 or 6 |
| Word | docx, docm, dotx, dotm | `docx-preview` |
| Spreadsheet | xlsx, xlsm, xlsb, xls, ods | `xlsx` (SheetJS) |
| PowerPoint | pptx, ppsx, potx, pptm | `jszip` |
| ZIP | zip | `jszip` |
| CSV / TSV | csv, tsv | nothing |
| Image | png, jpg, gif, webp, avif, bmp, ico, svg | nothing |
| Video / audio | mp4, webm, mov, mp3, wav, ogg, m4a, flac, … | nothing |
| Text / code | txt, log, md, json, xml, yaml, sql, js, ts, py, … | nothing |
| HTML | html, htm | nothing |

Anything else, such as old `.doc` and `.ppt` files or TIFF images, shows a card with the name,
size and a Download button. The type is found from the file name, then the MIME type, then the
first bytes of the file.

PowerPoint is a **simple preview**. It shows text, pictures, tables and plain colours in the right
places. Theme colours, charts, SmartArt and animations are not drawn.

## Install

```bash
npm install any-file-viewer
# Add only the formats you need:
npm install pdfjs-dist docx-preview jszip
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Install SheetJS from its own CDN, as shown. The `xlsx` package on the npm registry is an old
version with known security problems.

## Use it without a framework

```js
import { createFileViewer } from "any-file-viewer";
import "any-file-viewer/styles.css";

const viewer = createFileViewer(document.getElementById("preview"), {
  pdf: { workerSrc: "/pdfjs/pdf.worker.min.mjs" },
  onError: (error) => console.warn(error.code, error.message),
});

await viewer.open({ url: "/files/report.pdf" });
await viewer.open({ file: inputElement.files[0] });
await viewer.open({ data: arrayBuffer, name: "export.xlsx" });

viewer.destroy();
```

Give the container a height. The viewer fills it and scrolls inside it.

## Use it with React

```tsx
import { useMemo } from "react";
import { FileViewer } from "any-file-viewer/react";
import "any-file-viewer/styles.css";

export function Preview({ url, name }: { url: string; name: string }) {
  const source = useMemo(() => ({ url, name }), [url, name]);
  return (
    <FileViewer
      source={source}
      options={{ pdf: { workerSrc: "/pdfjs/pdf.worker.min.mjs" } }}
      style={{ height: "80vh" }}
    />
  );
}
```

Keep `source` stable with `useMemo`. A new object opens the file again. Options are read once
when the viewer mounts; change the `key` prop to apply new ones.

## The PDF worker

pdf.js does its heavy work in a Web Worker. Serve `pdf.worker.min.mjs` from **your own site**
and pass its URL as `pdf.workerSrc`. A worker loaded from a CDN is often blocked inside iframes.

```js
// Copy at build time, for example in next.config.js:
fs.copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdfjs/pdf.worker.min.mjs");
```

Keep the worker version the same as the installed `pdfjs-dist`.

## Options

| Option | Default | Meaning |
|--------|---------|---------|
| `theme` | `"system"` | `"light"`, `"dark"` or follow the device. |
| `maxBytes` | 50 MB | Largest file that is downloaded and read. Video and audio from a URL stream and are not limited. |
| `toolbar` | `true` | Show the header with the name, controls and Download. |
| `download` | `true` | `false` hides Download. A function replaces what it does. |
| `fetchInit` | none | Passed to `fetch` for URL sources, for example `{ credentials: "include" }` or auth headers. |
| `pdf.workerSrc` | none | URL of the pdf.js worker. Required for PDFs. |
| `pdf.textLayer` | `true` | Let people select and copy PDF text. |
| `pdf.cMapUrl` / `pdf.standardFontDataUrl` | none | pdf.js font data, for some Asian-language PDFs. |
| `tablePageSize` | 500 | Rows added per "Show more rows" click. |
| `textMaxChars` | 2,000,000 | Characters shown for text files before the rest is cut. |
| `labels` | English | Replace any visible text. See `defaultLabels`. |
| `renderers` | built in | Replace or add the renderer for a kind. |
| `onLoad`, `onError`, `onProgress` | none | Called when a file is shown, fails, or downloads. |

When `fetchInit` has headers, images and video are downloaded with those headers first, because
`<img>` and `<video>` cannot send headers. Without headers they stream straight from the URL.

## Errors

`onError` gets a `FileViewerError` with a stable `code`:

| Code | When |
|------|------|
| `too_large` | The file is bigger than `maxBytes`. |
| `fetch_failed` | The URL could not be downloaded. |
| `password_protected` | The PDF, Word, PowerPoint or Excel file is encrypted. |
| `missing_dependency` | The package for this format is not installed. |
| `config` | Setup is wrong, for example no `pdf.workerSrc`. |
| `unsupported_media` | The browser cannot decode this image or video. |
| `render_failed` | The file is damaged or not what its name says. |

## Theming

All classes start with `fv-`. Override the colour tokens on `.fv-root`:

```css
.fv-root {
  --fv-accent: #0f766e;
  --fv-radius: 4px;
  --fv-font: "Inter", system-ui, sans-serif;
}
```

## Custom renderers

```js
createFileViewer(element, {
  renderers: {
    unknown: async () => ({
      async render(ctx) {
        ctx.root.textContent = `Cannot show ${ctx.file.name}.`;
      },
    }),
  },
});
```

A renderer gets the file, a `root` element to fill, the header `toolbar`, `getBytes()`,
`getObjectUrl()`, `download()`, an abort `signal` and `fail()`. It may return a cleanup function.

## Helpers

`detectFileKind`, `sniffFileKind`, `extensionOf`, `formatBytes` and `loadBytes` are exported for
use on their own.

## Develop

```bash
npm install
npm run build   # TypeScript to dist/, plus styles.css
npm test        # build, then the node --test suites in tests/
```

The suites cover the pure parts: type detection, the CSV parser, byte loading with a local HTTP
server, size and page maths. The renderers need a real browser, so use the test page.

## Test page

```bash
npm run demo    # build, make sample files, serve on http://127.0.0.1:3200/
```

Pick or drop any file of your own, paste a link, or click a sample: PDF, Word, PowerPoint, CSV,
Excel, JSON, Markdown, HTML, SVG and ZIP. The samples are generated into `demo/samples/` and include
traps that must stay harmless: a script in the HTML and the SVG, a remote image, a
`javascript:` link in the Word file, and a hidden Excel sheet. The side panel changes the theme
and the size limit, and the event log shows each load time and every error code.

`/?open=/demo/samples/report.xlsx` opens a file straight away. Another port: `PORT=3201 npm run demo` (bash) or `$env:PORT=3201; npm run demo` (PowerShell).
The page loads the format libraries from this folder's `node_modules` through an import map, so
it needs no bundler. `demo/` is not part of the published package.

## License

MIT © 2026 Muhammad Bilal
