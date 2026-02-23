'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { WindowChrome } from '@/components/ui';
import { useScramble } from '@/hooks';
import { formatUSDC, daysRemaining, formatDate, toSnakeCaseFund } from '@/lib/format';
import { Erc8004Badge } from './Erc8004Badge';
import type { Fund } from '@/types/fund';

// ── Line component ─────────────────────────────────────────────────

function TermLine({
  lineNum,
  prompt,
  label,
  children,
}: {
  lineNum: number;
  prompt?: boolean;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline text-[0.8125rem] leading-[1.8] overflow-hidden whitespace-nowrap">
      <span className="w-6 shrink-0 text-right text-[12px] text-text-muted mr-2">
        {lineNum}
      </span>
      {prompt && <span className="shrink-0 text-primary mr-1">&gt;</span>}
      {label && (
        <span className="shrink-0 text-accent mr-1">
          {label}
        </span>
      )}
      <span className="overflow-hidden">{children}</span>
    </div>
  );
}

// ── Continuation line (no prompt, just indented) ────────────────────

function ContLine({
  lineNum,
  children,
}: {
  lineNum: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline text-[0.8125rem] leading-[1.8] overflow-hidden whitespace-nowrap">
      <span className="w-6 shrink-0 text-right text-[12px] text-text-muted mr-2">
        {lineNum}
      </span>
      <span className="pl-5 text-text-primary overflow-hidden whitespace-nowrap flex items-baseline min-w-0">{children}</span>
    </div>
  );
}

// ── Word-boundary-aware text splitter ────────────────────────────────

/** Split text into lines of up to `maxChars`, breaking at word boundaries. */
function splitAtWords(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (lines.length >= maxLines) break;
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines;
}

// ── Main component ─────────────────────────────────────────────────

interface FundCardProps {
  fund: Fund;
  visible: boolean;
}

export function FundCard({ fund, visible }: FundCardProps) {
  const name = fund.metadata?.name ?? 'Unnamed Fund';
  const agent = fund.metadata?.managerName ?? 'unknown';
  const strategy = fund.metadata?.strategyType ?? 'unknown';
  const description = fund.metadata?.description ?? '';
  const verified = fund.metadata?.erc8004?.verified ?? false;
  const agentId = fund.metadata?.erc8004?.agentId;

  // Split description at word boundaries; line 3 is generous — CSS truncates overflow
  const desc = description || 'No description';
  const descLines = splitAtWords(desc, 55, 3);
  const descLine1 = descLines[0] ?? '';
  const descLine2 = descLines[1] ?? '';
  // Line 3: take all remaining text after lines 1+2; CSS will clip what doesn't fit
  const usedChars = descLine1.length + (descLine2 ? descLine2.length + 1 : 0);
  const descLine3 = desc.length > usedChars ? desc.slice(usedChars).trimStart() : '';

  const days = daysRemaining(fund.depositEnd);
  const closeDate = formatDate(fund.depositEnd);

  // Scramble title on visibility
  const titleScramble = useScramble(toSnakeCaseFund(name), {
    duration: 800,
    autoStart: false,
  });

  // Trigger scramble once when card scrolls into view
  const hasTriggeredRef = useRef(false);
  const triggerTitle = titleScramble.trigger;
  useEffect(() => {
    if (visible && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      triggerTitle();
    }
  }, [visible, triggerTitle]);

  return (
    <Link href={`/fund/${fund.vault}`} className="block group">
      <div className="transition-colors border border-border-default rounded-sm hover:border-primary-border">
        <WindowChrome
          title={titleScramble.text}
          rightSlot={<Erc8004Badge verified={verified} agentId={agentId} />}
        >
          {/* Card body */}
          <div className="px-4 py-3">
            <TermLine lineNum={1} prompt label="agent:">
              <span className="text-text-primary">&quot;{agent}&quot;</span>
            </TermLine>
            <TermLine lineNum={2} prompt label="strategy:">
              <span className="text-text-primary">&quot;{strategy}&quot;</span>
            </TermLine>
            <TermLine lineNum={3} prompt label="description:">
              <span />
            </TermLine>
            <ContLine lineNum={4}>
              &quot;{descLine1}
            </ContLine>
            <ContLine lineNum={5}>
              {descLine2 || '\u00A0'}
            </ContLine>
            <ContLine lineNum={6}>
              <span className="overflow-hidden whitespace-nowrap min-w-0" style={{ textOverflow: 'clip' }}>
                {descLine3}
              </span>
              <span className="shrink-0 text-text-tertiary group-hover:text-primary transition-colors">&nbsp;...more</span>
              <span className="shrink-0">&quot;</span>
            </ContLine>
            <TermLine lineNum={7} prompt label="min_raise:">
              <span className="text-primary">{formatUSDC(fund.minRaise)} USDC</span>
            </TermLine>
          </div>

          {/* Footer — suppressHydrationWarning: daysRemaining uses Date.now() */}
          <div suppressHydrationWarning className="border-t border-border-subtle px-4 py-2 text-[11px] font-normal tracking-[0.02em] leading-[1.4] text-text-tertiary">
            {fund.status === 'raising' && days > 0
              ? `raise closes: ${closeDate} · ${days}d left`
              : fund.status === 'active'
                ? `deployed: ${closeDate}`
                : `raise closed: ${closeDate}`}
          </div>
        </WindowChrome>
      </div>
    </Link>
  );
}
