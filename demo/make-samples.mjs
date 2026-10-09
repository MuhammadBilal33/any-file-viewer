// Writes small test files into demo/samples so every viewer can be tried without hunting for files.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import * as XLSX from "xlsx";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

export async function makeSamples(dir) {
  mkdirSync(dir, { recursive: true });

  const csvRows = ["id,name,city,amount,note"];
  for (let i = 1; i <= 5000; i += 1) {
    csvRows.push(`${i},"Customer ${i}",${["Dubai", "Lahore", "Kraków", "東京"][i % 4]},${(i * 3.75).toFixed(2)},"says ""hi"", then leaves"`);
  }
  writeFileSync(join(dir, "customers.csv"), csvRows.join("\r\n"));

  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({ name: "demo", nested: { list: [1, 2, 3], unicode: "Żółw ✓ 😀" }, enabled: true }),
  );
  writeFileSync(join(dir, "notes.md"), "# Notes\n\nThis Markdown is shown as plain text.\n\n- one\n- two\n");
  writeFileSync(
    join(dir, "page.html"),
    '<!doctype html><html><head><style>body{font-family:sans-serif;padding:24px}</style></head><body>' +
      "<h1>Locked HTML page</h1><p>The script below must NOT run, and the remote image must NOT load.</p>" +
      '<script>document.body.append("SCRIPT RAN - this is a bug")</script>' +
      '<img src="https://example.com/tracker.png" alt="remote image (should be blocked)"></body></html>',
  );
  writeFileSync(
    join(dir, "logo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" rx="16" fill="#2563eb"/>' +
      '<text x="120" y="70" font-size="28" text-anchor="middle" fill="#fff" font-family="sans-serif">SVG test</text>' +
      '<script>alert("svg script ran - bug")</script></svg>',
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Name", "Joined", "Amount"],
      ["Ali", new Date(2026, 0, 5), 12.5],
      ["Żółw", new Date(2026, 5, 1), 3],
    ]),
    "Summary",
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(Array.from({ length: 3000 }, (_, i) => [i + 1, `Row ${i + 1}`, i * 2])), "Big sheet");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["You should NOT see this tab"]]), "Hidden");
  workbook.Workbook = { Sheets: [{}, {}, { Hidden: 1 }] };
  writeFileSync(join(dir, "report.xlsx"), XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

  const zip = new JSZip();
  zip.file("readme.txt", "hello");
  zip.folder("images").file("a.txt", "inside a folder");
  writeFileSync(join(dir, "bundle.zip"), await zip.generateAsync({ type: "nodebuffer" }));

  writeFileSync(join(dir, "manual.pdf"), makePdf(3));
  writeFileSync(join(dir, "letter.docx"), await makeDocx());
  writeFileSync(join(dir, "deck.pptx"), await makePptx());
}

