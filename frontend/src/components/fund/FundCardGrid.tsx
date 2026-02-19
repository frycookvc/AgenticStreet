'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFunds } from '@/hooks/useFunds';
import { useScramble } from '@/hooks';
import { TypewriterCommand } from '@/components/ui';
import { FundCard } from './FundCard';
import type { Fund } from '@/types/fund';
import type { Address } from 'viem';

// ── Constants ──────────────────────────────────────────────────────

const PAGE_SIZE = 9;
const FULL_DIVIDER = '\u2500'.repeat(200);
const RECENT_DAYS = 5;

type FilterKey = 'recent' | 'min_raise_met' | 'erc8004';

// ── Placeholder funds (archived to _archive/placeholder-funds.ts) ──
// To restore design preview placeholders, import from _archive/placeholder-funds.ts

const PLACEHOLDER_FUNDS: Fund[] = [];

/* Original placeholder funds archived — first entry started with:
  {
    vault: '0x0000000000000000000000000000000000000001' as Address,
    raise: '0x0000000000000000000000000000000000000001' as Address,
    manager: '0x0000000000000000000000000000000000000001' as Address,
    status: 'raising',
    totalDeposited: '35000000000',
    vaultBalance: '35000000000',
    maxRaise: '100000000000',
    minRaise: '20000000000',
    depositEnd: now + 86400 * 12,
    managementFeeBps: 200,
    performanceFeeBps: 2000,
    fundDuration: 86400 * 90,
    metadataURI: '',
    metadata: {
      name: 'ETH Momentum Alpha',
      description: 'Systematic momentum strategy targeting ETH and correlated L2 tokens with automated rebalancing and trailing stop-losses across multiple timeframes on Base mainnet',
      managerName: 'agent_0x7f',
      managerDescription: 'Autonomous momentum trader',
      strategyType: 'momentum',
      riskLevel: 'medium',
      expectedDuration: '90 days',
      version: '1.0.0',
      erc8004: { verified: true, agentId: 'agent_0x7f' },
    },
  },
  {
    vault: '0x0000000000000000000000000000000000000002' as Address,
    raise: '0x0000000000000000000000000000000000000002' as Address,
    manager: '0x0000000000000000000000000000000000000002' as Address,
    status: 'raising',
    totalDeposited: '80000000000',
    vaultBalance: '80000000000',
    maxRaise: '250000000000',
    minRaise: '50000000000',
    depositEnd: now + 86400 * 8,
    managementFeeBps: 150,
    performanceFeeBps: 1500,
    fundDuration: 86400 * 180,
    metadataURI: '',
    metadata: {
      name: 'DeFi Yield Optimizer',
      description: 'Automated yield farming across Aave, Compound, and Morpho with risk-adjusted position sizing and automatic compounding of rewards into the highest-yielding vaults',
      managerName: 'yield_maxi_9k',
      managerDescription: 'Yield optimization specialist',
      strategyType: 'yield-farming',
      riskLevel: 'low',
      expectedDuration: '180 days',
      version: '1.0.0',
      erc8004: { verified: true, agentId: 'yield_maxi_9k' },
    },
  },
  {
    vault: '0x0000000000000000000000000000000000000003' as Address,
    raise: '0x0000000000000000000000000000000000000003' as Address,
    manager: '0x0000000000000000000000000000000000000003' as Address,
    status: 'raising',
    totalDeposited: '5000000000',
    vaultBalance: '5000000000',
    maxRaise: '50000000000',
    minRaise: '10000000000',
    depositEnd: now + 86400 * 21,
    managementFeeBps: 300,
    performanceFeeBps: 2500,
    fundDuration: 86400 * 60,
    metadataURI: '',
    metadata: {
      name: 'Base L2 Degen Play',
      description: 'High-conviction bets on early Base ecosystem tokens with strict stop-loss automation and dynamic position sizing based on onchain liquidity depth analysis',
      managerName: 'degen_bot_42',
      managerDescription: 'High-risk alpha hunter',
      strategyType: 'directional',
      riskLevel: 'high',
      expectedDuration: '60 days',
      version: '1.0.0',
    },
  },
  {
    vault: '0x0000000000000000000000000000000000000004' as Address,
    raise: '0x0000000000000000000000000000000000000004' as Address,
    manager: '0x0000000000000000000000000000000000000004' as Address,
    status: 'active',
    totalDeposited: '120000000000',
    vaultBalance: '95000000000',
    maxRaise: '200000000000',
    minRaise: '100000000000',
    depositEnd: now - 86400 * 3,
    managementFeeBps: 100,
    performanceFeeBps: 1000,
    fundDuration: 86400 * 365,
    metadataURI: '',
    metadata: {
      name: 'Stablecoin Delta Neutral',
      description: 'Market-neutral strategy exploiting funding rate differentials across perpetual exchanges with automated hedging and basis trade execution on Hyperliquid and dYdX',
      managerName: 'delta_zero',
      managerDescription: 'Delta-neutral strategist',
      strategyType: 'delta-neutral',
      riskLevel: 'low',
      expectedDuration: '365 days',
      version: '1.0.0',
      erc8004: { verified: true, agentId: 'delta_zero' },
    },
  },
  {
    vault: '0x0000000000000000000000000000000000000005' as Address,
    raise: '0x0000000000000000000000000000000000000005' as Address,
    manager: '0x0000000000000000000000000000000000000005' as Address,
    status: 'raising',
    totalDeposited: '15000000000',
    vaultBalance: '15000000000',
    maxRaise: '75000000000',
    minRaise: '15000000000',
    depositEnd: now + 86400 * 5,
    managementFeeBps: 250,
    performanceFeeBps: 2000,
    fundDuration: 86400 * 120,
    metadataURI: '',
    metadata: {
      name: 'Cross-Chain Arb',
      description: 'Atomic cross-chain arbitrage between Base, Optimism, and Arbitrum DEX liquidity pools with sub-second execution via intent-based bridging and MEV-protected routing',
      managerName: 'arb_agent_v3',
      managerDescription: 'Cross-chain arbitrageur',
      strategyType: 'arbitrage',
      riskLevel: 'medium',
      expectedDuration: '120 days',
      version: '1.0.0',
      erc8004: { verified: true, agentId: 'arb_agent_v3' },
    },
  },
  {
    vault: '0x0000000000000000000000000000000000000006' as Address,
    raise: '0x0000000000000000000000000000000000000006' as Address,
    manager: '0x0000000000000000000000000000000000000006' as Address,
    status: 'raising',
    totalDeposited: '0',
    vaultBalance: '0',
    maxRaise: '30000000000',
    minRaise: '5000000000',
    depositEnd: now + 86400 * 30,
    managementFeeBps: 200,
    performanceFeeBps: 1800,
    fundDuration: 86400 * 45,
    metadataURI: '',
    metadata: {
      name: 'PolyMarket Sentiment',
      description: 'Prediction market alpha by aggregating on-chain sentiment signals from PolyMarket orderbooks combined with real-time news analysis and automated position management',
      managerName: 'oracle_mind',
      managerDescription: 'Prediction market analyst',
      strategyType: 'sentiment',
      riskLevel: 'high',
      expectedDuration: '45 days',
      version: '1.0.0',
    },
  },
  {
    vault: '0x0000000000000000000000000000000000000007' as Address,
    raise: '0x0000000000000000000000000000000000000007' as Address,
    manager: '0x0000000000000000000000000000000000000007' as Address,
    status: 'active',
    totalDeposited: '200000000000',
    vaultBalance: '180000000000',
    maxRaise: '500000000000',
    minRaise: '100000000000',
    depositEnd: now - 86400 * 10,
    managementFeeBps: 100,
    performanceFeeBps: 1200,
    fundDuration: 86400 * 270,
    metadataURI: '',
    metadata: {
      name: 'Blue Chip Index',
      description: 'Weighted index of top 10 crypto assets by market cap with quarterly rebalancing schedule and automatic dividend reinvestment across blue chip DeFi protocols',
      managerName: 'index_protocol',
      managerDescription: 'Index fund operator',
      strategyType: 'index',
      riskLevel: 'low',
      expectedDuration: '270 days',
      version: '1.0.0',
      erc8004: { verified: true, agentId: 'index_protocol' },
    },
  },
  {
    vault: '0x0000000000000000000000000000000000000008' as Address,
    raise: '0x0000000000000000000000000000000000000008' as Address,
    manager: '0x0000000000000000000000000000000000000008' as Address,
    status: 'raising',
    totalDeposited: '42000000000',
    vaultBalance: '42000000000',
    maxRaise: '100000000000',
    minRaise: '25000000000',
    depositEnd: now + 86400 * 15,
    managementFeeBps: 175,
    performanceFeeBps: 1800,
    fundDuration: 86400 * 150,
    metadataURI: '',
    metadata: {
      name: 'Hyperliquid Perps',
      description: 'Leveraged perpetual futures strategy on Hyperliquid with dynamic hedging and position limits using real-time volatility surface modeling and automated take-profit levels',
      managerName: 'perp_runner',
      managerDescription: 'Perpetual futures trader',
      strategyType: 'perpetuals',
      riskLevel: 'high',
      expectedDuration: '150 days',
      version: '1.0.0',
    },
  },
  {
    vault: '0x0000000000000000000000000000000000000009' as Address,
    raise: '0x0000000000000000000000000000000000000009' as Address,
    manager: '0x0000000000000000000000000000000000000009' as Address,
    status: 'raising',
    totalDeposited: '60000000000',
    vaultBalance: '60000000000',
    maxRaise: '150000000000',
    minRaise: '30000000000',
    depositEnd: now + 86400 * 18,
    managementFeeBps: 200,
    performanceFeeBps: 2000,
    fundDuration: 86400 * 90,
    metadataURI: '',
    metadata: {
      name: 'MEV Extraction Fund',
      description: 'Captures MEV opportunities on Base through backrunning and liquidation strategies onchain with proprietary transaction simulation and gas optimization algorithms',
      managerName: 'mev_agent_x',
      managerDescription: 'MEV extraction specialist',
      strategyType: 'mev',
      riskLevel: 'medium',
      expectedDuration: '90 days',
      version: '1.0.0',
      erc8004: { verified: true, agentId: 'mev_agent_x' },
    },
  },
  {
    vault: '0x000000000000000000000000000000000000000a' as Address,
    raise: '0x000000000000000000000000000000000000000a' as Address,
    manager: '0x000000000000000000000000000000000000000a' as Address,
    status: 'raising',
    totalDeposited: '28000000000',
    vaultBalance: '28000000000',
    maxRaise: '80000000000',
    minRaise: '20000000000',
    depositEnd: now + 86400 * 25,
    managementFeeBps: 150,
    performanceFeeBps: 1600,
    fundDuration: 86400 * 120,
    metadataURI: '',
    metadata: {
      name: 'Onchain Options Vault',
      description: 'Automated covered call and put selling strategies using onchain options protocols on Base with dynamic strike selection based on implied volatility term structure',
      managerName: 'vol_surface',
      managerDescription: 'Options volatility trader',
      strategyType: 'options',
      riskLevel: 'medium',
      expectedDuration: '120 days',
      version: '1.0.0',
    },
  },
  {
    vault: '0x000000000000000000000000000000000000000b' as Address,
    raise: '0x000000000000000000000000000000000000000b' as Address,
    manager: '0x000000000000000000000000000000000000000b' as Address,
    status: 'active',
    totalDeposited: '500000000000',
    vaultBalance: '420000000000',
    maxRaise: '500000000000',
    minRaise: '250000000000',
    depositEnd: now - 86400 * 30,
    managementFeeBps: 100,
    performanceFeeBps: 1500,
    fundDuration: 86400 * 365,
    metadataURI: '',
    metadata: {
      name: 'Base Ecosystem Fund',
      description: 'Diversified long-only portfolio across the Base ecosystem including infrastructure tokens, DeFi protocols, and NFT platforms with quarterly rebalancing and risk parity weighting',
      managerName: 'base_capital',
      managerDescription: 'Ecosystem fund operator',
      strategyType: 'long-only',
      riskLevel: 'medium',
      expectedDuration: '365 days',
      version: '1.0.0',
  ...archived (11 funds) — see _archive/placeholder-funds.ts
*/

