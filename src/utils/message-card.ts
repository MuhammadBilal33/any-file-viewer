import { h, icons, svgIcon } from "./dom.js";

export interface MessageCardSpec {
  tone: "info" | "error";
  title: string;
  detail?: string;
  meta?: string;
  action?: { label: string; onClick: () => void };
}

/** The centred card used for "no preview", "too large" and every error. */
export function messageCard(spec: MessageCardSpec): HTMLElement {
  const button = spec.action
    ? h("button", { type: "button", className: "fv-btn fv-btn-primary" }, [svgIcon(icons.download), spec.action.label])
    : null;
  if (button && spec.action) button.addEventListener("click", spec.action.onClick);

  return h("div", { className: `fv-card fv-card-${spec.tone}`, role: spec.tone === "error" ? "alert" : "status" }, [
    h("div", { className: "fv-card-icon" }, [svgIcon(spec.tone === "error" ? icons.alert : icons.file)]),
    h("p", { className: "fv-card-title" }, [spec.title]),
    spec.meta ? h("p", { className: "fv-card-meta" }, [spec.meta]) : null,
    spec.detail ? h("p", { className: "fv-card-detail" }, [spec.detail]) : null,
    button,
  ]);
}
