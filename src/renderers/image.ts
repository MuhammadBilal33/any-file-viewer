import { FileViewerError } from "../core/errors.js";
import { h, icons } from "../utils/dom.js";
import { canZoom, stepZoom } from "../utils/zoom.js";
import type { Renderer } from "../core/types.js";

/** <img> never runs scripts, so SVG files are safe to show this way. */
export const imageRenderer: Renderer = {
  async render(ctx) {
    const { labels, toolbar } = ctx;
    const img = h("img", { className: "fv-image", alt: ctx.file.name, decoding: "async", draggable: "false" });
    const stage = h("div", { className: "fv-image-stage" }, [img]);
    ctx.root.append(stage);

    let zoom = 1;
    let rotation = 0;
    const zoomOut = toolbar.addButton({ label: labels.zoomOut, icon: icons.zoomOut, onClick: () => setZoom(stepZoom(zoom, -1)) });
    const zoomIn = toolbar.addButton({ label: labels.zoomIn, icon: icons.zoomIn, onClick: () => setZoom(stepZoom(zoom, 1)) });
    toolbar.addButton({ label: labels.resetZoom, icon: icons.fit, onClick: () => setZoom(1) });
    toolbar.addButton({
      label: labels.rotate,
      icon: icons.rotate,
      onClick: () => {
        rotation = (rotation + 90) % 360;
        apply();
      },
    });

    // Zoom 1 = fit inside the area. Above that the image grows and the area scrolls.
    function apply(): void {
      const sideways = rotation % 180 !== 0;
      stage.classList.toggle("fv-image-zoomed", zoom !== 1);
      img.style.transform = rotation ? `rotate(${rotation}deg)` : "";
      img.classList.toggle("fv-image-sideways", sideways);
      if (zoom === 1) {
        img.style.width = "";
        img.style.maxWidth = "";
        img.style.maxHeight = "";
      } else {
        img.style.maxWidth = "none";
        img.style.maxHeight = "none";
        img.style.width = `${Math.round(img.naturalWidth * zoom)}px`;
      }
      zoomOut.disabled = !canZoom(zoom, -1);
      zoomIn.disabled = !canZoom(zoom, 1);
    }

    function setZoom(next: number): void {
      zoom = next;
      apply();
    }

    const onError = () => ctx.fail(new FileViewerError("unsupported_media", "The browser could not decode this image."));
    img.addEventListener("error", onError);
    img.src = await ctx.getObjectUrl();
    apply();
    return () => {
      img.removeEventListener("error", onError);
      img.removeAttribute("src");
    };
  },
};
