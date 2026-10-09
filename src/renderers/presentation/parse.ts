import type JSZip from "jszip";

import { yieldToBrowser } from "../../utils/dom.js";
import { dirOf, relsPathFor, resolveZipPath } from "../../utils/zip-path.js";
import type { PresentationModel, SlideModel, SlideShape, TextParagraph, TextRun, TextShape } from "./model.js";

const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DEFAULT_SLIDE = { width: 12_192_000, height: 6_858_000 };
const MAX_SLIDES = 1000;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Maps a group's child coordinates onto the slide. */
interface Transform {
  offX: number;
  offY: number;
  chOffX: number;
  chOffY: number;
  scaleX: number;
  scaleY: number;
}

const IDENTITY: Transform = { offX: 0, offY: 0, chOffX: 0, chOffY: 0, scaleX: 1, scaleY: 1 };

interface PlaceholderInfo {
  box?: Box;
  sizePt?: number;
}

interface LayoutInfo {
  placeholders: Map<string, PlaceholderInfo>;
  background?: string;
  parent?: LayoutInfo;
}

// Namespace prefixes differ between producers, so match on the local name only.
function child(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null;
  for (const c of Array.from(el.children)) if (c.localName === name) return c;
  return null;
}

function path(el: Element | null | undefined, ...names: string[]): Element | null {
  let current: Element | null | undefined = el;
  for (const name of names) current = child(current, name);
  return current ?? null;
}

function childrenNamed(el: Element | null | undefined, name: string): Element[] {
  if (!el) return [];
  return Array.from(el.children).filter((c) => c.localName === name);
}

function num(el: Element | null, attr: string, fallback = 0): number {
  const value = Number(el?.getAttribute(attr));
  return Number.isFinite(value) ? value : fallback;
}

/** Only plain hex colours are read. Theme colours would need the theme part, so they fall back to defaults. */
function solidColor(el: Element | null): string | undefined {
  const value = path(el, "solidFill", "srgbClr")?.getAttribute("val");
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : undefined;
}

function readBox(xfrm: Element | null, transform: Transform): Box | undefined {
  const off = child(xfrm, "off");
  const ext = child(xfrm, "ext");
  if (!off || !ext) return undefined;
  return {
    x: transform.offX + (num(off, "x") - transform.chOffX) * transform.scaleX,
    y: transform.offY + (num(off, "y") - transform.chOffY) * transform.scaleY,
    width: num(ext, "cx") * transform.scaleX,
    height: num(ext, "cy") * transform.scaleY,
    rotation: num(xfrm, "rot") / 60000,
  };
}

function placeholderKeys(ph: Element | null): string[] {
  if (!ph) return [];
  const keys: string[] = [];
  const idx = ph.getAttribute("idx");
  const type = ph.getAttribute("type") ?? "body";
  if (idx) keys.push(`idx:${idx}`);
  keys.push(`type:${type}`);
  // A centred title inherits from the title box on the master.
  if (type === "ctrTitle") keys.push("type:title");
  if (type === "subTitle") keys.push("type:body");
  return keys;
}

function lookupPlaceholder(layout: LayoutInfo | undefined, keys: string[]): PlaceholderInfo {
  const found: PlaceholderInfo = {};
  for (let level = layout; level; level = level.parent) {
    for (const key of keys) {
      const info = level.placeholders.get(key);
      if (!info) continue;
      found.box ??= info.box;
      found.sizePt ??= info.sizePt;
    }
    if (found.box && found.sizePt) break;
  }
  return found;
}

function defaultSizeFor(ph: Element | null): number {
  const type = ph?.getAttribute("type");
  if (type === "ctrTitle") return 44;
  if (type === "title") return 32;
  return 18;
}

function parseParagraphs(txBody: Element | null): TextParagraph[] {
  const paragraphs: TextParagraph[] = [];
  for (const p of childrenNamed(txBody, "p")) {
    const pPr = child(p, "pPr");
    const algn = pPr?.getAttribute("algn");
    const runs: TextRun[] = [];
    for (const node of Array.from(p.children)) {
      if (node.localName === "br") {
        runs.push({ text: "\n" });
        continue;
      }
      if (node.localName !== "r" && node.localName !== "fld") continue;
      const text = child(node, "t")?.textContent ?? "";
      if (!text) continue;
      const rPr = child(node, "rPr");
      const size = num(rPr, "sz", 0);
      runs.push({
        text,
        sizePt: size > 0 ? size / 100 : undefined,
        bold: rPr?.getAttribute("b") === "1",
        italic: rPr?.getAttribute("i") === "1",
        underline: !!rPr?.getAttribute("u") && rPr.getAttribute("u") !== "none",
        color: solidColor(rPr),
      });
    }
    const endSize = num(child(p, "endParaRPr"), "sz", 0);
    paragraphs.push({
      align: algn === "ctr" ? "center" : algn === "r" ? "right" : algn === "just" ? "justify" : "left",
      level: num(pPr, "lvl", 0),
      bullet: child(pPr, "buChar")?.getAttribute("char") ?? undefined,
      runs,
      endSizePt: endSize > 0 ? endSize / 100 : undefined,
    });
  }
  return paragraphs;
}

