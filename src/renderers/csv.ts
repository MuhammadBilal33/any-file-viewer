import { decodeText } from "../utils/format.js";
import { guessDelimiter, parseDelimited } from "../utils/csv.js";
import { mountGrid } from "../utils/grid.js";
import type { Renderer } from "../core/types.js";

const MAX_ROWS = 200_000;
const MAX_COLUMNS = 500;

export const csvRenderer: Renderer = {
  async render(ctx) {
    const text = decodeText(await ctx.getBytes());
    const delimiter = ctx.file.extension === "tsv" || ctx.file.mimeType === "text/tab-separated-values" ? "\t" : guessDelimiter(text);
    const { rows } = parseDelimited(text, delimiter, MAX_ROWS);
    return mountGrid(ctx.root, {
      rows,
      headerRow: true,
      pageSize: ctx.options.tablePageSize,
      maxColumns: MAX_COLUMNS,
      labels: ctx.labels,
    });
  },
};
