import React from 'react';
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from 'react-resizable-panels';
import { TerminalDrawer } from './TerminalDrawer';

interface ShellDrawerWrapperProps {
  enabled: boolean;
  taskId: string | null;
  cwd: string | null;
  collapsed: boolean;
  label?: string;
  panelRef: React.RefObject<ImperativePanelHandle>;
  animating: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  children: React.ReactNode;
}

export function ShellDrawerWrapper({
  enabled,
  taskId,
  cwd,
  collapsed,
  label,
  panelRef,
  animating,
  onCollapse,
  onExpand,
  children,
}: ShellDrawerWrapperProps) {
  if (!enabled || !taskId || !cwd) {
    return <>{children}</>;
  }

  return (
    <PanelGroup direction="vertical" className="h-full">
      <Panel minSize={20}>{children}</Panel>
      <PanelResizeHandle
        disabled={collapsed}
        className="h-5 flex items-end"
      >
        <div className="h-[1px] w-full bg-border" />
      </PanelResizeHandle>
      <Panel
        ref={panelRef}
        className={animating ? 'panel-transition' : ''}
        defaultSize={collapsed ? 3 : 25}
        minSize={8}
        maxSize={60}
        collapsible
        collapsedSize={3}
        onCollapse={onCollapse}
        onExpand={onExpand}
      >
        <TerminalDrawer
          key={taskId}
          taskId={taskId}
          cwd={cwd}
          collapsed={collapsed}
          label={label}
          onCollapse={() => panelRef.current?.collapse()}
          onExpand={() => panelRef.current?.expand()}
        />
      </Panel>
    </PanelGroup>
  );
}