function firstRunSize(txBody: Element | null): number | undefined {
  const size = num(path(txBody, "lstStyle", "lvl1pPr", "defRPr"), "sz", 0);
  return size > 0 ? size / 100 : undefined;
}

class PptxReader {
  private readonly xmlCache = new Map<string, Promise<Document | null>>();
  private readonly layoutCache = new Map<string, Promise<LayoutInfo>>();
  private readonly parser = new DOMParser();

  constructor(private readonly zip: JSZip) {}

  xml(filePath: string): Promise<Document | null> {
    let cached = this.xmlCache.get(filePath);
    if (!cached) {
      cached = (async () => {
        const text = await this.zip.file(filePath)?.async("string");
        if (text == null) return null;
        const doc = this.parser.parseFromString(text, "application/xml");
        return doc.getElementsByTagName("parsererror").length > 0 ? null : doc;
      })();
      this.xmlCache.set(filePath, cached);
    }
    return cached;
  }

  /** Relationship id -> { type, resolved zip path } for one part. */
  async rels(partPath: string): Promise<Map<string, { type: string; target: string }>> {
    const doc = await this.xml(relsPathFor(partPath));
    const map = new Map<string, { type: string; target: string }>();
    if (!doc) return map;
    for (const rel of Array.from(doc.getElementsByTagName("*"))) {
      if (rel.localName !== "Relationship" || rel.getAttribute("TargetMode") === "External") continue;
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      if (id && target) map.set(id, { type: rel.getAttribute("Type") ?? "", target: resolveZipPath(dirOf(partPath), target) });
    }
    return map;
  }

  private async relatedPart(partPath: string, typeSuffix: string): Promise<string | undefined> {
    for (const rel of (await this.rels(partPath)).values()) if (rel.type.endsWith(typeSuffix)) return rel.target;
    return undefined;
  }

  /** Placeholder boxes and background of a layout, chained to its master. */
  layout(partPath: string, depth = 0): Promise<LayoutInfo> {
    let cached = this.layoutCache.get(partPath);
    if (!cached) {
      cached = (async () => {
        const doc = await this.xml(partPath);
        const info: LayoutInfo = { placeholders: new Map() };
        if (!doc) return info;
        const cSld = child(doc.documentElement, "cSld");
        info.background = solidColor(path(cSld, "bg", "bgPr"));
        for (const sp of childrenNamed(child(cSld, "spTree"), "sp")) {
          const ph = path(sp, "nvSpPr", "nvPr", "ph");
          const placeholder: PlaceholderInfo = {
            box: readBox(path(sp, "spPr", "xfrm"), IDENTITY),
            sizePt: firstRunSize(child(sp, "txBody")),
          };
          for (const key of placeholderKeys(ph)) if (!info.placeholders.has(key)) info.placeholders.set(key, placeholder);
        }
        if (depth < 1) {
          const master = await this.relatedPart(partPath, "/slideMaster");
          if (master) info.parent = await this.layout(master, depth + 1);
        }
        return info;
      })();
      this.layoutCache.set(partPath, cached);
    }
    return cached;
  }

  async slide(slidePath: string, number: number): Promise<SlideModel> {
    const doc = await this.xml(slidePath);
    const layoutPath = await this.relatedPart(slidePath, "/slideLayout");
    const layout = layoutPath ? await this.layout(layoutPath) : undefined;
    const rels = await this.rels(slidePath);
    const cSld = child(doc?.documentElement, "cSld");
    const shapes: SlideShape[] = [];
    this.walk(child(cSld, "spTree"), IDENTITY, layout, rels, shapes);
    const background = solidColor(path(cSld, "bg", "bgPr")) ?? layout?.background ?? layout?.parent?.background ?? "#ffffff";
    return { number, background, shapes };
  }

