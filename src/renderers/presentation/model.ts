/** Positions and sizes are in EMU (English Metric Units): 914,400 per inch, 9,525 per CSS pixel. */
export const EMU_PER_PX = 9525;

export interface TextRun {
  text: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
}

export interface TextParagraph {
  align: "left" | "center" | "right" | "justify";
  level: number;
  bullet?: string;
  runs: TextRun[];
  /** Size of an empty paragraph, so blank lines keep their height. */
  endSizePt?: number;
}

interface ShapeBase {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TextShape extends ShapeBase {
  type: "text";
  fill?: string;
  defaultSizePt: number;
  verticalAlign: "top" | "middle" | "bottom";
  paragraphs: TextParagraph[];
}

export interface ImageShape extends ShapeBase {
  type: "image";
  /** Path of the picture inside the .pptx zip. */
  mediaPath: string;
}

export interface TableShape extends ShapeBase {
  type: "table";
  rows: string[][];
}

export type SlideShape = TextShape | ImageShape | TableShape;

export interface SlideModel {
  number: number;
  background: string;
  shapes: SlideShape[];
}

export interface PresentationModel {
  width: number;
  height: number;
  slides: SlideModel[];
}
