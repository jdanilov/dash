import { useState } from 'react';
import { Trash2, Star, Server } from 'lucide-react';
import type { LibraryMcp } from '@shared/types';

interface McpItemProps {
  mcp: LibraryMcp;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onToggleDefault: (enabled: boolean) => void;
  onDelete: () => void;
}

export function McpItem({ mcp, enabled, onToggle, onToggleDefault, onDelete }: McpItemProps) {
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
    onToggleDefault(!mcp.enabledByDefault);
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
        <Server
          size={12}
          strokeWidth={1.8}
          className={`transition-colors ${enabled ? 'text-sky-400' : 'text-muted-foreground/40'}`}
        />
      </button>

      {/* MCP name */}
      <div className="flex-1 overflow-hidden min-w-0">
        <div className="text-muted-foreground hover:text-foreground transition-colors truncate">
          {mcp.name}
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
            mcp.enabledByDefault ? 'text-amber-500' : 'text-muted-foreground'
          }`}
          title={mcp.enabledByDefault ? 'Enabled by default' : 'Disabled by default'}
        >
          <Star size={12} strokeWidth={1.8} fill={mcp.enabledByDefault ? 'currentColor' : 'none'} />
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-destructive"
          title="Remove MCP"
        >
          <Trash2 size={12} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
