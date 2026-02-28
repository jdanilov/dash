import { useState } from 'react';
import { Pencil, Trash2, Star, User } from 'lucide-react';
import type { LibraryCommand } from '@shared/types';

interface MetapromptItemProps {
  metaprompt: LibraryCommand;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onToggleDefault: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MetapromptItem({
  metaprompt,
  enabled,
  onToggle,
  onToggleDefault,
  onEdit,
  onDelete,
}: MetapromptItemProps) {
  const [showActions, setShowActions] = useState(false);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(!enabled);
  };

  const handleRowClick = () => {
    onToggle(!enabled);
  };

  const handleToggleDefault = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleDefault(!metaprompt.enabledByDefault);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div
      className="group relative flex items-center gap-2 px-3.5 py-[6px] rounded-md text-[13px] hover:bg-accent/50 transition-all duration-150 cursor-pointer"
      onClick={handleRowClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Toggle icon */}
      <button
        onClick={handleToggle}
        className="flex-shrink-0"
        title={enabled ? 'Disable for this task' : 'Enable for this task'}
      >
        <User
          size={12}
          strokeWidth={1.8}
          className={`transition-colors ${
            enabled ? 'text-violet-400' : 'text-muted-foreground/40'
          }`}
        />
      </button>

      {/* Metaprompt name */}
      <div className="flex-1 overflow-hidden min-w-0">
        <div className="text-muted-foreground hover:text-foreground transition-colors truncate">
          {metaprompt.displayName}
        </div>
      </div>

      {/* Actions */}
      <div
        className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Default star */}
        <button
          onClick={handleToggleDefault}
          className={`rounded p-0.5 transition-colors hover:bg-surface-2 ${
            metaprompt.enabledByDefault ? 'text-amber-500' : 'text-muted-foreground'
          }`}
          title={metaprompt.enabledByDefault ? 'Enabled by default' : 'Disabled by default'}
        >
          <Star
            size={12}
            strokeWidth={1.8}
            fill={metaprompt.enabledByDefault ? 'currentColor' : 'none'}
          />
        </button>

        {/* Edit */}
        <button
          onClick={handleEdit}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          title="Open in editor"
        >
          <Pencil size={12} strokeWidth={1.8} />
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-destructive"
          title="Remove metaprompt"
        >
          <Trash2 size={12} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
