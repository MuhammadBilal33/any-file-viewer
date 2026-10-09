import { fillTemplate, type Labels } from "../core/labels.js";
import { h } from "./dom.js";
import { columnLabel } from "./format.js";

export interface GridOptions {
  rows: readonly (readonly string[])[];
  /** Treat the first row as column titles (CSV). Sheets use A, B, C instead. */
  headerRow: boolean;
  pageSize: number;
  maxColumns: number;
  labels: Labels;
  /** Total rows when `rows` was cut short while parsing. */
  totalRows?: number;
}

/**
 * Table that adds rows in pages, so a 100,000-row sheet costs the same to open as a 500-row one.
 * Every cell is set with textContent, so cell values can never become HTML.
 */
export function mountGrid(container: HTMLElement, options: GridOptions): () => void {
  const { rows, headerRow, labels } = options;
  const dataRows = headerRow ? rows.slice(1) : rows;
  let widest = 0;
  for (const row of rows) if (row.length > widest) widest = row.length;
  const columnCount = Math.min(widest, options.maxColumns);

  if (rows.length === 0 || columnCount === 0) {
    container.append(h("p", { className: "fv-note" }, [labels.emptySheet]));
    return () => undefined;
  }

  const headCells: HTMLElement[] = [h("th", { className: "fv-grid-corner", scope: "col" }, [""])];
  for (let c = 0; c < columnCount; c += 1) {
    const title = headerRow ? (rows[0]![c] ?? "") : columnLabel(c);
    headCells.push(h("th", { scope: "col" }, [title]));
  }
  const tbody = h("tbody");
  const table = h("table", { className: "fv-grid" }, [h("thead", {}, [h("tr", {}, headCells)]), tbody]);
  const status = h("p", { className: "fv-note", "aria-live": "polite" });
  const more = h("button", { type: "button", className: "fv-btn" }, [labels.showMoreRows]);
  const footer = h("div", { className: "fv-grid-footer" }, [status, more]);

  container.append(h("div", { className: "fv-grid-scroll" }, [table]), footer);
  if (widest > options.maxColumns) {
    container.append(h("p", { className: "fv-note" }, [fillTemplate(labels.columnsCut, { count: options.maxColumns })]));
  }

  const total = options.totalRows ?? dataRows.length;
  let shown = 0;

  const appendPage = (): void => {
    const end = Math.min(dataRows.length, shown + options.pageSize);
    const fragment = document.createDocumentFragment();
    for (let r = shown; r < end; r += 1) {
      const row = dataRows[r]!;
      const tr = document.createElement("tr");
      const number = document.createElement("th");
      number.scope = "row";
      number.textContent = String(r + 1);
      tr.append(number);
      for (let c = 0; c < columnCount; c += 1) {
        const td = document.createElement("td");
        td.textContent = row[c] ?? "";
        tr.append(td);
      }
      fragment.append(tr);
    }
    tbody.append(fragment);
    shown = end;
    status.textContent = fillTemplate(labels.rowsShown, { shown: shown.toLocaleString(), total: total.toLocaleString() });
    more.hidden = shown >= dataRows.length;
    footer.hidden = shown >= total && more.hidden && total <= options.pageSize;
  };

  more.addEventListener("click", appendPage);
  appendPage();
  return () => more.removeEventListener("click", appendPage);
}