/** A real multi-page PDF with selectable Helvetica text. Byte offsets in the xref table are computed, so pdf.js reads it without repair. */
function makePdf(pages) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add("");
  const pagesId = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids = [];
  for (let i = 1; i <= pages; i += 1) {
    const text = `BT /F1 28 Tf 72 720 Td (Page ${i} of ${pages}) Tj /F1 14 Tf 0 -40 Td (Select this text to test the text layer.) Tj ET`;
    const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${pages} >>`;

  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

async function makeDocx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rLink1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com" TargetMode="External"/>' +
      '<Relationship Id="rLink2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>',
  );
  const para = (text, props = "") => `<w:p><w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const cell = (text) => `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>${para(text)}</w:tc>`;
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>';
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document ${W_NS}><w:body>` +
      para("Test letter", '<w:b/><w:sz w:val="48"/>') +
      para("This Word file was generated for the file viewer test page. Unicode: Żółw ✓ 東京.") +
      para("Bold and italic text.", "<w:b/><w:i/>") +
      `<w:tbl><w:tblPr>${borders}</w:tblPr><w:tr>${cell("Name")}${cell("City")}</w:tr><w:tr>${cell("Ali")}${cell("Dubai")}</w:tr></w:tbl>` +
      '<w:p><w:hyperlink r:id="rLink1"><w:r><w:t>Safe link (should open example.com)</w:t></w:r></w:hyperlink></w:p>' +
      '<w:p><w:hyperlink r:id="rLink2"><w:r><w:t>Unsafe javascript link (should NOT be clickable)</w:t></w:r></w:hyperlink></w:p>' +
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
      "</w:body></w:document>",
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

const P_NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

async function makePptx() {
  const zip = new JSZip();
  const rel = (id, type, target) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const rels = (...items) => `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.join("")}</Relationships>`;
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="svg" ContentType="image/svg+xml"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
  );
  zip.file("_rels/.rels", rels(rel("rId1", "officeDocument", "ppt/presentation.xml")));
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${P_NS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
  );
  zip.file("ppt/_rels/presentation.xml.rels", rels(rel("rId1", "slide", "slides/slide1.xml"), rel("rId2", "slide", "slides/slide2.xml")));

  const box = (x, y, w, h) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
  const text = (id, x, y, w, h, paragraphs, fill = "") =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="t${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${box(x, y, w, h)}${fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : ""}</p:spPr>` +
    `<p:txBody><a:bodyPr anchor="ctr"/>${paragraphs}</p:txBody></p:sp>`;
  const p = (t, sz, extra = "", algn = "l") => `<a:p><a:pPr algn="${algn}"/><a:r><a:rPr sz="${sz}" ${extra}/><a:t>${t}</a:t></a:r></a:p>`;

  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8"?><p:sld ${P_NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></p:bgPr></p:bg><p:spTree>` +
      text(2, 914400, 2286000, 10363200, 1371600, `<a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="5400" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Quarterly review</a:t></a:r></a:p>`) +
      text(3, 914400, 3886200, 10363200, 685800, `<a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="2400"><a:solidFill><a:srgbClr val="93C5FD"/></a:solidFill></a:rPr><a:t>Slide 1 · centred title on a dark background</a:t></a:r></a:p>`) +
      "</p:spTree></p:cSld></p:sld>",
  );
  zip.file(
    "ppt/slides/slide2.xml",
    `<?xml version="1.0" encoding="UTF-8"?><p:sld ${P_NS}><p:cSld><p:spTree>` +
      text(2, 457200, 304800, 11277600, 914400, p("Slide 2 · bullets, a group and a picture", 3600, 'b="1"')) +
      text(
        3,
        457200,
        1371600,
        5486400,
        3200400,
        ["First point", "Second point", "Third point with Żółw ✓"].map((t) => `<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:rPr sz="2400"/><a:t>${t}</a:t></a:r></a:p>`).join(""),
      ) +
      `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="10" name="group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="6400800" y="1371600"/><a:ext cx="2743200" cy="1371600"/><a:chOff x="0" y="0"/><a:chExt cx="5486400" cy="2743200"/></a:xfrm></p:grpSpPr>` +
      text(11, 0, 0, 5486400, 2743200, p("Inside a group (half size)", 3600, "", "ctr"), "FDE68A") +
      "</p:grpSp>" +
      `<p:pic><p:nvPicPr><p:cNvPr id="20" name="pic"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rImg"/></p:blipFill><p:spPr>${box(6400800, 3200400, 2743200, 1371600)}</p:spPr></p:pic>` +
      "</p:spTree></p:cSld></p:sld>",
  );
  zip.file("ppt/slides/_rels/slide2.xml.rels", rels(rel("rImg", "image", "../media/image1.svg")));
  zip.file(
    "ppt/media/image1.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#16a34a"/><text x="120" y="70" font-size="24" text-anchor="middle" fill="#fff" font-family="sans-serif">picture</text></svg>',
  );
  return zip.generateAsync({ type: "nodebuffer" });
}
