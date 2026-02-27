import { useState } from 'react';
import { Pencil, Trash2, Star, Terminal, Zap } from 'lucide-react';
import type { LibraryCommand } from '@shared/types';
import { DeleteCommandModal } from './DeleteCommandModal';

interface CommandItemProps {
  command: LibraryCommand;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onToggleDefault: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onInvoke?: () => void;
}

export function CommandItem({
  command,
  enabled,
  onToggle,
  onToggleDefault,
  onEdit,
  onDelete,
  onInvoke,
}: CommandItemProps) {
  const [showActions, setShowActions] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isCommand = command.type === 'command';
  const isSkill = command.type === 'skill';

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(!enabled);
  };

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCommand && onInvoke) {
      // Commands: clicking name invokes the command
      onInvoke();
    } else {
      // Skills: clicking name toggles
      onToggle(!enabled);
    }
  };

  const handleRowClick = () => {
    // For skills, clicking anywhere toggles
    if (isSkill) {
      onToggle(!enabled);
    }
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

  const Icon = isCommand ? Terminal : Zap;

  return (
    <div
      className="group relative flex items-center gap-2 px-3.5 py-[6px] rounded-md text-[13px] hover:bg-accent/50 transition-all duration-150"
      style={{ cursor: isSkill ? 'pointer' : 'default' }}
      onClick={isSkill ? handleRowClick : undefined}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Toggle icon (Terminal for commands, Zap for skills) */}
      <button
        onClick={handleToggle}
        className="flex-shrink-0"
        title={enabled ? 'Disable for this task' : 'Enable for this task'}
      >
        <Icon
          size={12}
          strokeWidth={1.8}
          className={`transition-colors ${
            enabled ? 'text-emerald-400' : 'text-muted-foreground/40'
          }`}
        />
      </button>

      {/* Command/Skill name */}
      <button
        onClick={handleNameClick}
        className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-muted-foreground hover:text-foreground transition-colors"
        title={isCommand ? `Click to invoke ${command.displayName}` : command.displayName}
        style={{ cursor: isCommand || isSkill ? 'pointer' : 'default' }}
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
