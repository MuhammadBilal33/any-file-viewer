import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fillTemplate, formatBytes } from "../dist/index.js";
import { resolveOptions, DEFAULT_MAX_BYTES, messageFor } from "../dist/core/options.js";
import { FileViewerError, importPeer, isAbortError, toFileViewerError } from "../dist/core/errors.js";
import { guessDelimiter, parseDelimited } from "../dist/utils/csv.js";
import { columnLabel, decodeText, isSafeHref } from "../dist/utils/format.js";
import { canvasOutputScale, pageIndexAt, parsePageInput } from "../dist/utils/page-math.js";
import { lockedHtmlDocument, prettyJson } from "../dist/utils/text.js";
import { dirOf, relsPathFor, resolveZipPath } from "../dist/utils/zip-path.js";
import { canZoom, fitScale, stepZoom, ZOOM_STEPS } from "../dist/utils/zoom.js";

describe("parseDelimited", () => {
  it("parses plain rows", () => {
    assert.deepEqual(parseDelimited("a,b,c\n1,2,3").rows, [
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("handles quotes, doubled quotes, separators and new lines inside quotes", () => {
    const { rows } = parseDelimited('name,note\n"Smith, J","He said ""hi""\nthen left"\n');
    assert.deepEqual(rows, [
      ["name", "note"],
      ["Smith, J", 'He said "hi"\nthen left'],
    ]);
  });
  it("handles CRLF, CR and a missing last new line", () => {
    assert.deepEqual(parseDelimited("a,b\r\n1,2\r3,4").rows, [
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });
  it("keeps empty fields and empty lines", () => {
    assert.deepEqual(parseDelimited("a,,c\n\n,x,").rows, [["a", "", "c"], [""], ["", "x", ""]]);
  });
  it("returns no rows for empty text", () => {
    assert.deepEqual(parseDelimited(""), { rows: [], truncated: false });
  });
  it("keeps unicode and emoji intact", () => {
    assert.deepEqual(parseDelimited("名前,😀\nŻółw,ok").rows, [
      ["名前", "😀"],
      ["Żółw", "ok"],
    ]);
  });
  it("stops at maxRows and says it was cut", () => {
    const result = parseDelimited("1\n2\n3\n4", ",", 2);
    assert.deepEqual(result.rows, [["1"], ["2"]]);
    assert.equal(result.truncated, true);
    assert.equal(parseDelimited("1\n2\n", ",", 2).truncated, false);
  });
  it("parses 10,000 rows quickly", () => {
    const text = Array.from({ length: 10_000 }, (_, i) => `${i},"name ${i}",${i * 2}`).join("\n");
    const started = performance.now();
    const { rows } = parseDelimited(text);
    assert.equal(rows.length, 10_000);
    assert.deepEqual(rows[9_999], ["9999", "name 9999", "19998"]);
    assert.ok(performance.now() - started < 500);
  });
  it("supports other separators", () => {
    assert.deepEqual(parseDelimited("a\tb\n1\t2", "\t").rows, [
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("guessDelimiter", () => {
  it("picks the most consistent separator", () => {
    assert.equal(guessDelimiter("a;b;c\n1;2;3"), ";");
    assert.equal(guessDelimiter("a\tb\n1\t2"), "\t");
    assert.equal(guessDelimiter("a|b\n1|2"), "|");
    assert.equal(guessDelimiter("a,b\n1,2"), ",");
  });
  it("ignores separators inside quotes", () => {
    assert.equal(guessDelimiter('"a;b";c\n"x;y";z'.replace(/;c/g, ",c").replace(/;z/g, ",z")), ",");
  });
  it("defaults to comma for empty or single-column text", () => {
    assert.equal(guessDelimiter(""), ",");
    assert.equal(guessDelimiter("one\ntwo"), ",");
  });
});

describe("formatBytes", () => {
  it("formats each unit", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(1023), "1023 B");
    assert.equal(formatBytes(1536), "1.5 KB");
    assert.equal(formatBytes(10 * 1024 * 1024), "10 MB");
    assert.equal(formatBytes(5 * 1024 ** 4), "5 TB");
  });
  it("returns empty for missing or invalid sizes", () => {
    assert.equal(formatBytes(undefined), "");
    assert.equal(formatBytes(null), "");
    assert.equal(formatBytes(-1), "");
    assert.equal(formatBytes(Number.NaN), "");
  });
});

describe("columnLabel", () => {
  it("matches spreadsheet column names", () => {
    assert.equal(columnLabel(0), "A");
    assert.equal(columnLabel(25), "Z");
    assert.equal(columnLabel(26), "AA");
    assert.equal(columnLabel(701), "ZZ");
    assert.equal(columnLabel(702), "AAA");
    assert.equal(columnLabel(16383), "XFD");
  });
  it("returns empty for bad input", () => {
    assert.equal(columnLabel(-1), "");
    assert.equal(columnLabel(Number.NaN), "");
  });
});

describe("decodeText", () => {
  it("drops a UTF-8 BOM and decodes UTF-16", () => {
    assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]).buffer), "hi");
    assert.equal(decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]).buffer), "hi");
    assert.equal(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69]).buffer), "hi");
    assert.equal(decodeText(new TextEncoder().encode("ñ✓").buffer), "ñ✓");
    assert.equal(decodeText(new ArrayBuffer(0)), "");
  });
});

