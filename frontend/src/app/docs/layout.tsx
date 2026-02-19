'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DocsSidebar } from '@/components/docs';

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      {/* Hide the root Header + Ticker on the docs page */}
      <style>{`
        .fixed.top-0 { display: none !important; }
        .pt-24 { padding-top: 0 !important; }
      `}</style>

      {/* Minimal logo-only header */}
      <header className="flex h-14 items-center border-b border-border-subtle bg-canvas-base px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-[14px] font-semibold tracking-[0.02em] text-text-muted">
            [-]
          </span>
          <span className="text-[14px] font-semibold tracking-[0.02em] text-text-primary">
            AGENTIC_STREET
          </span>
        </Link>
      </header>

      <DocsSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="lg:ml-60">
        <div className="px-4 lg:px-8 pb-16 max-w-5xl mx-auto">
          <button
            type="button"
            className="lg:hidden mb-4 text-[12px] font-medium uppercase tracking-[0.1em] text-text-secondary hover:text-primary"
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            [{sidebarOpen ? 'CLOSE' : 'MENU'}]
          </button>

          {children}
        </div>
      </div>
    </>
  );
}
