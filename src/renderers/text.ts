import { h, icons } from "../utils/dom.js";
import { decodeText } from "../utils/format.js";
import { prettyJson } from "../utils/text.js";
import type { Renderer } from "../core/types.js";

const JSON_EXTENSIONS = new Set(["json", "geojson", "jsonc"]);
const PRETTY_JSON_LIMIT = 5 * 1024 * 1024;

/** Text, code, JSON, Markdown and logs, shown as plain text. Nothing in the file is ever parsed as HTML. */
export const textRenderer: Renderer = {
  async render(ctx) {
    const { file, labels, options } = ctx;
    const bytes = await ctx.getBytes();
    let text = decodeText(bytes);

    const isJson = JSON_EXTENSIONS.has(file.extension) || file.mimeType === "application/json" || file.mimeType.endsWith("+json");
    if (isJson && text.length <= PRETTY_JSON_LIMIT) text = prettyJson(text);

    const cut = text.length > options.textMaxChars;
    if (cut) text = text.slice(0, options.textMaxChars);

    const code = h("code", {}, [text]);
    const pre = h("pre", { className: "fv-text", tabindex: 0 }, [code]);
    if (cut) ctx.root.append(h("p", { className: "fv-note fv-note-banner", role: "status" }, [labels.textCut]));
    ctx.root.append(pre);

    let wrapped = file.extension === "md" || file.extension === "markdown" || file.extension === "txt" || file.extension === "log";
    pre.classList.toggle("fv-text-wrap", wrapped);
    const wrapButton = ctx.toolbar.addButton({
      label: labels.wrapLines,
      icon: icons.wrap,
      onClick: () => {
        wrapped = !wrapped;
        pre.classList.toggle("fv-text-wrap", wrapped);
        wrapButton.setAttribute("aria-pressed", String(wrapped));
      },
    });
    wrapButton.setAttribute("aria-pressed", String(wrapped));
  },
};
