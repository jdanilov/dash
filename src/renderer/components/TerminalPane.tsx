import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ArrowDown, ChevronUp, ChevronDown, X } from 'lucide-react';
import { sessionRegistry } from '../terminal/SessionRegistry';
import type { PermissionMode } from '../../shared/types';
import { loadKeybindings, matchesBinding } from '../keybindings';

const OVERLAY_MIN_MS = 2000;
const OVERLAY_FADE_MS = 300;

interface TerminalPaneProps {
  id: string;
  cwd: string;
  permissionMode?: PermissionMode;
}

export function TerminalPane({ id, cwd, permissionMode }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const hideOverlay = useCallback(() => {
    // Start fade-out
    setOverlayVisible(false);
    // Remove from DOM after transition
    setTimeout(() => setShowOverlay(false), OVERLAY_FADE_MS);
  }, []);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    const session = sessionRegistry.get(id);
    session?.clearSearch();
    session?.focus();
  }, [id]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const session = sessionRegistry.get(id);
        if (session) {
          if (e.shiftKey) {
            session.searchPrev();
          } else {
            session.searchNext();
          }
        }
      }
    },
    [id, closeSearch],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;
      setSearchQuery(query);
      const session = sessionRegistry.get(id);
      if (session && query) {
        session.search(query);
      } else if (session && !query) {
        session.clearSearch();
      }
    },
    [id],
  );

  const handleSearchPrev = useCallback(() => {
    const session = sessionRegistry.get(id);
    session?.searchPrev();
  }, [id]);

  const handleSearchNext = useCallback(() => {
    const session = sessionRegistry.get(id);
    session?.searchNext();
  }, [id]);

  const overlayStartRef = useRef(0);
  const keybindings = useMemo(() => loadKeybindings(), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Get or create session first so we can register callbacks
    // before the async attach() work detects a restart
    const session = sessionRegistry.getOrCreate({ id, cwd, permissionMode });

    session.onRestarting(() => {
      overlayStartRef.current = Date.now();
      setShowOverlay(true);
      setOverlayVisible(true);
    });

    session.onReady(() => {
      const elapsed = Date.now() - overlayStartRef.current;
      const remaining = Math.max(0, OVERLAY_MIN_MS - elapsed);
      setTimeout(hideOverlay, remaining);
    });

    session.onScrollStateChange(setIsAtBottom);

    // Now attach — the async work will call onRestarting/onReady as needed
    // After attach completes, scroll to bottom so user sees latest output
    let cancelled = false;
    session.attach(container).then(() => {
      if (!cancelled) {
        // Small delay to ensure terminal has rendered before scrolling
        requestAnimationFrame(() => {
          if (!cancelled) {
            session.scrollToBottom();
          }
        });
      }
    });

    return () => {
      cancelled = true;
      sessionRegistry.detach(id);
    };
  }, [id, cwd, permissionMode, hideOverlay]);

  // Keyboard handler for Cmd+F
  useEffect(() => {
    const searchBinding = keybindings.searchTerminal;
    if (!searchBinding) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesBinding(e, searchBinding)) {
        e.preventDefault();
        setShowSearch(true);
        // Focus input after render
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keybindings]);

  return (
    <div
      className={`w-full h-full relative transition-all duration-150 ${
        isDragOver ? 'ring-2 ring-inset ring-primary/30' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          const paths = Array.from(files).map((f) => (f as File & { path: string }).path);
          const session = sessionRegistry.get(id);
          if (session) {
            session.writeInput(paths.join(' '));
          }
        }
      }}
    >
      <div ref={containerRef} className="terminal-container w-full h-full" />
      {showSearch && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-md bg-surface-1/95 backdrop-blur-sm border border-border shadow-lg">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search..."
            className="w-48 px-2 py-1 text-[13px] bg-surface-0 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleSearchPrev}
            className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Previous match (Shift+Enter)"
          >
            <ChevronUp size={14} strokeWidth={1.8} />
          </button>
          <button
            onClick={handleSearchNext}
            className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Next match (Enter)"
          >
            <ChevronDown size={14} strokeWidth={1.8} />
          </button>
          <button
            onClick={closeSearch}
            className="p-1 rounded hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Close (Escape)"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
      )}
      {showOverlay && (
        <div
          className="absolute inset-0 z-10 pointer-events-none dark:bg-[#1f1f1f] bg-[#fafafa] flex flex-col items-center justify-center gap-4"
          style={{
            opacity: overlayVisible ? 1 : 0,
            transition: `opacity ${OVERLAY_FADE_MS}ms ease-out`,
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            className="w-16 h-16 opacity-60 animate-pulse"
          >
            <defs>
              <linearGradient id="restart-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#0a0a0a' }} />
                <stop offset="100%" style={{ stopColor: '#1a1a2e' }} />
              </linearGradient>
              <linearGradient id="restart-dash" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: '#00ff88' }} />
                <stop offset="100%" style={{ stopColor: '#00cc6a' }} />
              </linearGradient>
            </defs>
            <rect width="512" height="512" rx="108" fill="url(#restart-bg)" />
            <rect x="136" y="240" width="240" height="36" rx="18" fill="url(#restart-dash)" />
            <rect x="396" y="232" width="4" height="52" rx="2" fill="#00ff88" opacity="0.7" />
          </svg>
          <span className="text-[13px] dark:text-neutral-400 text-neutral-500 font-medium">
            Resuming your session...
          </span>
        </div>
      )}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/5 pointer-events-none animate-fade-in">
          <div className="px-4 py-2 rounded-lg bg-primary/15 text-primary text-[12px] font-medium">
            Drop files to paste paths
          </div>
        </div>
      )}
      {!isAtBottom && (
        <button
          onClick={() => {
            const session = sessionRegistry.get(id);
            session?.scrollToBottom();
          }}
          className="absolute bottom-4 right-4 z-10 w-8 h-8 rounded-full bg-accent/80 hover:bg-accent text-foreground/70 hover:text-foreground flex items-center justify-center shadow-md backdrop-blur-sm transition-all duration-150 hover:scale-105"
          title="Scroll to bottom"
        >
          <ArrowDown size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
