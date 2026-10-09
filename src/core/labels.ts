/** Every string the viewer shows. Override any of them with `options.labels`. `{name}` placeholders are filled at runtime. */
export interface Labels {
  viewerRegion: string;
  loading: string;
  download: string;
  zoomIn: string;
  zoomOut: string;
  resetZoom: string;
  rotate: string;
  wrapLines: string;
  previousPage: string;
  nextPage: string;
  pageIndicator: string;
  pageLabel: string;
  slideLabel: string;
  sheetTabs: string;
  noPreview: string;
  downloadToOpen: string;
  tooLarge: string;
  fetchFailed: string;
  passwordProtected: string;
  missingDependency: string;
  renderFailed: string;
  mediaUnsupported: string;
  showMoreRows: string;
  rowsShown: string;
  columnsCut: string;
  emptySheet: string;
  textCut: string;
  archiveSummary: string;
  archiveCut: string;
  columnName: string;
  columnModified: string;
  presentationNote: string;
}

export const defaultLabels: Labels = {
  viewerRegion: "File preview",
  loading: "Loading preview…",
  download: "Download",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Fit to width",
  rotate: "Rotate",
  wrapLines: "Wrap lines",
  previousPage: "Previous page",
  nextPage: "Next page",
  pageIndicator: "{current} / {total}",
  pageLabel: "Page {number}",
  slideLabel: "Slide {number}",
  sheetTabs: "Sheets",
  noPreview: "No preview for this file type.",
  downloadToOpen: "Download the file to open it.",
  tooLarge: "This file is too large to preview.",
  fetchFailed: "Could not load the file.",
  passwordProtected: "This file is password-protected.",
  missingDependency: "Preview for this file type is not installed.",
  renderFailed: "Could not show this file.",
  mediaUnsupported: "This browser cannot play this file.",
  showMoreRows: "Show more rows",
  rowsShown: "Showing {shown} of {total} rows",
  columnsCut: "Only the first {count} columns are shown.",
  emptySheet: "This sheet is empty.",
  textCut: "Only the first part of this file is shown.",
  archiveSummary: "{count} items",
  archiveCut: "Only the first {count} items are shown.",
  columnName: "Name",
  columnModified: "Modified",
  presentationNote: "Simple preview. Download the file to see the full design.",
};

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
