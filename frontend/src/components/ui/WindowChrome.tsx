'use client';

import type { ReactNode } from 'react';

interface WindowChromeProps {
  title: string;
  children: ReactNode;
  rightSlot?: ReactNode;
}

export function WindowChrome({ title, children, rightSlot }: WindowChromeProps) {
  return (
    <div className="overflow-hidden rounded-sm border border-border-default bg-canvas-surface shadow-elevation-sm">
      {/* Chrome bar */}
      <div className="flex items-center border-b border-border-subtle bg-canvas-elevated px-4 py-2.5">
        <span className="shrink-0 whitespace-nowrap select-none text-xs font-medium text-text-muted">
          [x][-][+]
        </span>
        <span className="ml-3 max-w-[30ch] truncate text-[0.875rem] font-normal tracking-[0.02em] text-text-secondary">{title}</span>
        {rightSlot && <div className="ml-auto shrink-0">{rightSlot}</div>}
      </div>

      {/* Body — no padding; children manage their own */}
      {children}
    </div>
  );
}
