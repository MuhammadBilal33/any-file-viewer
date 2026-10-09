import { FileViewerError, importPeer } from "../core/errors.js";
import { h, yieldToBrowser } from "../utils/dom.js";
import { mountGrid } from "../utils/grid.js";
import type { Renderer } from "../core/types.js";

const MAX_COLUMNS = 500;
/** Rows read per sheet. The grid still pages them, this only caps memory for giant sheets. */
const MAX_ROWS = 200_000;

export const spreadsheetRenderer: Renderer = {
  async render(ctx) {
    const { labels } = ctx;
    const XLSX = await importPeer(() => import("xlsx"), "xlsx");
    const bytes = await ctx.getBytes();
    await yieldToBrowser();

    let workbook: import("xlsx").WorkBook;
    try {
      workbook = XLSX.read(bytes, { type: "array", dense: true, cellDates: true, sheetRows: MAX_ROWS });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (/password|encrypt/i.test(message)) throw new FileViewerError("password_protected", message, err);
      throw err;
    }

    const sheetMeta = workbook.Workbook?.Sheets ?? [];
    const visible = workbook.SheetNames.filter((_name, index) => !sheetMeta[index]?.Hidden);
    const names = visible.length > 0 ? visible : workbook.SheetNames;
    if (names.length === 0) {
      ctx.root.append(h("p", { className: "fv-note" }, [labels.emptySheet]));
      return;
    }

    const tabs = h("div", { className: "fv-tabs", role: "tablist", "aria-label": labels.sheetTabs });
    const panel = h("div", { className: "fv-tab-panel", role: "tabpanel", tabindex: 0 });
    if (names.length > 1) ctx.root.append(tabs);
    ctx.root.append(panel);

    // Converting a sheet is the slow part, so do it only when that tab is first opened.
    const rowsCache = new Map<string, string[][]>();
    let unmountGrid: (() => void) | null = null;
    const buttons: HTMLButtonElement[] = [];

    const select = (index: number): void => {
      const name = names[index]!;
      buttons.forEach((button, i) => {
        button.setAttribute("aria-selected", String(i === index));
        button.tabIndex = i === index ? 0 : -1;
      });
      const sheet = workbook.Sheets[name];
      let rows = rowsCache.get(name);
      if (!rows) {
        rows = sheet ? XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true }) : [];
        rowsCache.set(name, rows);
      }
      // `sheetRows` cuts the read; `!fullref` still holds the real size, so the count stays honest.
      const fullRef = sheet?.["!fullref"] ?? sheet?.["!ref"];
      const fullRows = fullRef ? XLSX.utils.decode_range(fullRef).e.r + 1 : rows.length;
      unmountGrid?.();
      panel.replaceChildren();
      panel.setAttribute("aria-label", name);
      unmountGrid = mountGrid(panel, {
        rows,
        headerRow: false,
        pageSize: ctx.options.tablePageSize,
        maxColumns: MAX_COLUMNS,
        labels,
        totalRows: Math.max(rows.length, fullRows),
      });
    };

    names.forEach((name, index) => {
      const button = h("button", { type: "button", role: "tab", className: "fv-tab" }, [name]);
      button.addEventListener("click", () => select(index));
      buttons.push(button);
      tabs.append(button);
    });

    const onTabKey = (event: KeyboardEvent): void => {
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (current === -1) return;
      let next = current;
      if (event.key === "ArrowRight") next = (current + 1) % buttons.length;
      else if (event.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = buttons.length - 1;
      else return;
      event.preventDefault();
      buttons[next]!.focus();
      select(next);
    };
    tabs.addEventListener("keydown", onTabKey);

    select(0);
    return () => {
      tabs.removeEventListener("keydown", onTabKey);
      unmountGrid?.();
      rowsCache.clear();
    };
  },
};
