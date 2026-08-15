import { useEffect, useMemo, useRef, useState } from 'react';
import { Command, Search } from 'lucide-react';

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  shortcut?: string;
  keywords?: string;
  run: () => void;
}

export function CommandPalette({ open, commands, onClose }: { open: boolean; commands: PaletteCommand[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return commands;
    return commands.filter((command) => `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase().includes(term));
  }, [commands, query]);

  return (
    <dialog ref={dialogRef} className="command-dialog" onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="command-search">
        <Search size={18} aria-hidden="true" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索命令" aria-label="搜索命令" />
        <kbd>Esc</kbd>
      </div>
      <div className="command-list" role="listbox" aria-label="命令">
        {filtered.map((command, index) => (
          <button
            key={command.id}
            className="command-item"
            autoFocus={index === 0 && !query}
            onClick={() => { command.run(); onClose(); }}
          >
            <Command size={15} aria-hidden="true" />
            <span><small>{command.group}</small>{command.label}</span>
            {command.shortcut && <kbd>{command.shortcut}</kbd>}
          </button>
        ))}
        {filtered.length === 0 && <p className="command-empty">没有匹配的命令</p>}
      </div>
    </dialog>
  );
}