// ── Inline filter toggle (no border, pipe-separated) ───────────────

function InlineFilterToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const scramble = useScramble(label, { duration: 500, autoStart: false });

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => scramble.trigger()}
      onMouseLeave={() => scramble.trigger()}
      className={`text-[0.75rem] font-medium uppercase tracking-[0.1em] whitespace-nowrap px-3 py-0.5 rounded-sm ${
        active
          ? 'text-primary bg-primary-surface'
          : 'text-text-tertiary hover:text-primary'
      }`}
    >
      {scramble.text}
    </button>
  );
}

// ── Pagination ─────────────────────────────────────────────────────

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Show up to 5 page numbers
  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-2 mt-10 text-[12px] uppercase tracking-[0.1em]">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-2 py-1 text-text-tertiary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
      >
        &lt;
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          className={`px-2 py-1 rounded-sm border ${
            p === currentPage
              ? 'text-primary border-primary'
              : 'text-text-tertiary border-transparent hover:text-primary'
          }`}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-2 py-1 text-text-tertiary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
      >
        &gt;
      </button>
    </div>
  );
}

// ── Filter logic ───────────────────────────────────────────────────

function applyFilters(
  funds: Fund[],
  search: string,
  filters: Set<FilterKey>,
): Fund[] {
  let result = funds;

  // Search filter (name, agent, strategy, description)
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter((f) => {
      const name = f.metadata?.name?.toLowerCase() ?? '';
      const agent = f.metadata?.managerName?.toLowerCase() ?? '';
      const strategy = f.metadata?.strategyType?.toLowerCase() ?? '';
      const desc = f.metadata?.description?.toLowerCase() ?? '';
      return name.includes(q) || agent.includes(q) || strategy.includes(q) || desc.includes(q);
    });
  }

  // Toggle filters (AND logic)
  if (filters.has('recent')) {
    const cutoff = Math.floor(Date.now() / 1000) - RECENT_DAYS * 86400;
    result = result.filter((f) => f.depositEnd > cutoff);
  }

  if (filters.has('min_raise_met')) {
    result = result.filter((f) => BigInt(f.totalDeposited) >= BigInt(f.minRaise));
  }

  if (filters.has('erc8004')) {
    result = result.filter((f) => f.metadata?.erc8004?.verified === true);
  }

  return result;
}

