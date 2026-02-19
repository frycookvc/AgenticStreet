'use client';

import { URLS } from '@/lib/constants';

interface Erc8004BadgeProps {
  verified: boolean;
  agentId?: string;
}

export function Erc8004Badge({ verified, agentId }: Erc8004BadgeProps) {
  const label = 'ERC-8004';

  if (verified && agentId) {
    return (
      <span
        role="link"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          window.open(`${URLS.ERC8004_AGENT}${agentId}`, '_blank', 'noopener,noreferrer');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            window.open(`${URLS.ERC8004_AGENT}${agentId}`, '_blank', 'noopener,noreferrer');
          }
        }}
        className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.08em] text-primary border border-primary-border rounded-sm px-1.5 py-0.5 hover:bg-primary-surface"
      >
        {label}
      </span>
    );
  }

  return (
    <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-text-muted border border-border-subtle rounded-sm px-1.5 py-0.5">
      {label}
    </span>
  );
}
