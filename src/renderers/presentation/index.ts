import { isOleContainer } from "../../core/detect.js";
import { FileViewerError, importPeer } from "../../core/errors.js";
import { fillTemplate } from "../../core/labels.js";
import { h, yieldToBrowser } from "../../utils/dom.js";
import { EMU_PER_PX, type SlideModel, type SlideShape, type TextShape } from "./model.js";
import { parsePresentation } from "./parse.js";
import type { Renderer } from "../../core/types.js";

const MAX_SLIDE_WIDTH_PX = 1100;
const SIDE_GUTTER_PX = 32;
const PT_TO_PX = 96 / 72;

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function px(emu: number): string {
  return `${(emu / EMU_PER_PX).toFixed(2)}px`;
}

function placeShape(node: HTMLElement, shape: SlideShape): HTMLElement {
  node.style.left = px(shape.x);
  node.style.top = px(shape.y);
  node.style.width = px(shape.width);
  node.style.height = px(shape.height);
  if (shape.rotation) node.style.transform = `rotate(${shape.rotation}deg)`;
  return node;
}

function textNode(shape: TextShape): HTMLElement {
  const box = h("div", { className: `fv-slide-text fv-slide-text-${shape.verticalAlign}` });
  if (shape.fill) box.style.background = shape.fill;
  for (const paragraph of shape.paragraphs) {
    const p = h("p", { className: "fv-slide-paragraph" });
    p.style.textAlign = paragraph.align;
    if (paragraph.level > 0) p.style.paddingLeft = `${paragraph.level * 24}px`;
    const baseSize = paragraph.runs[0]?.sizePt ?? paragraph.endSizePt ?? shape.defaultSizePt;
    p.style.fontSize = `${(baseSize * PT_TO_PX).toFixed(1)}px`;
    if (paragraph.bullet) p.append(h("span", { className: "fv-slide-bullet", "aria-hidden": "true" }, [paragraph.bullet]));
    for (const run of paragraph.runs) {
      if (run.text === "\n") {
        p.append(h("br"));
        continue;
      }
      const span = h("span", {}, [run.text]);
      if (run.sizePt) span.style.fontSize = `${(run.sizePt * PT_TO_PX).toFixed(1)}px`;
      if (run.bold) span.style.fontWeight = "700";
      if (run.italic) span.style.fontStyle = "italic";
      if (run.underline) span.style.textDecoration = "underline";
      if (run.color) span.style.color = run.color;
      p.append(span);
    }
    if (paragraph.runs.length === 0) p.append(h("br"));
    box.append(p);
  }
  return placeShape(box, shape);
}

function slideNode(slide: SlideModel, labels: { slideLabel: string }): { figure: HTMLElement; canvas: HTMLElement } {
  const canvas = h("div", { className: "fv-slide-canvas" });
  canvas.style.background = slide.background;
  for (const shape of slide.shapes) {
    if (shape.type === "text") canvas.append(textNode(shape));
    else if (shape.type === "image") {
      const ext = shape.mediaPath.slice(shape.mediaPath.lastIndexOf(".") + 1).toLowerCase();
      if (!IMAGE_TYPES[ext]) continue;
      canvas.append(placeShape(h("img", { className: "fv-slide-image", alt: "", "data-media": shape.mediaPath, decoding: "async" }), shape));
    } else {
      const table = h("table", { className: "fv-slide-table" });
      for (const row of shape.rows) table.append(h("tr", {}, row.map((cell) => h("td", {}, [cell]))));
      canvas.append(placeShape(h("div", { className: "fv-slide-table-box" }, [table]), shape));
    }
  }
  const figure = h("figure", { className: "fv-slide", "aria-label": fillTemplate(labels.slideLabel, { number: slide.number }) }, [
    canvas,
    h("figcaption", { className: "fv-slide-number" }, [String(slide.number)]),
  ]);
  return { figure, canvas };
}

export const presentationRenderer: Renderer = {
  async render(ctx) {
    const { labels, scroller, signal } = ctx;
    const JSZip = (await importPeer(() => import("jszip"), "jszip")).default;
    const bytes = await ctx.getBytes();
    if (isOleContainer(new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength)))) {
      throw new FileViewerError("password_protected", "This PowerPoint file is encrypted or in the old .ppt format.");
    }
    const zip = await JSZip.loadAsync(bytes);
    const model = await parsePresentation(zip, signal);
    if (signal.aborted) return;

    const nativeWidth = model.width / EMU_PER_PX;
    const nativeHeight = model.height / EMU_PER_PX;
    const list = h("div", { className: "fv-slides" });
    ctx.root.append(h("p", { className: "fv-note fv-note-banner", role: "note" }, [labels.presentationNote]), list);

    const objectUrls: string[] = [];
    const figures: { figure: HTMLElement; canvas: HTMLElement }[] = [];
    let scale = 1;

    const sizeFigure = (entry: { figure: HTMLElement; canvas: HTMLElement }): void => {
      entry.canvas.style.transform = `scale(${scale})`;
      entry.figure.style.width = `${Math.floor(nativeWidth * scale)}px`;
      entry.figure.style.height = `${Math.floor(nativeHeight * scale)}px`;
    };
    const computeScale = (): number => Math.min(MAX_SLIDE_WIDTH_PX, Math.max(1, scroller.clientWidth - SIDE_GUTTER_PX)) / nativeWidth;

    const loadImages = async (canvas: HTMLElement): Promise<void> => {
      for (const img of Array.from(canvas.querySelectorAll<HTMLImageElement>("img[data-media]"))) {
        const mediaPath = img.dataset.media!;
        img.removeAttribute("data-media");
        const blob = await zip.file(mediaPath)?.async("blob");
        if (!blob || signal.aborted) continue;
        const ext = mediaPath.slice(mediaPath.lastIndexOf(".") + 1).toLowerCase();
        const url = URL.createObjectURL(new Blob([blob], { type: IMAGE_TYPES[ext] }));
        objectUrls.push(url);
        img.src = url;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const canvas = (entry.target as HTMLElement).querySelector<HTMLElement>(".fv-slide-canvas");
          if (canvas) void loadImages(canvas);
        }
      },
      { root: scroller, rootMargin: "100% 0px" },
    );

    scale = computeScale();
    for (let i = 0; i < model.slides.length && !signal.aborted; i += 1) {
      const entry = slideNode(model.slides[i]!, labels);
      entry.canvas.style.width = `${nativeWidth}px`;
      entry.canvas.style.height = `${nativeHeight}px`;
      sizeFigure(entry);
      figures.push(entry);
      list.append(entry.figure);
      observer.observe(entry.figure);
      if (i % 20 === 19) await yieldToBrowser();
    }

    let lastWidth = scroller.clientWidth;
    const resizeObserver = new ResizeObserver(() => {
      if (scroller.clientWidth === lastWidth) return;
      lastWidth = scroller.clientWidth;
      scale = computeScale();
      for (const entry of figures) sizeFigure(entry);
    });
    resizeObserver.observe(scroller);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  },
};
