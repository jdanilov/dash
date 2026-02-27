import { useState } from 'react';
import { Pencil, Trash2, Star } from 'lucide-react';
import type { LibraryCommand } from '@shared/types';

interface CommandItemProps {
  command: LibraryCommand;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onToggleDefault: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function CommandItem({
  command,
  enabled,
  onToggle,
  onToggleDefault,
  onEdit,
  onDelete,
}: CommandItemProps) {
  const [showActions, setShowActions] = useState(false);

  const handleClick = () => {
    onToggle(!enabled);
  };

  const handleToggleDefault = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleDefault(!command.enabledByDefault);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete command ${command.displayName}?`)) {
      onDelete();
    }
  };

  return (
    <div
      className="group relative flex items-center gap-2 px-3 py-2 hover:bg-surface-1"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Toggle circle */}
      <button
        onClick={handleClick}
        className="flex-shrink-0"
        title={enabled ? 'Disable for this task' : 'Enable for this task'}
      >
        <div
          className={`h-3 w-3 rounded-full border-2 transition-colors ${
            enabled ? 'border-primary bg-primary' : 'border-muted-foreground bg-transparent'
          }`}
        />
      </button>

      {/* Command name */}
      <button
        onClick={handleClick}
        className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm text-foreground"
        title={command.displayName}
      >
        {command.displayName}
      </button>

      {/* Actions */}
      <div className={`flex items-center gap-1 ${showActions ? 'opacity-100' : 'opacity-0'}`}>
        {/* Default star */}
        <button
          onClick={handleToggleDefault}
          className={`rounded p-1 transition-colors hover:bg-surface-2 ${
            command.enabledByDefault ? 'text-amber-500' : 'text-muted-foreground'
          }`}
          title={command.enabledByDefault ? 'Enabled by default' : 'Disabled by default'}
        >
          <Star size={14} fill={command.enabledByDefault ? 'currentColor' : 'none'} />
        </button>

        {/* Edit */}
        <button
          onClick={handleEdit}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          title="Open in editor"
        >
          <Pencil size={14} />
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-destructive"
          title="Delete command"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
