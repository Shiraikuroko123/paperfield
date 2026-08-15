import { useMemo, useState, type DragEvent } from 'react';
import { Search } from 'lucide-react';
import type { ShapeKind } from '../types';
import {
  SHAPE_CATEGORY_LABELS,
  VISIBLE_SHAPES,
  type ShapeCategory,
} from '../lib/shapeRegistry';
import { templates } from '../data/templates';
import { ShapeVisual } from './ShapeVisual';

const categoryOrder: Exclude<ShapeCategory, 'internal'>[] = [
  'flowchart',
  'bpmn',
  'uml',
  'erd',
  'architecture',
  'scientific',
  'basic',
  'container',
];

interface LibraryPanelProps {
  open: boolean;
  onAddShape: (kind: ShapeKind) => void;
  onLoadTemplate: (id: string) => void;
}

export function LibraryPanel({ open, onAddShape, onLoadTemplate }: LibraryPanelProps) {
  const [tab, setTab] = useState<'shapes' | 'templates'>('shapes');
  const [query, setQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Set<ShapeCategory>>(() => new Set(['flowchart']));
  const normalizedQuery = query.trim().toLowerCase();

  const filteredShapes = useMemo(() => {
    if (!normalizedQuery) return VISIBLE_SHAPES;
    return VISIBLE_SHAPES.filter((definition) => (
      `${definition.label} ${definition.standardName} ${definition.keywords.join(' ')}`
        .toLowerCase()
        .includes(normalizedQuery)
    ));
  }, [normalizedQuery]);

  const filteredTemplates = useMemo(() => {
    if (!normalizedQuery) return templates;
    return templates.filter((template) => (
      `${template.name} ${template.category} ${template.description}`.toLowerCase().includes(normalizedQuery)
    ));
  }, [normalizedQuery]);

  const handleDragStart = (event: DragEvent<HTMLButtonElement>, kind: ShapeKind) => {
    event.dataTransfer.setData('application/flowloom-shape', kind);
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside
      className={open ? 'library-panel is-open' : 'library-panel'}
      aria-label="图形库"
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <div className="panel-tabs" role="tablist" aria-label="图形库视图">
        <button role="tab" aria-selected={tab === 'shapes'} className={tab === 'shapes' ? 'is-active' : ''} onClick={() => setTab('shapes')}>
          图形
        </button>
        <button role="tab" aria-selected={tab === 'templates'} className={tab === 'templates' ? 'is-active' : ''} onClick={() => setTab('templates')}>
          模板
        </button>
      </div>

      <div className="library-search">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">{tab === 'shapes' ? '搜索图形' : '搜索模板'}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === 'shapes' ? '搜索名称、标准或用途' : '搜索模板'}
          />
        </label>
        <span className="library-search__count">
          {tab === 'shapes' ? `${filteredShapes.length} 个图形` : `${filteredTemplates.length} 个模板`}
        </span>
      </div>

      {tab === 'shapes' ? (
        <div className="library-panel__body library-panel__body--shapes">
          {categoryOrder.map((category) => {
            const shapes = filteredShapes.filter((definition) => definition.category === category);
            if (shapes.length === 0) return null;
            return (
              <details
                key={`${category}-${normalizedQuery ? 'search' : 'browse'}`}
                className="shape-category"
                open={Boolean(normalizedQuery) || openCategories.has(category)}
                onToggle={(event) => {
                  if (normalizedQuery) return;
                  const expanded = event.currentTarget.open;
                  setOpenCategories((current) => {
                    const next = new Set(current);
                    if (expanded) next.add(category);
                    else next.delete(category);
                    return next;
                  });
                }}
              >
                <summary>
                  <span>{SHAPE_CATEGORY_LABELS[category]}</span>
                  <small>{shapes.length}</small>
                </summary>
                <div className="shape-grid">
                  {shapes.map((definition) => (
                    <button
                      key={definition.kind}
                      className="shape-item"
                      draggable
                      title={`${definition.label} (${definition.standardName})`}
                      onDragStart={(event) => handleDragStart(event, definition.kind)}
                      onClick={() => onAddShape(definition.kind)}
                    >
                      <span className="shape-item__preview">
                        <ShapeVisual kind={definition.kind} strokeWidth={1.25} radius={8} />
                      </span>
                      <span>{definition.label}</span>
                    </button>
                  ))}
                </div>
              </details>
            );
          })}
          {filteredShapes.length === 0 && <p className="panel-empty">没有匹配的图形</p>}
        </div>
      ) : (
        <div className="library-panel__body">
          <div className="template-list">
            {filteredTemplates.map((template) => (
              <button key={template.id} className="template-item" onClick={() => onLoadTemplate(template.id)}>
                <span className="template-item__meta">{template.category}</span>
                <strong>{template.name}</strong>
                <span>{template.description}</span>
                <small>{template.nodes.length} 个节点</small>
              </button>
            ))}
            {filteredTemplates.length === 0 && <p className="panel-empty">没有匹配的模板</p>}
          </div>
        </div>
      )}
    </aside>
  );
}
