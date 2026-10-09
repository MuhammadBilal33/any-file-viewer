import type { PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";

import { FileViewerError, importPeer } from "../core/errors.js";
import { fillTemplate } from "../core/labels.js";
import { h, icons } from "../utils/dom.js";
import { canvasOutputScale, pageIndexAt, parsePageInput } from "../utils/page-math.js";
import { canZoom, stepZoom } from "../utils/zoom.js";
import type { Renderer } from "../core/types.js";

const PAGE_GAP_PX = 16;
const SIDE_GUTTER_PX = 32;
/** "Fit width" never blows a page up past this, so wide screens do not show giant text. */
const MAX_FIT_SCALE = 1.5;

interface PageSlot {
  wrapper: HTMLDivElement;
  width: number;
  height: number;
  renderedScale: number;
  /** Scale a render is already in flight for, so a second trigger does not start another. */
  pendingScale: number;
  task: RenderTask | null;
  textLayer: TextLayer | null;
}

function errorName(err: unknown): string {
  return err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
}

export const pdfRenderer: Renderer = {
  async render(ctx) {
    const { labels, toolbar, scroller } = ctx;
    const pdfOptions = ctx.options.pdf;
    const pdfjs = await importPeer(() => import("pdfjs-dist"), "pdfjs-dist");

    if (pdfOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = pdfOptions.workerSrc;
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      throw new FileViewerError(
        "config",
        "Set options.pdf.workerSrc to the URL of pdf.worker.min.mjs served from your own site. A CDN worker is blocked inside many iframes.",
      );
    }

    // pdf.js moves the buffer into its worker, so hand it a copy and keep ours for Download.
    const data = new Uint8Array((await ctx.getBytes()).slice(0));
    const loadingTask = pdfjs.getDocument({
      data,
      // Never compile fonts with eval: closes the font-injection hole (CVE-2024-4367).
      isEvalSupported: false,
      enableXfa: false,
      cMapUrl: pdfOptions.cMapUrl,
      cMapPacked: true,
      standardFontDataUrl: pdfOptions.standardFontDataUrl,
    });
    const onAbort = () => void loadingTask.destroy();
    ctx.signal.addEventListener("abort", onAbort, { once: true });

    let doc: PDFDocumentProxy;
    try {
      doc = await loadingTask.promise;
    } catch (err) {
      ctx.signal.removeEventListener("abort", onAbort);
      if (errorName(err) === "PasswordException") throw new FileViewerError("password_protected", "This PDF needs a password.", err);
      throw err;
    }

    const firstPage = await doc.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: 1 });
    const total = doc.numPages;

    const pagesBox = h("div", { className: "fv-pdf-pages" });
    ctx.root.append(pagesBox);

    const slots: PageSlot[] = [];
    for (let i = 0; i < total; i += 1) {
      const wrapper = h("div", {
        className: "fv-pdf-page",
        "data-page": i + 1,
        role: "img",
        "aria-label": fillTemplate(labels.pageLabel, { number: i + 1 }),
      });
      slots.push({ wrapper, width: firstViewport.width, height: firstViewport.height, renderedScale: 0, pendingScale: 0, task: null, textLayer: null });
      pagesBox.append(wrapper);
    }

    let zoom = 1;
    let scale = 1;
    const visible = new Set<number>();
    // Page tops change only on zoom, resize or a page of a different size, so read them once per change, not per scroll.
    let tops: number[] = [];
    let topsDirty = true;

    const fitScale = (): number => {
      const available = Math.max(1, scroller.clientWidth - SIDE_GUTTER_PX);
      return Math.min(MAX_FIT_SCALE, available / firstViewport.width);
    };

    const sizeSlot = (slot: PageSlot): void => {
      slot.wrapper.style.width = `${Math.floor(slot.width * scale)}px`;
      slot.wrapper.style.height = `${Math.floor(slot.height * scale)}px`;
      slot.wrapper.style.setProperty("--scale-factor", String(scale));
    };

    const release = (slot: PageSlot): void => {
      slot.task?.cancel();
      slot.task = null;
      slot.textLayer?.cancel();
      slot.textLayer = null;
      slot.renderedScale = 0;
      slot.pendingScale = 0;
      for (const canvas of Array.from(slot.wrapper.querySelectorAll("canvas"))) {
        // Shrinking first frees the GPU memory right away instead of at the next garbage collection.
        canvas.width = 0;
        canvas.height = 0;
      }
      slot.wrapper.replaceChildren();
    };

    const renderSlot = async (index: number): Promise<void> => {
      const slot = slots[index]!;
      if (slot.renderedScale === scale || slot.pendingScale === scale) return;
      const renderScale = scale;
      slot.pendingScale = renderScale;
      try {
        const page = index === 0 ? firstPage : await doc.getPage(index + 1);
        if (ctx.signal.aborted || !visible.has(index) || renderScale !== scale || slot.pendingScale !== renderScale) {
          if (slot.pendingScale === renderScale) slot.pendingScale = 0;
          return;
        }
        const base = page.getViewport({ scale: 1 });
        if (base.width !== slot.width || base.height !== slot.height) {
          slot.width = base.width;
          slot.height = base.height;
          sizeSlot(slot);
          topsDirty = true;
        }
        const viewport = page.getViewport({ scale: renderScale });
        const outputScale = canvasOutputScale(viewport.width, viewport.height, window.devicePixelRatio || 1);
        const canvas = h("canvas", { className: "fv-pdf-canvas" });
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);

        release(slot);
        slot.pendingScale = renderScale;
        slot.wrapper.append(canvas);
        slot.task = page.render({
          canvas,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        await slot.task.promise;
        slot.task = null;
        slot.pendingScale = 0;
        slot.renderedScale = renderScale;

        if (pdfOptions.textLayer !== false && !ctx.signal.aborted) {
          const layer = h("div", { className: "textLayer" });
          slot.wrapper.append(layer);
          slot.textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport });
          await slot.textLayer.render();
        }
      } catch (err) {
        slot.task = null;
        if (slot.pendingScale === renderScale) slot.pendingScale = 0;
        const name = errorName(err);
        if (name === "RenderingCancelledException" || name === "AbortException" || ctx.signal.aborted) return;
        console.warn(`[file-viewer] PDF page ${index + 1} failed to render`, err);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.page) - 1;
          if (entry.isIntersecting) {
            visible.add(index);
            void renderSlot(index);
          } else {
            visible.delete(index);
            release(slots[index]!);
          }
        }
      },
      // Draw one screen ahead and behind, so scrolling never shows blank pages.
      { root: scroller, rootMargin: "100% 0px" },
    );

    // Header: page box, previous / next, zoom.
    const previous = toolbar.addButton({ label: labels.previousPage, icon: icons.previous, onClick: () => goTo(currentPage - 1) });
    const pageInput = h("input", {
      className: "fv-page-input",
      type: "text",
      inputmode: "numeric",
      "aria-label": fillTemplate(labels.pageLabel, { number: "" }).trim(),
      value: "1",
    });
    const pageTotal = h("span", { className: "fv-control-text" }, [fillTemplate(labels.pageIndicator, { current: "", total }).trim()]);
    toolbar.addNode(h("span", { className: "fv-page-box" }, [pageInput, pageTotal]));
    const next = toolbar.addButton({ label: labels.nextPage, icon: icons.next, onClick: () => goTo(currentPage + 1) });
    toolbar.addSeparator();
    const zoomOut = toolbar.addButton({ label: labels.zoomOut, icon: icons.zoomOut, onClick: () => setZoom(stepZoom(zoom, -1)) });
    const zoomIn = toolbar.addButton({ label: labels.zoomIn, icon: icons.zoomIn, onClick: () => setZoom(stepZoom(zoom, 1)) });
    toolbar.addButton({ label: labels.resetZoom, icon: icons.fit, onClick: () => setZoom(1) });

    let currentPage = 1;
    const updateControls = (): void => {
      if (document.activeElement !== pageInput) pageInput.value = String(currentPage);
      previous.disabled = currentPage <= 1;
      next.disabled = currentPage >= total;
      zoomOut.disabled = !canZoom(zoom, -1);
      zoomIn.disabled = !canZoom(zoom, 1);
    };

    const pageTops = (): number[] => slots.map((slot) => slot.wrapper.offsetTop);

    const goTo = (page: number): void => {
      const target = Math.min(total, Math.max(1, page));
      scroller.scrollTop = slots[target - 1]!.wrapper.offsetTop - PAGE_GAP_PX;
      currentPage = target;
      updateControls();
    };

    const commitInput = (): void => {
      const page = parsePageInput(pageInput.value, total);
      if (page == null) pageInput.value = String(currentPage);
      else goTo(page);
    };
    const onInputKey = (event: KeyboardEvent): void => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitInput();
      } else if (event.key === "Escape") {
        pageInput.value = String(currentPage);
        pageInput.blur();
      }
    };
    pageInput.addEventListener("keydown", onInputKey);
    pageInput.addEventListener("change", commitInput);

    let scrollFrame = 0;
    const onScroll = (): void => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        if (topsDirty) {
          tops = pageTops();
          topsDirty = false;
        }
        const page = pageIndexAt(tops, scroller.scrollTop + scroller.clientHeight * 0.3) + 1;
        if (page !== currentPage) {
          currentPage = page;
          updateControls();
        }
      });
    };

    const relayout = (): void => {
      const anchor = slots[currentPage - 1]!.wrapper;
      const offsetInPage = anchor.offsetHeight > 0 ? (scroller.scrollTop - anchor.offsetTop) / anchor.offsetHeight : 0;
      scale = fitScale() * zoom;
      for (const slot of slots) sizeSlot(slot);
      topsDirty = true;
      scroller.scrollTop = anchor.offsetTop + offsetInPage * anchor.offsetHeight;
      for (const index of visible) void renderSlot(index);
      updateControls();
    };

    const setZoom = (value: number): void => {
      zoom = value;
      relayout();
    };

    let lastWidth = scroller.clientWidth;
    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (scroller.clientWidth === lastWidth || resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        lastWidth = scroller.clientWidth;
        relayout();
      });
    });

    scale = fitScale() * zoom;
    for (const slot of slots) sizeSlot(slot);
    for (const slot of slots) observer.observe(slot.wrapper);
    resizeObserver.observe(scroller);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    updateControls();

    return () => {
      ctx.signal.removeEventListener("abort", onAbort);
      observer.disconnect();
      resizeObserver.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      pageInput.removeEventListener("keydown", onInputKey);
      pageInput.removeEventListener("change", commitInput);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      for (const slot of slots) release(slot);
      void doc.destroy();
    };
  },
};
