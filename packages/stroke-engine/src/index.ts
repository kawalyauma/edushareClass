import type { Stroke } from '@edushare/shared-types';

/**
 * Phase 03 contract. Phase 01 only fixes the interface so the board (Phase 04) and maths
 * (Phase 05) can code against it; implementation is deferred to Phase 03.
 */
export interface GlyphProvider {
  /** Pen strokes for a character in em-normalised coordinates, or null if unsupported. */
  glyph(char: string): Stroke[] | null;
}

export interface StrokeLayoutRequest {
  text: string;
  width: number;
  lineHeight: number;
}

export interface StrokeEngine {
  layout(req: StrokeLayoutRequest): Stroke[];
}
