/** PDF user-space points: origin bottom-left; CSS page-local coordinates: origin top-left. */
export interface Rect { x: number; y: number; width: number; height: number }
export interface PdfViewport {
  width: number;
  height: number;
  convertToPdfPoint(x: number, y: number): [number, number];
  convertToViewportRectangle(rect: [number, number, number, number]): [number, number, number, number];
}
export interface CssPoint { x: number; y: number }

export function rectFromCorners(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

export function pdfRectToCss(rect: Rect, viewport: PdfViewport): Rect {
  const [x1,y1,x2,y2] = viewport.convertToViewportRectangle([
    rect.x,rect.y,rect.x+rect.width,rect.y+rect.height,
  ]);
  return rectFromCorners(x1,y1,x2,y2);
}

/** Handles all 0/90/180/270 rotations via PDF.js's own viewport inverse. */
export function cssRectToPdf(a: CssPoint, b: CssPoint, viewport: PdfViewport): Rect {
  const [x1,y1] = viewport.convertToPdfPoint(a.x,a.y);
  const [x2,y2] = viewport.convertToPdfPoint(b.x,b.y);
  return rectFromCorners(x1,y1,x2,y2);
}

/** Keep drag regions inside the displayed PDF page before mapping back to PDF points. */
export function limitToPage(p: CssPoint, viewport: PdfViewport): CssPoint {
  return { x: Math.max(0, Math.min(viewport.width, p.x)), y: Math.max(0, Math.min(viewport.height,p.y)) };
}
export function containsPoint(rect: Rect, p: CssPoint): boolean {
  return p.x>=rect.x && p.x<=rect.x+rect.width && p.y>=rect.y && p.y<=rect.y+rect.height;
}

/** Crop dimensions use the same css-to-bitmap ratio as PDF.js' HiDPI canvas renderer. */
export function bitmapCrop(rect: Rect, ratio: number, bitmapWidth: number, bitmapHeight: number) {
  const x = Math.max(0,Math.min(bitmapWidth,Math.floor(rect.x*ratio)));
  const y = Math.max(0,Math.min(bitmapHeight,Math.floor(rect.y*ratio)));
  const right = Math.max(x,Math.min(bitmapWidth,Math.ceil((rect.x+rect.width)*ratio)));
  const bottom = Math.max(y,Math.min(bitmapHeight,Math.ceil((rect.y+rect.height)*ratio)));
  return { x, y, width: right-x, height: bottom-y };
}
