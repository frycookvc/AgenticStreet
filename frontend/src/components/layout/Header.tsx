'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { URLS } from '@/lib/constants';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border-subtle bg-canvas-base px-4 sm:px-6 lg:px-8">
      {/* Left — Brand mark */}
      <Link href="/" className="flex items-center gap-2">
        <span className="text-[14px] font-semibold tracking-[0.02em] text-text-muted">
          [-]
        </span>
        <span className="text-[14px] font-semibold tracking-[0.02em] text-text-primary">
          AGENTIC_STREET
        </span>
      </Link>

      {/* Right — ERC-8004 + Connect */}
      <div className="flex items-center gap-6">
        {/* ERC-8004 link */}
        <a
          href={URLS.ERC8004}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-primary hover:underline"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-[blink_1s_step-end_infinite]" />
          <span className="text-[12px] font-medium uppercase tracking-[0.1em] text-primary">
            ERC-8004
          </span>
        </a>

        {/* Connect wallet — RainbowKit Custom */}
        <ConnectButton.Custom>
          {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
            const ready = mounted;
            const connected = ready && account && chain;

            return (
              <button
                type="button"
                onClick={connected ? openAccountModal : openConnectModal}
                className="text-[12px] font-medium uppercase tracking-[0.1em] text-primary hover:underline"
              >
                {connected ? truncateAddress(account.address) : 'CONNECT_WALLET'}
              </button>
            );
          }}
        </ConnectButton.Custom>
      </div>
    </header>
  );
}
