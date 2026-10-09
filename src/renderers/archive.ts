import { importPeer } from "../core/errors.js";
import { fillTemplate } from "../core/labels.js";
import { h, icons, svgIcon } from "../utils/dom.js";
import type { Renderer } from "../core/types.js";

const MAX_ENTRIES = 5000;

/** Lists what is inside a ZIP. Only the central directory is read; nothing is unpacked. */
export const archiveRenderer: Renderer = {
  async render(ctx) {
    const { labels } = ctx;
    const JSZip = (await importPeer(() => import("jszip"), "jszip")).default;
    const zip = await JSZip.loadAsync(await ctx.getBytes());

    const entries: { name: string; dir: boolean; date: Date }[] = [];
    zip.forEach((path, entry) => {
      entries.push({ name: path, dir: entry.dir, date: entry.date });
    });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
    const shown = entries.slice(0, MAX_ENTRIES);
    const fragment = document.createDocumentFragment();
    for (const entry of shown) {
      fragment.append(
        h("tr", {}, [
          h("td", { className: "fv-archive-name" }, [svgIcon(entry.dir ? icons.folder : icons.file), entry.name]),
          h("td", {}, [Number.isNaN(entry.date.getTime()) ? "" : dateFormat.format(entry.date)]),
        ]),
      );
    }
    const tbody = h("tbody");
    tbody.append(fragment);

    ctx.root.append(
      h("p", { className: "fv-note" }, [fillTemplate(labels.archiveSummary, { count: entries.length.toLocaleString() })]),
      h("div", { className: "fv-grid-scroll" }, [
        h("table", { className: "fv-grid fv-archive" }, [
          h("thead", {}, [h("tr", {}, [h("th", { scope: "col" }, [labels.columnName]), h("th", { scope: "col" }, [labels.columnModified])])]),
          tbody,
        ]),
      ]),
    );
    if (entries.length > MAX_ENTRIES) {
      ctx.root.append(h("p", { className: "fv-note" }, [fillTemplate(labels.archiveCut, { count: MAX_ENTRIES })]));
    }
  },
};
