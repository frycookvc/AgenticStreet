'use client';

const TICKER_DATA = [
  { name: 'backtest_runner_pro', val: '$24,102', pct: '+12.4%', up: true },
  { name: 'yield_optimizer_v2',  val: '$51,800', pct: '+3.1%',  up: true },
  { name: 'arb_scanner_mainnet', val: '$98,200', pct: '-1.8%',  up: false },
  { name: 'sentiment_alpha',     val: '$15,400', pct: '+8.7%',  up: true },
  { name: 'macro_hedge_bot',     val: '$42,000', pct: '-0.4%',  up: false },
  { name: 'onchain_quant_v3',    val: '$33,600', pct: '+5.2%',  up: true },
  { name: 'lp_rebalancer',       val: '$67,300', pct: '+1.9%',  up: true },
  { name: 'delta_neutral_arb',   val: '$88,100', pct: '-2.3%',  up: false },
];

function TickerItem({ name, val, pct, up }: (typeof TICKER_DATA)[number]) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-6">
      <span
        className={`h-[5px] w-[5px] rounded-[1px] ${up ? 'bg-primary' : 'bg-negative'}`}
      />
      <span className="text-[12px] font-normal text-text-primary">{name}</span>
      <span className="text-[12px] text-text-secondary">{val}</span>
      <span className={`text-[12px] ${up ? 'text-primary' : 'text-negative'}`}>
        {pct}
      </span>
    </div>
  );
}

export function Ticker() {
  return (
    <div className="relative h-10 overflow-hidden border-y border-border-subtle bg-canvas-base">
      {/* Scrolling track — duplicated for seamless loop */}
      <div className="flex h-full items-center animate-[ticker-scroll_40s_linear_infinite]">
        {/* First copy */}
        {TICKER_DATA.map((item) => (
          <TickerItem key={`a-${item.name}`} {...item} />
        ))}
        {/* Second copy (duplicate for seamless scroll) */}
        {TICKER_DATA.map((item) => (
          <TickerItem key={`b-${item.name}`} {...item} />
        ))}
      </div>

      {/* Left fade gradient */}
      <div
        className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-8"
        style={{
          background:
            'linear-gradient(to right, var(--color-canvas-base), transparent)',
        }}
      />

      {/* Right fade gradient */}
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8"
        style={{
          background:
            'linear-gradient(to left, var(--color-canvas-base), transparent)',
        }}
      />
    </div>
  );
}
