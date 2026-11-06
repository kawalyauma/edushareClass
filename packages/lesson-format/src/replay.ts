import type { BoardAction, Lesson, Rect, Stroke } from '@edushare/shared-types';

export interface PlacedContent {
  id: string;
  selectionId: string;
  target: Rect;
  mode: 'handwriting' | 'crop';
  strokes: Stroke[];
}

export interface BoardPageState {
  id: string;
  content: PlacedContent[];
}

export interface BoardState {
  pages: BoardPageState[];
  currentPageId: string | null;
  speed: number;
}

export const initialBoardState = (): BoardState => ({ pages: [], currentPageId: null, speed: 1 });

function mapPage(
  state: BoardState,
  pageId: string,
  fn: (p: BoardPageState) => BoardPageState,
): BoardState {
  return { ...state, pages: state.pages.map((p) => (p.id === pageId ? fn(p) : p)) };
}

/** Pure reducer: the same actions always yield the same state (deterministic replay). */
export function applyAction(state: BoardState, a: BoardAction): BoardState {
  switch (a.type) {
    case 'page.add':
      if (state.pages.some((p) => p.id === a.pageId)) return state;
      return {
        ...state,
        pages: [...state.pages, { id: a.pageId, content: [] }],
        currentPageId: state.currentPageId ?? a.pageId,
      };
    case 'page.show':
      return state.pages.some((p) => p.id === a.pageId)
        ? { ...state, currentPageId: a.pageId }
        : state;
    case 'content.place':
      return mapPage(state, a.pageId, (p) => ({
        ...p,
        content: [
          ...p.content,
          { id: a.id, selectionId: a.selectionId, target: a.target, mode: a.mode, strokes: [] },
        ],
      }));
    case 'stroke.write':
      return mapPage(state, a.pageId, (p) => ({
        ...p,
        content: p.content.map((c) =>
          c.id === a.contentId ? { ...c, strokes: [...c.strokes, a.stroke] } : c,
        ),
      }));
    case 'board.clear':
      return mapPage(state, a.pageId, (p) => ({ ...p, content: [] }));
    case 'pace.set':
      return { ...state, speed: a.speed };
  }
}

/** Replay actions up to and including `untilMs` (default: all). */
export function replay(lesson: Pick<Lesson, 'actions'>, untilMs = Infinity): BoardState {
  let state = initialBoardState();
  for (const a of lesson.actions) {
    if (a.t > untilMs) break;
    state = applyAction(state, a);
  }
  return state;
}
