import { useState } from 'react';
import { Pencil, Trash2, Star } from 'lucide-react';
import type { LibraryCommand } from '@shared/types';
import { DeleteCommandModal } from './DeleteCommandModal';

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    onDelete();
  };

  return (
    <div
      className="group relative flex items-center gap-2 px-3.5 py-[6px] rounded-md text-[13px] hover:bg-accent/50 cursor-pointer transition-all duration-150"
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
          className={`w-[6px] h-[6px] rounded-full transition-colors ${
            enabled ? 'bg-emerald-400' : 'bg-muted-foreground/40'
          }`}
        />
      </button>

      {/* Command name */}
      <button
        onClick={handleClick}
        className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-muted-foreground hover:text-foreground transition-colors"
        title={command.displayName}
      >
        {command.displayName}
      </button>

      {/* Actions */}
      <div
        className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Default star */}
        <button
          onClick={handleToggleDefault}
          className={`rounded p-0.5 transition-colors hover:bg-surface-2 ${
            command.enabledByDefault ? 'text-amber-500' : 'text-muted-foreground'
          }`}
          title={command.enabledByDefault ? 'Enabled by default' : 'Disabled by default'}
        >
          <Star
            size={12}
            strokeWidth={1.8}
            fill={command.enabledByDefault ? 'currentColor' : 'none'}
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
          title="Delete command"
        >
          <Trash2 size={12} strokeWidth={1.8} />
        </button>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <DeleteCommandModal
          command={command}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}
