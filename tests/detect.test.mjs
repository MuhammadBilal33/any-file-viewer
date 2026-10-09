import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  detectFileKind,
  extensionOf,
  isOleContainer,
  kindFromExtension,
  kindFromMime,
  looksLikeText,
  nameFromUrl,
  sniffFileKind,
} from "../dist/index.js";

const bytes = (...values) => new Uint8Array(values);
const ascii = (text) => new TextEncoder().encode(text);
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
const ZIP_HEADER = bytes(0x50, 0x4b, 0x03, 0x04);
const OLE_HEADER = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

describe("extensionOf", () => {
  it("reads the extension in lower case", () => {
    assert.equal(extensionOf("Report.PDF"), "pdf");
    assert.equal(extensionOf("archive.tar.gz"), "gz");
  });
  it("ignores query strings, fragments and folders", () => {
    assert.equal(extensionOf("https://x.test/files/a.b/report.docx?sig=1.2#page=3"), "docx");
    assert.equal(extensionOf("C:\\Users\\me\\sheet.xlsx"), "xlsx");
  });
  it("returns empty for no extension, dot files and empty input", () => {
    assert.equal(extensionOf("README"), "");
    assert.equal(extensionOf(".env"), "");
    assert.equal(extensionOf(""), "");
    assert.equal(extensionOf(undefined), "");
    assert.equal(extensionOf(null), "");
  });
  it("treats Dockerfile and Makefile as their own type", () => {
    assert.equal(extensionOf("Dockerfile"), "dockerfile");
    assert.equal(extensionOf("src/Makefile"), "makefile");
  });
});

describe("nameFromUrl", () => {
  it("decodes the last path part", () => {
    assert.equal(nameFromUrl("https://x.test/a/My%20File%20%E2%9C%93.pdf?x=1"), "My File ✓.pdf");
  });
  it("keeps a badly encoded name as it is", () => {
    assert.equal(nameFromUrl("https://x.test/a/100%.pdf"), "100%.pdf");
  });
  it("returns empty for data and blob URLs", () => {
    assert.equal(nameFromUrl("data:text/plain,hello"), "");
    assert.equal(nameFromUrl("blob:https://x.test/uuid"), "");
    assert.equal(nameFromUrl(""), "");
  });
});

describe("kindFromExtension", () => {
  it("maps every major family", () => {
    const cases = {
      pdf: "pdf",
      docx: "word",
      xlsx: "spreadsheet",
      xls: "spreadsheet",
      ods: "spreadsheet",
      csv: "csv",
      tsv: "csv",
      pptx: "presentation",
      png: "image",
      svg: "image",
      mp4: "video",
      mp3: "audio",
      html: "html",
      zip: "archive",
      json: "text",
      md: "text",
      ts: "text",
    };
    for (const [ext, kind] of Object.entries(cases)) assert.equal(kindFromExtension(ext), kind, ext);
  });
  it("returns unknown for legacy binary Office files and unknown extensions", () => {
    assert.equal(kindFromExtension("doc"), "unknown");
    assert.equal(kindFromExtension("ppt"), "unknown");
    assert.equal(kindFromExtension("exe"), "unknown");
    assert.equal(kindFromExtension("tiff"), "unknown");
  });
  it("is not fooled by Object prototype names", () => {
    assert.equal(kindFromExtension("constructor"), "unknown");
    assert.equal(kindFromExtension("__proto__"), "unknown");
    assert.equal(kindFromExtension("toString"), "unknown");
  });
});

describe("kindFromMime", () => {
  it("handles parameters and case", () => {
    assert.equal(kindFromMime("Application/PDF; charset=binary"), "pdf");
    assert.equal(kindFromMime("text/csv;charset=utf-8"), "csv");
  });
  it("maps families by prefix", () => {
    assert.equal(kindFromMime("image/webp"), "image");
    assert.equal(kindFromMime("video/quicktime"), "video");
    assert.equal(kindFromMime("audio/mpeg"), "audio");
    assert.equal(kindFromMime("text/x-python"), "text");
    assert.equal(kindFromMime("application/vnd.api+json"), "text");
  });
  it("treats generic and undecodable types as unknown", () => {
    assert.equal(kindFromMime("application/octet-stream"), "unknown");
    assert.equal(kindFromMime(""), "unknown");
    assert.equal(kindFromMime(undefined), "unknown");
    assert.equal(kindFromMime("image/tiff"), "unknown");
    assert.equal(kindFromMime("image/heic"), "unknown");
  });
});

