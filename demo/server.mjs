// Local test page for any-file-viewer. Plain Node, no extra packages: `npm run demo`.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { makeSamples } from "./make-samples.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT) || 3200;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
};

await makeSamples(join(root, "demo", "samples"));

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/demo/index.html" : url.pathname);
  const file = normalize(join(root, pathname));
  // Never serve anything outside the package folder.
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": statSync(file).size,
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is busy (the test page may already be running). Open http://127.0.0.1:${port}/ or use another port:\n` +
        "  PowerShell: $env:PORT=3201; npm run demo\n" +
        "  bash:       PORT=3201 npm run demo",
    );
    process.exit(1);
  }
  throw err;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`File viewer test page: http://127.0.0.1:${port}/`);
  console.log("Press Ctrl+C to stop.");
});