  private walk(
    tree: Element | null,
    transform: Transform,
    layout: LayoutInfo | undefined,
    rels: Map<string, { type: string; target: string }>,
    out: SlideShape[],
  ): void {
    if (!tree) return;
    for (const node of Array.from(tree.children)) {
      switch (node.localName) {
        case "sp": {
          const shape = this.textShape(node, transform, layout);
          if (shape) out.push(shape);
          break;
        }
        case "pic": {
          const box = readBox(path(node, "spPr", "xfrm"), transform);
          const blip = path(node, "blipFill", "blip");
          const id = blip?.getAttributeNS(REL_NS, "embed") || blip?.getAttribute("r:embed");
          const target = id ? rels.get(id)?.target : undefined;
          if (box && target) out.push({ type: "image", mediaPath: target, ...box });
          break;
        }
        case "graphicFrame": {
          const box = readBox(child(node, "xfrm"), transform);
          const table = path(node, "graphic", "graphicData", "tbl");
          if (box && table) {
            const rows = childrenNamed(table, "tr").map((tr) =>
              childrenNamed(tr, "tc").map((tc) =>
                childrenNamed(child(tc, "txBody"), "p")
                  .map((p) => p.textContent ?? "")
                  .join("\n"),
              ),
            );
            out.push({ type: "table", rows, ...box });
          }
          break;
        }
        case "grpSp": {
          const xfrm = path(node, "grpSpPr", "xfrm");
          const off = child(xfrm, "off");
          const ext = child(xfrm, "ext");
          const chOff = child(xfrm, "chOff");
          const chExt = child(xfrm, "chExt");
          const chWidth = num(chExt, "cx", 0);
          const chHeight = num(chExt, "cy", 0);
          const inner: Transform =
            off && ext && chOff && chWidth > 0 && chHeight > 0
              ? {
                  offX: transform.offX + (num(off, "x") - transform.chOffX) * transform.scaleX,
                  offY: transform.offY + (num(off, "y") - transform.chOffY) * transform.scaleY,
                  chOffX: num(chOff, "x"),
                  chOffY: num(chOff, "y"),
                  scaleX: transform.scaleX * (num(ext, "cx") / chWidth),
                  scaleY: transform.scaleY * (num(ext, "cy") / chHeight),
                }
              : transform;
          this.walk(node, inner, layout, rels, out);
          break;
        }
        default:
          break;
      }
    }
  }

  private textShape(sp: Element, transform: Transform, layout: LayoutInfo | undefined): TextShape | null {
    const ph = path(sp, "nvSpPr", "nvPr", "ph");
    const inherited = ph ? lookupPlaceholder(layout, placeholderKeys(ph)) : {};
    const box = readBox(path(sp, "spPr", "xfrm"), transform) ?? inherited.box;
    if (!box) return null;
    const txBody = child(sp, "txBody");
    const paragraphs = parseParagraphs(txBody);
    const hasText = paragraphs.some((p) => p.runs.some((r) => r.text.trim().length > 0));
    const fill = solidColor(child(sp, "spPr"));
    if (!hasText && !fill) return null;
    const anchor = child(txBody, "bodyPr")?.getAttribute("anchor");
    return {
      type: "text",
      ...box,
      fill,
      defaultSizePt: firstRunSize(txBody) ?? inherited.sizePt ?? defaultSizeFor(ph),
      verticalAlign: anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top",
      paragraphs: hasText ? paragraphs : [],
    };
  }
}

/** Reads slide order, slide size and every slide's shapes. Gives the browser a frame every few slides. */
export async function parsePresentation(zip: JSZip, signal: AbortSignal): Promise<PresentationModel> {
  const reader = new PptxReader(zip);
  const presentationPath = "ppt/presentation.xml";
  const doc = await reader.xml(presentationPath);
  if (!doc) throw new Error("This file has no ppt/presentation.xml part.");

  const size = child(doc.documentElement, "sldSz");
  const width = num(size, "cx", DEFAULT_SLIDE.width) || DEFAULT_SLIDE.width;
  const height = num(size, "cy", DEFAULT_SLIDE.height) || DEFAULT_SLIDE.height;

  const rels = await reader.rels(presentationPath);
  const slidePaths: string[] = [];
  for (const sldId of childrenNamed(child(doc.documentElement, "sldIdLst"), "sldId")) {
    const id = sldId.getAttributeNS(REL_NS, "id") || sldId.getAttribute("r:id");
    const target = id ? rels.get(id)?.target : undefined;
    if (target) slidePaths.push(target);
    if (slidePaths.length >= MAX_SLIDES) break;
  }

  const slides: SlideModel[] = [];
  for (let i = 0; i < slidePaths.length; i += 1) {
    if (signal.aborted) break;
    slides.push(await reader.slide(slidePaths[i]!, i + 1));
    if (i % 10 === 9) await yieldToBrowser();
  }
  return { width, height, slides };
}