// ── Section header (terminal command + divider) ────────────────────

const FUND_COMMAND = '$ ls -la ./funds/ --status=active --sort=deposits';
const FUND_COMMAND_SEGMENTS = [
  { start: 0, end: 2, className: 'text-primary' },                    // "$ "
  { start: 2, end: 4, className: 'text-text-primary font-medium' },   // "ls"
  { start: 4, end: 8, className: 'text-text-secondary' },             // " -la"
  { start: 8, end: 17, className: 'text-text-secondary' },            // " ./funds/"
  { start: 17, end: 33, className: 'text-text-tertiary' },            // " --status=active"
  { start: 33, end: Infinity, className: 'text-text-tertiary' },      // " --sort=deposits"
];

function FundGridHeader() {
  return (
    <div className="mb-10">
      {/* Full-width divider */}
      <div className="overflow-hidden whitespace-nowrap text-text-muted mb-6">
        {FULL_DIVIDER}
      </div>
      {/* Command line with typewriter + blinking cursor */}
      <TypewriterCommand
        command={FUND_COMMAND}
        segments={FUND_COMMAND_SEGMENTS}
        retypeInterval={60_000}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export function FundCardGrid() {
  const { data: funds, loading, error } = useFunds();
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [page, setPage] = useState(1);
  const [visibleCards, setVisibleCards] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Use placeholder funds when API returns null or empty array
  const displayFunds = funds && funds.length > 0 ? funds : PLACEHOLDER_FUNDS;

  // Toggle a filter
  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPage(1);
  }, []);

  // Reset page on search change
  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  // Filter → sort → paginate
  const filtered = useMemo(() => {
    const result = applyFilters(displayFunds, search, activeFilters);
    // Sort by totalDeposited descending
    return result.sort((a, b) => {
      const aVal = BigInt(a.totalDeposited);
      const bVal = BigInt(b.totalDeposited);
      if (bVal > aVal) return 1;
      if (bVal < aVal) return -1;
      return 0;
    });
  }, [displayFunds, search, activeFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // IntersectionObserver for scroll-triggered scramble
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const newVisible = new Set<string>();
        for (const entry of entries) {
          if (entry.isIntersecting) {
            newVisible.add(entry.target.getAttribute('data-vault') ?? '');
          }
        }
        if (newVisible.size > 0) {
          setVisibleCards((prev) => {
            const merged = new Set(prev);
            for (const v of newVisible) merged.add(v);
            return merged;
          });
        }
      },
      { threshold: 0.2 },
    );

    const refs = cardRefs.current;
    for (const el of refs.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [paginated]);

  // Ref callback for card elements
  const setCardRef = useCallback((vault: string, el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(vault, el);
    } else {
      cardRefs.current.delete(vault);
    }
  }, []);

  return (
    <section id="funds" className="px-4 pt-10 pb-24 sm:px-6 sm:pt-[104px] lg:px-8 lg:pl-12 lg:pr-12">
      {/* Terminal command header */}
      <FundGridHeader />

      {/* Unified search + filter bar */}
      <div
        className="flex items-center rounded-sm border border-border-default bg-canvas-base text-[0.8125rem] mb-8 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Search section */}
        <span className="text-text-tertiary pl-4">&gt;</span>
        <span className="text-text-tertiary ml-1.5 whitespace-nowrap">search:</span>
        <div className="flex-1 ml-2 py-3.5 pr-2">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder=" start typing..."
            className="w-full bg-transparent text-text-primary placeholder:text-text-secondary outline-none"
          />
        </div>

        {/* Pipe separator */}
        <span className="text-border-default text-lg">|</span>

        {/* Inline filter toggles */}
        <div className="flex items-center gap-1 px-3 py-2">
          <InlineFilterToggle
            label="RECENT"
            active={activeFilters.has('recent')}
            onClick={() => toggleFilter('recent')}
          />
          <InlineFilterToggle
            label="MIN_RAISE_MET"
            active={activeFilters.has('min_raise_met')}
            onClick={() => toggleFilter('min_raise_met')}
          />
          <InlineFilterToggle
            label="ERC-8004"
            active={activeFilters.has('erc8004')}
            onClick={() => toggleFilter('erc8004')}
          />
        </div>
      </div>

      {/* Empty filter result (only when filters/search produce zero from real data) */}
      {!loading && funds && funds.length > 0 && filtered.length === 0 && (
        <div className="text-[0.8125rem] text-text-muted py-12 text-center">
          <span className="text-primary">&gt;</span> no funds found
        </div>
      )}

      {/* Fund grid — always renders (placeholders while loading / no server) */}
      {paginated.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:grid-rows-3">
          {paginated.map((fund) => (
            <div
              key={fund.vault}
              data-vault={fund.vault}
              ref={(el) => setCardRef(fund.vault, el)}
            >
              <FundCard fund={fund} visible={visibleCards.has(fund.vault)} />
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </section>
  );
}
