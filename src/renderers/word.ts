import { isOleContainer } from "../core/detect.js";
import { FileViewerError, importPeer } from "../core/errors.js";
import { h, icons } from "../utils/dom.js";
import { isSafeHref } from "../utils/format.js";
import { canZoom, fitScale, stepZoom } from "../utils/zoom.js";
import type { Renderer } from "../core/types.js";

const PAGE_GUTTER_PX = 32;

/** Links inside the document can point anywhere. Keep only web and mail links, and open them in a new tab. */
export function neutralizeLinks(root: HTMLElement): void {
  for (const link of Array.from(root.querySelectorAll("a[href]"))) {
    const href = link.getAttribute("href");
    if (!isSafeHref(href)) {
      link.removeAttribute("href");
      continue;
    }
    if (!href!.startsWith("#")) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }
  }
}

export const wordRenderer: Renderer = {
  async render(ctx) {
    const { labels, toolbar } = ctx;
    const { renderAsync } = await importPeer(() => import("docx-preview"), "docx-preview");
    const bytes = await ctx.getBytes();
    if (isOleContainer(new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength)))) {
      throw new FileViewerError("password_protected", "This Word file is encrypted or in the old .doc format.");
    }

    const styles = h("div", { className: "fv-docx-styles" });
    const pages = h("div", { className: "fv-docx-pages" });
    const zoomBox = h("div", { className: "fv-docx-zoom" }, [pages]);
    ctx.root.append(styles, zoomBox);

    await renderAsync(bytes, pages, styles, {
      className: "fv-docx",
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderComments: false,
      renderChanges: false,
      // base64 images are freed with the DOM; blob URLs would leak after the viewer closes.
      useBase64URL: true,
      experimental: false,
    });
    neutralizeLinks(pages);

    let zoom = 1;
    let userZoomed = false;
    const pageWidth = (): number => pages.querySelector<HTMLElement>("section.fv-docx")?.offsetWidth ?? 0;

    const zoomOut = toolbar.addButton({ label: labels.zoomOut, icon: icons.zoomOut, onClick: () => setZoom(stepZoom(zoom, -1), true) });
    const zoomIn = toolbar.addButton({ label: labels.zoomIn, icon: icons.zoomIn, onClick: () => setZoom(stepZoom(zoom, 1), true) });
    toolbar.addButton({ label: labels.resetZoom, icon: icons.fit, onClick: () => fit(true) });

    function setZoom(next: number, byUser: boolean): void {
      zoom = next;
      userZoomed = byUser;
      // CSS zoom keeps layout and scroll size right, unlike transform: scale().
      zoomBox.style.zoom = String(zoom);
      zoomOut.disabled = !canZoom(zoom, -1);
      zoomIn.disabled = !canZoom(zoom, 1);
    }

    function fit(reset: boolean): void {
      if (reset) userZoomed = false;
      if (userZoomed) return;
      setZoom(fitScale(ctx.scroller.clientWidth - PAGE_GUTTER_PX, pageWidth()), false);
    }

    fit(true);
    const observer = new ResizeObserver(() => fit(false));
    observer.observe(ctx.scroller);
    return () => observer.disconnect();
  },
};