describe("isSafeHref", () => {
  it("keeps web, mail and in-page links", () => {
    for (const href of ["https://a.test", "HTTP://a.test", "mailto:x@y.test", "#bookmark"]) assert.equal(isSafeHref(href), true, href);
  });
  it("drops script, data and file links", () => {
    for (const href of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,x", "file:///etc/passwd", "vbscript:x", "", null, undefined]) {
      assert.equal(isSafeHref(href), false, String(href));
    }
  });
});

describe("zip paths", () => {
  it("resolves relationship targets", () => {
    assert.equal(resolveZipPath("ppt/slides/", "../media/image1.png"), "ppt/media/image1.png");
    assert.equal(resolveZipPath("ppt/", "slides/slide1.xml"), "ppt/slides/slide1.xml");
    assert.equal(resolveZipPath("ppt/slides/", "/ppt/media/a.png"), "ppt/media/a.png");
    assert.equal(resolveZipPath("ppt/slides", "./x.xml"), "ppt/slides/x.xml");
    assert.equal(resolveZipPath("", "../../a.xml"), "a.xml");
  });
  it("builds folders and rels paths", () => {
    assert.equal(dirOf("ppt/slides/slide1.xml"), "ppt/slides/");
    assert.equal(dirOf("root.xml"), "");
    assert.equal(relsPathFor("ppt/slides/slide1.xml"), "ppt/slides/_rels/slide1.xml.rels");
    assert.equal(relsPathFor("ppt/presentation.xml"), "ppt/_rels/presentation.xml.rels");
  });
});

describe("page math", () => {
  it("finds the page at a scroll position", () => {
    const tops = [0, 100, 200, 300];
    assert.equal(pageIndexAt(tops, -5), 0);
    assert.equal(pageIndexAt(tops, 0), 0);
    assert.equal(pageIndexAt(tops, 150), 1);
    assert.equal(pageIndexAt(tops, 300), 3);
    assert.equal(pageIndexAt(tops, 9999), 3);
    assert.equal(pageIndexAt([], 50), 0);
  });
  it("searches 10,000 pages fast", () => {
    const tops = Array.from({ length: 10_000 }, (_, i) => i * 1000);
    assert.equal(pageIndexAt(tops, 5_000_500), 5000);
  });
  it("lowers the canvas scale past the pixel limit", () => {
    assert.equal(canvasOutputScale(800, 1000, 2), 2);
    const scale = canvasOutputScale(4000, 5000, 3);
    assert.ok(4000 * 5000 * scale * scale <= 16_777_216 + 1);
    assert.equal(canvasOutputScale(100, 100, 0), 1);
    assert.equal(canvasOutputScale(0, 0, 2), 2);
  });
  it("reads typed page numbers", () => {
    assert.equal(parsePageInput(" 3 ", 10), 3);
    assert.equal(parsePageInput("99", 10), 10);
    assert.equal(parsePageInput("0", 10), 1);
    assert.equal(parsePageInput("abc", 10), null);
    assert.equal(parsePageInput("", 10), null);
    assert.equal(parsePageInput("2", 0), null);
  });
});