describe("detectFileKind", () => {
  it("prefers the extension over a misleading MIME type", () => {
    assert.equal(detectFileKind({ name: "a.docx", mimeType: "application/zip" }), "word");
    assert.equal(detectFileKind({ name: "a.csv", mimeType: "text/plain" }), "csv");
  });
  it("falls back to the MIME type when the name says nothing", () => {
    assert.equal(detectFileKind({ name: "download", mimeType: "application/pdf" }), "pdf");
  });
  it("returns unknown when nothing helps", () => {
    assert.equal(detectFileKind({}), "unknown");
    assert.equal(detectFileKind({ name: "blob", mimeType: "application/octet-stream" }), "unknown");
  });
});

describe("sniffFileKind", () => {
  it("finds PDF and images from magic bytes", () => {
    assert.equal(sniffFileKind(ascii("%PDF-1.7\n")), "pdf");
    assert.equal(sniffFileKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)), "image");
    assert.equal(sniffFileKind(bytes(0xff, 0xd8, 0xff, 0xe0)), "image");
    assert.equal(sniffFileKind(ascii("GIF89a")), "image");
    assert.equal(sniffFileKind(concat(ascii("RIFF"), bytes(0, 0, 0, 0), ascii("WEBP"))), "image");
  });
  it("finds media from magic bytes", () => {
    assert.equal(sniffFileKind(concat(ascii("RIFF"), bytes(0, 0, 0, 0), ascii("WAVE"))), "audio");
    assert.equal(sniffFileKind(concat(bytes(0, 0, 0, 0x18), ascii("ftypmp42"))), "video");
    assert.equal(sniffFileKind(ascii("ID3\u0004")), "audio");
  });
  it("tells Office ZIPs apart from plain ZIPs", () => {
    assert.equal(sniffFileKind(concat(ZIP_HEADER, ascii("....[Content_Types].xml....word/document.xml"))), "word");
    assert.equal(sniffFileKind(concat(ZIP_HEADER, ascii("....xl/workbook.xml"))), "spreadsheet");
    assert.equal(sniffFileKind(concat(ZIP_HEADER, ascii("....ppt/presentation.xml"))), "presentation");
    assert.equal(sniffFileKind(concat(ZIP_HEADER, ascii("....photos/cat.jpg"))), "archive");
  });
  it("reads legacy .xls but not legacy .doc", () => {
    const workbook = new TextEncoder().encode("Workbook").reduce((acc, b) => [...acc, b, 0], []);
    assert.equal(sniffFileKind(concat(OLE_HEADER, new Uint8Array(workbook))), "spreadsheet");
    assert.equal(sniffFileKind(concat(OLE_HEADER, ascii("WordDocument"))), "unknown");
  });
  it("calls readable bytes text and binary bytes unknown", () => {
    assert.equal(sniffFileKind(ascii('{"hello": "wörld ✓"}')), "text");
    assert.equal(sniffFileKind(bytes(0x00, 0x01, 0x02, 0x03, 0x04)), "unknown");
  });
  it("handles empty and tiny inputs", () => {
    assert.equal(sniffFileKind(new Uint8Array(0)), "text");
    assert.equal(sniffFileKind(bytes(0x25)), "text");
  });
});

describe("isOleContainer / looksLikeText", () => {
  it("spots the OLE2 header only at the start", () => {
    assert.equal(isOleContainer(OLE_HEADER), true);
    assert.equal(isOleContainer(concat(bytes(0), OLE_HEADER)), false);
    assert.equal(isOleContainer(new Uint8Array(0)), false);
  });
  it("allows tabs and new lines but not NUL bytes", () => {
    assert.equal(looksLikeText(ascii("a\tb\r\nc")), true);
    assert.equal(looksLikeText(bytes(0x61, 0x00, 0x62)), false);
  });
});
