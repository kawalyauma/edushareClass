import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Panel } from '../ui';

export const PANELS = ['source', 'board', 'controls'] as const;
export type PanelId = (typeof PANELS)[number];
const LABEL: Record<PanelId, string> = {
  source: 'Source PDF',
  board: 'Teaching board',
  controls: 'Controls',
};

/**
 * Responsive three-panel studio. ≥1024px shows all panels; narrower screens show one panel at a
 * time, selected via tabs and mirrored in the `?panel=` URL parameter.
 */
export function StudioShell({ source, board, controls }: Record<PanelId, ReactNode>) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('panel');
  const active: PanelId = PANELS.includes(requested as PanelId) ? (requested as PanelId) : 'board';
  const content = { source, board, controls };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = PANELS[(i + dir + PANELS.length) % PANELS.length]!;
    setParams({ panel: next }, { replace: true });
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <div className="studio">
      <div className="studio-tabs" role="tablist" aria-label="Studio panels">
        {PANELS.map((id, i) => (
          <button
            key={id}
            id={`tab-${id}`}
            role="tab"
            type="button"
            className="btn"
            aria-selected={active === id}
            aria-controls={`panel-${id}`}
            tabIndex={active === id ? 0 : -1}
            onClick={() => setParams({ panel: id }, { replace: true })}
            onKeyDown={(e) => onKey(e, i)}
          >
            {LABEL[id]}
          </button>
        ))}
      </div>
      <div className="studio-panels">
        {PANELS.map((id) => (
          <div key={id} id={`panel-${id}`} className="studio-slot" data-active={active === id}>
            <Panel title={LABEL[id]}>{content[id]}</Panel>
          </div>
        ))}
      </div>
    </div>
  );
}
