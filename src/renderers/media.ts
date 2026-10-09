import { FileViewerError } from "../core/errors.js";
import { h } from "../utils/dom.js";
import type { RenderContext, Renderer } from "../core/types.js";

/** Native players stream from the URL with range requests, so big videos are never downloaded whole. */
async function renderMedia(ctx: RenderContext, tag: "video" | "audio"): Promise<() => void> {
  const media = h(tag, { className: `fv-${tag}`, controls: true, preload: "metadata", "aria-label": ctx.file.name });
  if (media instanceof HTMLVideoElement) media.playsInline = true;
  const onError = () => ctx.fail(new FileViewerError("unsupported_media", `The browser could not play this ${tag}.`));
  media.addEventListener("error", onError);
  ctx.root.append(h("div", { className: "fv-media-stage" }, [media]));
  media.src = await ctx.getObjectUrl();

  return () => {
    media.removeEventListener("error", onError);
    media.pause();
    // Clearing src and calling load() releases the decoder and the network stream.
    media.removeAttribute("src");
    media.load();
  };
}

export const videoRenderer: Renderer = { render: (ctx) => renderMedia(ctx, "video") };
export const audioRenderer: Renderer = { render: (ctx) => renderMedia(ctx, "audio") };
