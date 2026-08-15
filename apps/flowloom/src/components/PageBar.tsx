import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useFlowStore } from '../store/flowStore';
import { IconButton } from './IconButton';

export function PageBar({ onPageChange }: { onPageChange: () => void }) {
  const pages = useFlowStore((state) => state.pages);
  const activePageId = useFlowStore((state) => state.activePageId);
  const addPage = useFlowStore((state) => state.addPage);
  const duplicatePage = useFlowStore((state) => state.duplicatePage);
  const deletePage = useFlowStore((state) => state.deletePage);
  const renamePage = useFlowStore((state) => state.renamePage);
  const switchPage = useFlowStore((state) => state.switchPage);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const beginRename = (page = activePage) => {
    if (!page) return;
    setEditingId(page.id);
    setDraft(page.name);
  };

  const finishRename = () => {
    if (editingId && draft.trim()) renamePage(editingId, draft);
    setEditingId(null);
  };

  const handleRenameKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') finishRename();
    if (event.key === 'Escape') setEditingId(null);
  };

  const changePage = (id: string) => {
    switchPage(id);
    window.requestAnimationFrame(onPageChange);
  };

  return (
    <nav className="page-bar" aria-label="页面">
      <div className="page-bar__tabs" role="tablist" aria-label="图表页面">
        {pages.map((page) => (
          editingId === page.id ? (
            <span className="page-tab page-tab--editing" key={page.id}>
              <input
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={finishRename}
                onKeyDown={handleRenameKey}
                aria-label="页面名称"
              />
              <Check size={13} aria-hidden="true" />
            </span>
          ) : (
            <button
              key={page.id}
              role="tab"
              aria-selected={page.id === activePageId}
              className={`page-tab ${page.id === activePageId ? 'is-active' : ''}`}
              onClick={() => changePage(page.id)}
              onDoubleClick={() => beginRename(page)}
            >
              <span>{page.name}</span>
              <small>{page.nodes.length}</small>
            </button>
          )
        ))}
      </div>
      <div className="page-bar__actions">
        <IconButton label="新建页面" size="sm" icon={<Plus size={15} />} onClick={() => { addPage(); window.requestAnimationFrame(onPageChange); }} />
        <IconButton label="重命名页面" size="sm" icon={<Pencil size={14} />} onClick={() => beginRename()} />
        <IconButton label="复制页面" size="sm" icon={<Copy size={14} />} onClick={() => { duplicatePage(); window.requestAnimationFrame(onPageChange); }} />
        <IconButton
          label="删除页面"
          size="sm"
          icon={<Trash2 size={14} />}
          disabled={pages.length <= 1}
          onClick={() => {
            if (!activePage || !window.confirm(`确定删除“${activePage.name}”及其中的全部图形吗？`)) return;
            deletePage(activePage.id);
            window.requestAnimationFrame(onPageChange);
          }}
        />
        {editingId && <IconButton label="取消重命名" size="sm" icon={<X size={14} />} onClick={() => setEditingId(null)} />}
      </div>
    </nav>
  );
}
