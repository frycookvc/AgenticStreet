import { formatUnits } from 'viem';

/**
 * Format a USDC amount string (6 decimals BigInt) to display format.
 * formatUSDC('50000000000') → '$50,000'
 * formatUSDC('1000000') → '$1'
 * formatUSDC('0') → '$0'
 */
export function formatUSDC(amount: string): string {
  const formatted = formatUnits(BigInt(amount), 6);
  const num = Number(formatted);
  const display = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
  return `$${display}`;
}

/**
 * Format a raw 6-decimal BigInt amount to a comma-separated number (no currency symbol).
 * formatRawAmount('5000000000') → '5,000'
 */
export function formatRawAmount(amount: string): string {
  const formatted = formatUnits(BigInt(amount), 6);
  const num = Number(formatted);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format basis points to percentage.
 * formatBps(200) → '2.00%'
 * formatBps(2000) → '20.00%'
 */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/**
 * Truncate an address for display.
 * truncateAddress('0x1234567890abcdef1234567890abcdef12345678') → '0x1234...5678'
 */
export function truncateAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format a unix timestamp to a readable date.
 * formatDate(1707350400) → 'Feb 8, 2024'
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format fund duration in seconds to days.
 * formatDuration(2592000) → '30 days'
 */
export function formatDuration(seconds: number): string {
  const days = Math.round(seconds / 86400);
  return `${days} days`;
}

/**
 * Format proposal delay in seconds to hours.
 * formatDelay(7200) → '2 hours'
 */
export function formatDelay(seconds: number): string {
  const hours = Math.round(seconds / 3600);
  return `${hours} hour${hours !== 1 ? 's' : ''}`;
}

/**
 * Calculate days remaining from a unix timestamp.
 * Returns 0 if the date has passed.
 */
export function daysRemaining(timestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  const remaining = timestamp - now;
  return remaining > 0 ? Math.ceil(remaining / 86400) : 0;
}

/**
 * Convert a fund name to snake_case.fund format for card chrome.
 * 'ETH Accumulation Fund' → 'eth_accumulation_fund.fund'
 */
export function toSnakeCaseFund(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_') + '.fund';
}
