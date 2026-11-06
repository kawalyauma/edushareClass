import type {Stroke} from '@edushare/shared-types';
import {glyphPath} from './glyphs';
import {planHandwriting} from './layout';
export * from './glyphs';
export * from './layout';
export * from './render';
/** Backward-compatible Phase 01 contract. Glyph paths are original hand-plotted polylines. */
export interface GlyphProvider {glyph(char:string):Stroke[]|null;}
export interface StrokeLayoutRequest{text:string;width:number;lineHeight:number;}
export interface StrokeEngine {layout(req:StrokeLayoutRequest):Stroke[];}
export class OriginalGlyphProvider implements GlyphProvider {
  glyph(char:string):Stroke[]|null{
    const path=glyphPath(char);
    return path?.map(points=>({points:points.map(([x,y])=>({x,y})),width:0.045,color:'#ffffff',durationMs:180}))??null;
  }
}
export class HandwritingStrokeEngine implements StrokeEngine {
  layout(req:StrokeLayoutRequest):Stroke[]{return planHandwriting({text:req.text,x:0,y:0,maxWidth:req.width,emSize:req.lineHeight*.62}).strokes;}
}
