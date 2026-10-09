import { formatBytes } from "../utils/format.js";
import { messageCard } from "../utils/message-card.js";
import type { Renderer } from "../core/types.js";

/** Used for every file type the browser cannot show: legacy .doc / .ppt, executables, TIFF, and so on. */
export const fallbackRenderer: Renderer = {
  async render(ctx) {
    const { file, labels, options } = ctx;
    ctx.root.append(
      messageCard({
        tone: "info",
        title: labels.noPreview,
        meta: [file.extension.toUpperCase(), formatBytes(file.size)].filter(Boolean).join(" · "),
        detail: labels.downloadToOpen,
        action: options.download === false ? undefined : { label: labels.download, onClick: ctx.download },
      }),
    );
  },
};
