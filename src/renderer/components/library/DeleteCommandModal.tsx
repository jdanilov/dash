import React from 'react';
import { X, Trash2 } from 'lucide-react';
import type { LibraryCommand } from '../../../shared/types';

interface DeleteCommandModalProps {
  command: LibraryCommand;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteCommandModal({ command, onClose, onConfirm }: DeleteCommandModalProps) {
  function handleConfirm() {
    onConfirm();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border/60 rounded-xl shadow-2xl shadow-black/40 w-[420px] animate-slide-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 h-12 border-b border-border/60"
          style={{ background: 'hsl(var(--surface-2))' }}
        >
          <h2 className="text-[14px] font-semibold text-foreground">Delete Command</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground/50 hover:text-foreground transition-all duration-150"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="p-5">
          <p className="text-[13px] text-muted-foreground mb-1">
            Are you sure you want to delete this command from the library?
          </p>
          <p className="text-[13px] font-medium text-foreground mb-4">{command.displayName}</p>

          <p className="text-[12px] text-muted-foreground/70 mb-4">
            This will remove the command from all tasks. The source file will not be deleted.
          </p>

          {/* Action buttons */}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 h-8 rounded-lg text-[13px] font-medium text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 h-8 rounded-lg text-[13px] font-medium bg-destructive text-white hover:bg-destructive/90 transition-colors flex items-center gap-1.5"
            >
              <Trash2 size={13} strokeWidth={2} />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
