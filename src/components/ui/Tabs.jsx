import { useId, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

/** Tabs following the WAI-ARIA APG pattern with automatic activation. */
export function Tabs({ label, tabs, defaultTabId }) {
  const baseId = useId();
  const [selectedId, setSelectedId] = useState(defaultTabId ?? tabs[0]?.id);
  const tabRefs = useRef(new Map());

  const select = (index) => {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (!tab) return;
    setSelectedId(tab.id);
    tabRefs.current.get(tab.id)?.focus();
  };

  const onKeyDown = (event, index) => {
    const actions = {
      ArrowRight: () => select(index + 1),
      ArrowLeft: () => select(index - 1),
      Home: () => select(0),
      End: () => select(tabs.length - 1),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-border">
        {tabs.map((tab, index) => {
          const selected = tab.id === selectedId;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setSelectedId(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium',
                selected
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-ink-muted hover:border-border-strong hover:text-ink',
              )}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span className="rounded-full bg-surface-muted px-1.5 text-xs text-ink-muted">
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== selectedId}
          tabIndex={0}
          className="pt-4"
        >
          {tab.id === selectedId ? tab.content : null}
        </div>
      ))}
    </div>
  );
}
