import { h } from "../utils/dom.js";
import { decodeText } from "../utils/format.js";
import { lockedHtmlDocument } from "../utils/text.js";
import type { Renderer } from "../core/types.js";

/** Shows an HTML file as a page inside a sandboxed frame. An empty `sandbox` blocks scripts, forms, popups and same-origin access. */
export const htmlRenderer: Renderer = {
  async render(ctx) {
    const html = decodeText(await ctx.getBytes());
    const frame = h("iframe", {
      className: "fv-html-frame",
      sandbox: "",
      referrerpolicy: "no-referrer",
      title: ctx.file.name,
    });
    frame.srcdoc = lockedHtmlDocument(html);
    ctx.root.append(frame);
    return () => {
      frame.srcdoc = "";
    };
  },
};