describe("zoom", () => {
  it("steps through presets", () => {
    assert.equal(stepZoom(1, 1), 1.1);
    assert.equal(stepZoom(1, -1), 0.9);
    assert.equal(stepZoom(1.05, 1), 1.1);
    assert.equal(stepZoom(1.05, -1), 1);
  });
  it("stops at both ends", () => {
    const max = ZOOM_STEPS[ZOOM_STEPS.length - 1];
    assert.equal(stepZoom(max, 1), max);
    assert.equal(stepZoom(ZOOM_STEPS[0], -1), ZOOM_STEPS[0]);
    assert.equal(canZoom(max, 1), false);
    assert.equal(canZoom(ZOOM_STEPS[0], -1), false);
    assert.equal(canZoom(1, 1), true);
  });
  it("fits wide content and never enlarges", () => {
    assert.equal(fitScale(400, 800), 0.5);
    assert.equal(fitScale(1600, 800), 1);
    assert.equal(fitScale(0, 800), 1);
    assert.equal(fitScale(400, 0), 1);
  });
});

describe("text helpers", () => {
  it("pretty-prints valid JSON and leaves invalid JSON alone", () => {
    assert.equal(prettyJson('{"a":[1,2]}'), '{\n  "a": [\n    1,\n    2\n  ]\n}');
    assert.equal(prettyJson("{not json"), "{not json");
    assert.equal(prettyJson(""), "");
  });
  it("puts a no-network CSP in front of HTML", () => {
    const doc = lockedHtmlDocument("<html><head><script>x()</script></head></html>");
    assert.ok(doc.startsWith('<meta http-equiv="Content-Security-Policy"'));
    assert.match(doc, /default-src 'none'/);
    assert.ok(doc.endsWith("</html>"));
  });
  it("fills templates and leaves unknown keys", () => {
    assert.equal(fillTemplate("{current} / {total}", { current: 2, total: 9 }), "2 / 9");
    assert.equal(fillTemplate("Hi {who}", {}), "Hi {who}");
    assert.equal(fillTemplate("{constructor}", {}), "{constructor}");
  });
});

describe("options", () => {
  it("uses safe defaults", () => {
    const options = resolveOptions();
    assert.equal(options.maxBytes, DEFAULT_MAX_BYTES);
    assert.equal(options.theme, "system");
    assert.equal(options.toolbar, true);
    assert.equal(options.download, true);
    assert.equal(options.pdf.textLayer, true);
    assert.equal(options.tablePageSize, 500);
    assert.equal(options.labels.download, "Download");
  });
  it("merges overrides and rejects bad numbers", () => {
    const options = resolveOptions({ maxBytes: -5, tablePageSize: 0, labels: { download: "Télécharger" }, pdf: { textLayer: false } });
    assert.equal(options.maxBytes, DEFAULT_MAX_BYTES);
    assert.equal(options.tablePageSize, 500);
    assert.equal(options.labels.download, "Télécharger");
    assert.equal(options.labels.zoomIn, "Zoom in");
    assert.equal(options.pdf.textLayer, false);
  });
  it("rounds the size limit down to whole bytes", () => {
    assert.equal(resolveOptions({ maxBytes: 0.1 * 1024 * 1024 }).maxBytes, 104857);
    assert.equal(resolveOptions({ maxBytes: 0.5 }).maxBytes, DEFAULT_MAX_BYTES);
  });
  it("maps each error to a plain message", () => {
    const { labels } = resolveOptions();
    assert.equal(messageFor(new FileViewerError("too_large", "x"), labels), labels.tooLarge);
    assert.equal(messageFor(new FileViewerError("password_protected", "x"), labels), labels.passwordProtected);
    assert.equal(messageFor(new FileViewerError("config", "x"), labels), labels.renderFailed);
  });
});

describe("errors", () => {
  it("wraps unknown errors and spots aborts", () => {
    assert.equal(toFileViewerError(new Error("boom")).code, "render_failed");
    assert.equal(toFileViewerError("text").message, "text");
    const abort = new DOMException("stop", "AbortError");
    assert.equal(isAbortError(abort), true);
    assert.equal(toFileViewerError(abort).code, "aborted");
    assert.equal(isAbortError(new Error("x")), false);
  });
  it("turns a missing peer package into a clear error", async () => {
    await assert.rejects(
      importPeer(() => import("this-package-does-not-exist-xyz"), "this-package-does-not-exist-xyz"),
      (err) => err instanceof FileViewerError && err.code === "missing_dependency" && err.message.includes("this-package-does-not-exist-xyz"),
    );
  });
});
