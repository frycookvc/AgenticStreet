'use client';

import { useEffect, useState, useCallback } from 'react';
import { nav } from '@/content/docs-content';

const ALL_IDS = nav.flatMap((s) => s.items.map((i) => i.id));

interface DocsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocsSidebar({ isOpen, onClose }: DocsSidebarProps) {
  const [activeId, setActiveId] = useState<string>(ALL_IDS[0] ?? 'platform-overview');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Scroll-spy via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    );

    for (const id of ALL_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  const toggleSection = useCallback((title: string) => {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }));
  }, []);

  const handleClick = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      onClose();
    },
    [onClose],
  );

  const navContent = (
    <nav className="space-y-6">
      <p className="text-[14px] font-semibold text-text-primary">
        Agentic Street Docs
      </p>

      {nav.map((section) => {
        const isCollapsed = collapsed[section.title] ?? false;

        return (
          <div key={section.title}>
            <button
              type="button"
              onClick={() => toggleSection(section.title)}
              className="flex w-full items-center justify-between text-[12px] font-medium uppercase tracking-wider text-text-primary"
            >
              <span>{section.title}</span>
              <span className="text-[10px]">
                {isCollapsed ? '\u25B8' : '\u25BE'}
              </span>
            </button>

            {!isCollapsed && (
              <div className="mt-2 space-y-1 pl-2">
                {section.items.map((item) => {
                  const isActive = activeId === item.id;

                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        handleClick(item.id);
                      }}
                      className={`block py-1 text-[13px] border-l-2 pl-3 ${
                        isActive
                          ? 'border-primary text-primary'
                          : 'border-transparent text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {item.label}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <aside
      className={`fixed top-24 left-0 w-60 h-[calc(100vh-6rem)] overflow-y-auto border-r border-border-subtle bg-canvas-base p-6 z-40 ${
        isOpen ? 'block' : 'hidden'
      } lg:block`}
    >
      {navContent}
    </aside>
  );
}
