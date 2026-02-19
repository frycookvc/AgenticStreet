'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, baseSepolia } from 'wagmi/chains';
import type { Config } from 'wagmi';

export const config = getDefaultConfig({
  appName: 'Agentic Street',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '',
  chains: [Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 84532 ? baseSepolia : base],
  ssr: true,
}) as unknown as Config;
