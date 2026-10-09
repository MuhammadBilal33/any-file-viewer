import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import { FileViewerError, loadBytes } from "../dist/index.js";

const LIMIT = 1024;
const isCode = (code) => (err) => err instanceof FileViewerError && err.code === code;

let server;
let base;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200, { "content-type": "text/plain", "content-length": "5" });
      res.end("hello");
    } else if (req.url === "/big-header") {
      res.writeHead(200, { "content-length": String(LIMIT * 10) });
      res.end(Buffer.alloc(LIMIT * 10));
    } else if (req.url === "/big-chunked") {
      // No Content-Length: the limit must still hold while streaming.
      res.writeHead(200, { "transfer-encoding": "chunked" });
      for (let i = 0; i < 10; i += 1) res.write(Buffer.alloc(LIMIT / 2));
      res.end();
    } else if (req.url === "/slow") {
      res.writeHead(200);
      res.write("a");
      setTimeout(() => res.end("b"), 2000);
    } else if (req.url === "/auth") {
      res.writeHead(req.headers.authorization === "Bearer t" ? 200 : 401);
      res.end("secret");
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

describe("loadBytes", () => {
  it("returns an ArrayBuffer as given", async () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    assert.equal(await loadBytes({ data: buffer }, { maxBytes: LIMIT }), buffer);
  });

  it("copies only the bytes of a Uint8Array view", async () => {
    const whole = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const out = await loadBytes({ data: whole.subarray(2, 5) }, { maxBytes: LIMIT });
    assert.deepEqual([...new Uint8Array(out)], [1, 2, 3]);
  });

  it("reads a Blob", async () => {
    const out = await loadBytes({ file: new Blob(["héllo"]) }, { maxBytes: LIMIT });
    assert.equal(new TextDecoder().decode(out), "héllo");
  });

  it("refuses data and blobs over the limit before reading them", async () => {
    await assert.rejects(loadBytes({ data: new Uint8Array(LIMIT + 1) }, { maxBytes: LIMIT }), isCode("too_large"));
    await assert.rejects(loadBytes({ file: new Blob([new Uint8Array(LIMIT + 1)]) }, { maxBytes: LIMIT }), isCode("too_large"));
  });

  it("fetches a URL", async () => {
    const out = await loadBytes({ url: `${base}/ok` }, { maxBytes: LIMIT });
    assert.equal(new TextDecoder().decode(out), "hello");
  });

  it("reports progress", async () => {
    const seen = [];
    await loadBytes({ url: `${base}/ok` }, { maxBytes: LIMIT, onProgress: (loaded, total) => seen.push([loaded, total]) });
    assert.deepEqual(seen.at(-1), [5, 5]);
  });

  it("sends fetchInit headers", async () => {
    await assert.rejects(loadBytes({ url: `${base}/auth` }, { maxBytes: LIMIT }), isCode("fetch_failed"));
    const out = await loadBytes({ url: `${base}/auth` }, { maxBytes: LIMIT, fetchInit: { headers: { authorization: "Bearer t" } } });
    assert.equal(new TextDecoder().decode(out), "secret");
  });

  it("refuses a URL whose Content-Length is over the limit", async () => {
    await assert.rejects(loadBytes({ url: `${base}/big-header` }, { maxBytes: LIMIT }), isCode("too_large"));
  });

  it("stops a chunked download once it passes the limit", async () => {
    await assert.rejects(loadBytes({ url: `${base}/big-chunked` }, { maxBytes: LIMIT }), isCode("too_large"));
  });

  it("reports HTTP errors and network errors as fetch_failed", async () => {
    await assert.rejects(loadBytes({ url: `${base}/missing` }, { maxBytes: LIMIT }), isCode("fetch_failed"));
    await assert.rejects(loadBytes({ url: "http://127.0.0.1:1/nothing" }, { maxBytes: LIMIT }), isCode("fetch_failed"));
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    const pending = loadBytes({ url: `${base}/slow` }, { maxBytes: LIMIT, signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, (err) => err instanceof FileViewerError ? err.code === "aborted" : err.name === "AbortError");
  });

  it("does nothing once already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(loadBytes({ data: new Uint8Array(1) }, { maxBytes: LIMIT, signal: controller.signal }), isCode("aborted"));
  });

  it("complains when no source is given", async () => {
    await assert.rejects(loadBytes({}, { maxBytes: LIMIT }), isCode("fetch_failed"));
  });
});
