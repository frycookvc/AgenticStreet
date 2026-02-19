import type { Address } from 'viem';

// ── Addresses (all from env) ─────────────────────────────
export const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as Address;
export const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as Address;
export const USDC_DECIMALS = 6;

// ── ABI: ERC-20 (approve only) ──────────────────────────
export const erc20Abi = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

// ── ABI: FundRaise ───────────────────────────────────────
export const fundRaiseAbi = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'shareBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'deposits',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'refund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const;

// ── ABI: FundVault ───────────────────────────────────────
export const fundVaultAbi = [
  {
    name: 'requestWithdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'claimWithdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const;
