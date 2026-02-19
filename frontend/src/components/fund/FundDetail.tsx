'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { WindowChrome, TypewriterCommand } from '@/components/ui';
import { useScramble } from '@/hooks';
import { useFundTerms } from '@/hooks/useFundTerms';
import { useFundStats } from '@/hooks/useFundStats';
import { useFundActivity } from '@/hooks/useFundActivity';
import type { ActivityLine } from '@/hooks/useFundActivity';
import {
  formatUSDC,
  formatRawAmount,
  formatBps,
  truncateAddress,
  formatDate,
  formatDuration,
  formatDelay,
  toSnakeCaseFund,
} from '@/lib/format';
import { URLS, TIMING } from '@/lib/constants';
import { Erc8004Badge } from './Erc8004Badge';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { parseUnits, formatUnits } from 'viem';
import type { FundTerms, FundStats, FundStatus } from '@/types/fund';
import type { Address } from 'viem';
import { USDC_ADDRESS, USDC_DECIMALS, erc20Abi, fundRaiseAbi, fundVaultAbi } from '@/lib/contracts';

// ── Status color mapping ───────────────────────────────────────────

const STATUS_COLORS: Record<FundStatus, string> = {
  raising: 'text-accent',
  active: 'text-primary',
  winding_down: 'text-text-secondary',
  frozen: 'text-negative',
  cancelled: 'text-negative',
};

const STATUS_LABELS: Record<FundStatus, string> = {
  raising: 'RAISING',
  active: 'ACTIVE',
  winding_down: 'WINDING DOWN',
  frozen: 'FROZEN',
  cancelled: 'CANCELLED',
};

// ── Placeholder data ───────────────────────────────────────────────

const PLACEHOLDER_TERMS: FundTerms = {
  vault: '0x0000000000000000000000000000000000000001' as Address,
  raise: '0x0000000000000000000000000000000000000002' as Address,
  manager: '0x0000000000000000000000000000000000000003' as Address,
  minRaise: '20000000000',
  maxRaise: '100000000000',
  depositStart: Math.floor(Date.now() / 1000) - 86400 * 10,
  depositEnd: Math.floor(Date.now() / 1000) + 86400 * 20,
  managementFeeBps: 200,
  performanceFeeBps: 2000,
  fundDuration: 86400 * 90,
  proposalDelay: 7200,
  metadataURI: '',
  metadata: {
    name: 'ETH Momentum Alpha',
    description:
      'Systematic momentum strategy targeting ETH and correlated L2 tokens with automated rebalancing and trailing stop-losses across multiple timeframes on Base mainnet. The strategy employs a multi-factor model combining price momentum, volume dynamics, and on-chain activity metrics to identify optimal entry and exit points.',
    managerName: 'agent_0x7f',
    managerDescription: 'Autonomous momentum trader',
    strategyType: 'momentum',
    riskLevel: 'medium',
    expectedDuration: '90 days',
    version: '1.0.0',
    erc8004: { verified: true, agentId: 'agent_0x7f' },
  },
};

const PLACEHOLDER_STATS: FundStats = {
  vault: '0x0000000000000000000000000000000000000001' as Address,
  status: 'raising',
  totalDeposited: '35000000000',
  vaultBalance: '35000000000',
  deployedCapital: '0',
  depositorCount: 12,
  totalManagementFeesClaimed: '0',
  cumulativeDrawn: '0',
  drawdownAllowance: '0',
  elapsedIntervals: 0,
  activated: false,
  fundFrozen: false,
  fundWindingDown: false,
};

const PREVIEW_STATS_OVERRIDES: Record<string, Partial<FundStats>> = {
  raising: {
    status: 'raising',
    totalDeposited: '35000000000',
    vaultBalance: '35000000000',
    deployedCapital: '0',
    depositorCount: 12,
    activated: false,
    fundFrozen: false,
    fundWindingDown: false,
  },
  active: {
    status: 'active',
    totalDeposited: '85000000000',
    vaultBalance: '62000000000',
    deployedCapital: '23000000000',
    depositorCount: 28,
    totalManagementFeesClaimed: '425000000',
    cumulativeDrawn: '23000000000',
    drawdownAllowance: '42500000000',
    elapsedIntervals: 15,
    activated: true,
    fundFrozen: false,
    fundWindingDown: false,
  },
  winding_down: {
    status: 'winding_down',
    totalDeposited: '85000000000',
    vaultBalance: '91200000000',
    deployedCapital: '0',
    depositorCount: 28,
    totalManagementFeesClaimed: '1700000000',
    cumulativeDrawn: '85000000000',
    drawdownAllowance: '85000000000',
    elapsedIntervals: 90,
    activated: true,
    fundFrozen: false,
    fundWindingDown: true,
  },
  frozen: {
    status: 'frozen',
    totalDeposited: '85000000000',
    vaultBalance: '47000000000',
    deployedCapital: '38000000000',
    depositorCount: 28,
    totalManagementFeesClaimed: '850000000',
    cumulativeDrawn: '50000000000',
    drawdownAllowance: '42500000000',
    elapsedIntervals: 45,
    activated: true,
    fundFrozen: true,
    fundWindingDown: false,
  },
  cancelled: {
    status: 'cancelled',
    totalDeposited: '12000000000',
    vaultBalance: '12000000000',
    deployedCapital: '0',
    depositorCount: 4,
    totalManagementFeesClaimed: '0',
    cumulativeDrawn: '0',
    drawdownAllowance: '0',
    elapsedIntervals: 0,
    activated: false,
    fundFrozen: false,
    fundWindingDown: false,
  },
};

// ── Divider constant ───────────────────────────────────────────────
const FULL_DIVIDER = '\u2500'.repeat(200);
const SECTION_DIVIDER = '\u2500'.repeat(60);

// ── Terminal key-value line ────────────────────────────────────────

function DetailLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex text-[0.875rem] leading-[2]">
      <span className="text-primary mr-2 shrink-0">&gt;</span>
      <span className="text-accent w-[120px] lg:w-[160px] shrink-0">{label}:</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// ── Description continuation line ──────────────────────────────────

function DescriptionBlock({ text }: { text: string }) {
  return (
    <div className="flex text-[0.875rem] leading-[2]">
      <span className="text-primary mr-2 shrink-0">&gt;</span>
      <span className="text-accent w-[120px] lg:w-[160px] shrink-0">description:</span>
      <span className="min-w-0 text-text-primary">&quot;{text}&quot;</span>
    </div>
  );
}

// ── Address line with BaseScan link ────────────────────────────────

function AddressLine({ label, address }: { label: string; address: string }) {
  return (
    <DetailLine label={label}>
      <span className="text-text-primary">{truncateAddress(address)}</span>
      <a
        href={`${URLS.BASESCAN_ADDRESS}${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary ml-2 hover:underline"
      >
        [BaseScan ↗]
      </a>
    </DetailLine>
  );
}

// ── Section divider ────────────────────────────────────────────────

function SectionDivider() {
  return (
    <div className="overflow-hidden whitespace-nowrap text-text-muted my-4">
      {SECTION_DIVIDER}
    </div>
  );
}

// ── Build command segments dynamically ─────────────────────────────

function buildCommandSegments(fundName: string) {
  const prefix = '$ cat ./funds/';
  const fileName = toSnakeCaseFund(fundName);
  const command = `${prefix}${fileName}`;

  const segments = [
    { start: 0, end: 2, className: 'text-primary' },
    { start: 2, end: 5, className: 'text-text-primary font-medium' },
    { start: 5, end: 14, className: 'text-text-secondary' },
    { start: 14, end: command.length, className: 'text-accent' },
  ];

  return { command, segments };
}

// ── Raise progress helpers ─────────────────────────────────────────

function formatRaiseProgress(totalDeposited: string, maxRaise: string): string {
  const deposited = Number(BigInt(totalDeposited)) / 1e6;
  const max = Number(BigInt(maxRaise)) / 1e6;
  const pct = max > 0 ? ((deposited / max) * 100).toFixed(1) : '0.0';
  return `${new Intl.NumberFormat('en-US').format(deposited)} / ${new Intl.NumberFormat('en-US').format(max)} (${pct}%)`;
}

function formatDrawdownProgress(drawn: string, allowance: string): string {
  const d = Number(BigInt(drawn)) / 1e6;
  const a = Number(BigInt(allowance)) / 1e6;
  const pct = a > 0 ? ((d / a) * 100).toFixed(1) : '0.0';
  return `${new Intl.NumberFormat('en-US').format(d)} / ${new Intl.NumberFormat('en-US').format(a)} (${pct}%)`;
}

function getRaisePercent(totalDeposited: string, maxRaise: string): number {
  const deposited = Number(BigInt(totalDeposited));
  const max = Number(BigInt(maxRaise));
  return max > 0 ? Math.min((deposited / max) * 100, 100) : 0;
}

// ── Deposit Modal ─────────────────────────────────────────────────

type DepositStep = 'input' | 'approving' | 'depositing' | 'success' | 'error';

function DepositModal({
  fundName,
  raiseAddress,
  totalDeposited,
  maxRaise,
  onClose,
  onSuccess,
}: {
  fundName: string;
  raiseAddress: Address;
  totalDeposited: string;
  maxRaise: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<DepositStep>('input');
  const [errorMsg, setErrorMsg] = useState('');

  // Calculate max available deposit
  const remaining = BigInt(maxRaise) - BigInt(totalDeposited);
  const zero = BigInt(0);
  const maxAvailable = formatUnits(remaining > zero ? remaining : zero, USDC_DECIMALS);

  // Approve transaction
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApprovePending,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract();

  // Deposit transaction
  const {
    writeContract: writeDeposit,
    data: depositTxHash,
    isPending: isDepositPending,
    error: depositError,
    reset: resetDeposit,
  } = useWriteContract();

  // Wait for approve confirmation
  const { isSuccess: approveConfirmed, isError: approveReceiptError } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // Wait for deposit confirmation
  const { isSuccess: depositConfirmed, isError: depositReceiptError } =
    useWaitForTransactionReceipt({ hash: depositTxHash });

  // When approve is confirmed, send deposit
  useEffect(() => {
    if (approveConfirmed && step === 'approving') {
      setStep('depositing');
      const amountBase = parseUnits(amount, USDC_DECIMALS);
      writeDeposit({
        address: raiseAddress,
        abi: fundRaiseAbi,
        functionName: 'deposit',
        args: [amountBase],
      });
    }
  }, [approveConfirmed, step, amount, raiseAddress, writeDeposit]);

  // When deposit is confirmed, show success
  useEffect(() => {
    if (depositConfirmed && step === 'depositing') {
      setStep('success');
      onSuccess?.();
    }
  }, [depositConfirmed, step, onSuccess]);

  // Handle errors
  useEffect(() => {
    if (approveError && step === 'approving') {
      setStep('error');
      setErrorMsg(approveError.message.split('\n')[0] ?? 'Approve transaction failed');
    }
  }, [approveError, step]);

  useEffect(() => {
    if (approveReceiptError && step === 'approving') {
      setStep('error');
      setErrorMsg('Approve transaction reverted');
    }
  }, [approveReceiptError, step]);

  useEffect(() => {
    if (depositError && step === 'depositing') {
      setStep('error');
      setErrorMsg(depositError.message.split('\n')[0] ?? 'Deposit transaction failed');
    }
  }, [depositError, step]);

  useEffect(() => {
    if (depositReceiptError && step === 'depositing') {
      setStep('error');
      setErrorMsg('Deposit transaction reverted');
    }
  }, [depositReceiptError, step]);

  function handleDeploy() {
    const parsed = Number(amount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setErrorMsg('Enter a valid amount');
      setStep('error');
      return;
    }
    if (parsed > Number(maxAvailable)) {
      setErrorMsg('Amount exceeds remaining capacity');
      setStep('error');
      return;
    }

    setStep('approving');
    setErrorMsg('');
    const amountBase = parseUnits(amount, USDC_DECIMALS);

    writeApprove({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [raiseAddress, amountBase],
    });
  }

  function handleRetry() {
    setStep('input');
    setErrorMsg('');
    resetApprove();
    resetDeposit();
  }

  // Determine button text based on step
  const buttonLabel: Record<DepositStep, string> = {
    input: 'DEPLOY',
    approving: 'APPROVING...',
    depositing: 'DEPLOYING...',
    success: 'DEPLOYED!',
    error: 'RETRY',
  };

  const isBusy = step === 'approving' || step === 'depositing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/80"
        onClick={!isBusy ? onClose : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !isBusy) onClose();
        }}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md border border-border-default bg-canvas-base rounded-sm overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-border-subtle bg-canvas-elevated px-4 py-2">
          <div className="flex items-center">
            <span className="select-none text-xs font-medium text-text-muted">
              [x][-][+]
            </span>
            <span className="ml-3 text-[0.875rem] font-normal tracking-[0.02em] text-text-secondary">
              deploy_capital
            </span>
          </div>
          {!isBusy && (
            <button
              type="button"
              onClick={onClose}
              className="text-text-tertiary hover:text-text-primary text-sm font-mono"
            >
              [x]
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Fund name */}
          <div className="text-[0.8125rem] text-text-secondary">
            <span className="text-primary">&gt;</span> fund: <span className="text-text-primary">{toSnakeCaseFund(fundName)}</span>
          </div>

          {/* Amount input */}
          <div className="space-y-2">
            <label
              htmlFor="deposit-amount"
              className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary"
            >
              Amount (USDC)
            </label>
            <div className="flex gap-2">
              <input
                id="deposit-amount"
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isBusy || step === 'success'}
                className="flex-1 bg-canvas-base border border-border-default rounded-sm px-3 py-2 text-[0.875rem] font-mono text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-border disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setAmount(maxAvailable)}
                disabled={isBusy || step === 'success'}
                className="shrink-0 text-[0.75rem] font-medium uppercase tracking-[0.1em] text-accent bg-transparent border border-border-default px-3 py-2 rounded-sm hover:border-accent hover:bg-accent/5 disabled:opacity-50"
              >
                MAX
              </button>
            </div>
            <div className="text-[11px] text-text-muted">
              max available: <span className="text-text-secondary">{Number(maxAvailable).toLocaleString('en-US')} USDC</span>
            </div>
          </div>

          {/* Status feedback */}
          {step === 'approving' && (
            <div className="text-[0.8125rem] text-accent font-mono animate-pulse">
              &gt; APPROVING USDC TRANSFER...
            </div>
          )}
          {step === 'depositing' && (
            <div className="text-[0.8125rem] text-accent font-mono animate-pulse">
              &gt; DEPLOYING CAPITAL...
            </div>
          )}
          {step === 'success' && (
            <div className="text-[0.8125rem] text-primary font-mono">
              &gt; DEPLOYED! Capital committed successfully.
            </div>
          )}
          {step === 'error' && errorMsg && (
            <div className="text-[0.8125rem] text-negative font-mono break-all">
              &gt; ERROR: {errorMsg}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            {step === 'success' ? (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-[0.75rem] font-medium uppercase tracking-[0.1em] text-primary bg-transparent border border-primary-border px-4 py-2 rounded-sm hover:bg-primary-surface"
              >
                CLOSE
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={step === 'error' ? handleRetry : handleDeploy}
                  disabled={isBusy || (step === 'input' && !amount)}
                  className="flex-1 text-[0.75rem] font-medium uppercase tracking-[0.1em] text-primary bg-transparent border border-primary-border px-4 py-2 rounded-sm hover:bg-primary-surface disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {buttonLabel[step]}
                </button>
                {!isBusy && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-[0.75rem] font-medium uppercase tracking-[0.1em] text-text-tertiary bg-transparent border border-border-default px-4 py-2 rounded-sm hover:text-text-primary hover:border-border-subtle"
                  >
                    CANCEL
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Withdraw Modal ────────────────────────────────────────────────

type WithdrawStep = 'input' | 'requesting' | 'claiming' | 'success' | 'error';

function WithdrawModal({
  fundName,
  vaultAddress,
  raiseAddress,
  vaultBalance,
  totalDeposited,
  previewDeposit,
  onClose,
  onSuccess,
}: {
  fundName: string;
  vaultAddress: Address;
  raiseAddress: Address;
  vaultBalance: string;
  totalDeposited: string;
  previewDeposit?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [shares, setShares] = useState('');
  const [step, setStep] = useState<WithdrawStep>('input');
  const [errorMsg, setErrorMsg] = useState('');

  // Read investor's share balance + initial deposit from raise contract
  const { address: userAddress } = useAccount();
  const { data: rawShareBalance } = useReadContract({
    address: raiseAddress,
    abi: fundRaiseAbi,
    functionName: 'shareBalance',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });
  const { data: rawUserDeposit } = useReadContract({
    address: raiseAddress,
    abi: fundRaiseAbi,
    functionName: 'deposits',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  // Guard against garbage reads; use preview mock when available
  const maxSane = BigInt(totalDeposited);
  const shareBalance = previewDeposit
    ? BigInt(previewDeposit)
    : rawShareBalance !== undefined && rawShareBalance <= maxSane
      ? rawShareBalance
      : BigInt(0);
  const userDeposit = previewDeposit
    ? BigInt(previewDeposit)
    : rawUserDeposit !== undefined && rawUserDeposit <= maxSane
      ? rawUserDeposit
      : BigInt(0);

  // Human-readable shares (no $ symbol) + USDC estimate
  const shareBalanceHuman = formatRawAmount(shareBalance.toString());
  const totalDep = BigInt(totalDeposited);
  const usdcEstimate =
    totalDep > BigInt(0) && shareBalance > BigInt(0)
      ? (shareBalance * BigInt(vaultBalance)) / totalDep
      : BigInt(0);
  const usdcEstimateHuman = formatUSDC(usdcEstimate.toString());

  // MAX = balance minus a tiny dust amount to avoid edge-case reverts
  function handleMax() {
    if (shareBalance <= BigInt(0)) return;
    const dust = BigInt(1); // 0.000001 shares (1 unit at 6 decimals)
    const safe = shareBalance > dust ? shareBalance - dust : BigInt(0);
    // Show clean human-readable number in the input
    const formatted = Number(formatUnits(safe, USDC_DECIMALS));
    setShares(String(Math.floor(formatted * 1e6) / 1e6));
  }

  // requestWithdraw transaction
  const {
    writeContract: writeRequest,
    data: requestTxHash,
    isPending: isRequestPending,
    error: requestError,
    reset: resetRequest,
  } = useWriteContract();

  // claimWithdraw transaction
  const {
    writeContract: writeClaim,
    data: claimTxHash,
    isPending: isClaimPending,
    error: claimError,
    reset: resetClaim,
  } = useWriteContract();

  // Wait for request confirmation
  const { isSuccess: requestConfirmed, isError: requestReceiptError } =
    useWaitForTransactionReceipt({ hash: requestTxHash });

  // Wait for claim confirmation
  const { isSuccess: claimConfirmed, isError: claimReceiptError } =
    useWaitForTransactionReceipt({ hash: claimTxHash });

  // When request is confirmed, send claim
  useEffect(() => {
    if (requestConfirmed && step === 'requesting') {
      setStep('claiming');
      writeClaim({
        address: vaultAddress,
        abi: fundVaultAbi,
        functionName: 'claimWithdraw',
      });
    }
  }, [requestConfirmed, step, vaultAddress, writeClaim]);

  // When claim is confirmed, show success
  useEffect(() => {
    if (claimConfirmed && step === 'claiming') {
      setStep('success');
      onSuccess?.();
    }
  }, [claimConfirmed, step, onSuccess]);

  // Handle errors
  useEffect(() => {
    if (requestError && step === 'requesting') {
      setStep('error');
      setErrorMsg(requestError.message.split('\n')[0] ?? 'Withdraw request failed');
    }
  }, [requestError, step]);

  useEffect(() => {
    if (requestReceiptError && step === 'requesting') {
      setStep('error');
      setErrorMsg('Withdraw request transaction reverted');
    }
  }, [requestReceiptError, step]);

  useEffect(() => {
    if (claimError && step === 'claiming') {
      setStep('error');
      setErrorMsg(claimError.message.split('\n')[0] ?? 'Claim withdraw failed');
    }
  }, [claimError, step]);

  useEffect(() => {
    if (claimReceiptError && step === 'claiming') {
      setStep('error');
      setErrorMsg('Claim withdraw transaction reverted');
    }
  }, [claimReceiptError, step]);

  function handleWithdraw() {
    const parsed = Number(shares);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setErrorMsg('Enter a valid share amount');
      setStep('error');
      return;
    }

    setStep('requesting');
    setErrorMsg('');
    // Shares are 6 decimals (same as USDC since 1:1 during deposit)
    const sharesBase = parseUnits(shares, USDC_DECIMALS);

    writeRequest({
      address: vaultAddress,
      abi: fundVaultAbi,
      functionName: 'requestWithdraw',
      args: [sharesBase],
    });
  }

  function handleRetry() {
    setStep('input');
    setErrorMsg('');
    resetRequest();
    resetClaim();
  }

  const buttonLabel: Record<WithdrawStep, string> = {
    input: 'WITHDRAW',
    requesting: 'REQUESTING...',
    claiming: 'CLAIMING...',
    success: 'WITHDRAWN!',
    error: 'RETRY',
  };

  const isBusy = step === 'requesting' || step === 'claiming';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/80"
        onClick={!isBusy ? onClose : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !isBusy) onClose();
        }}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md border border-border-default bg-canvas-base rounded-sm overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-border-subtle bg-canvas-elevated px-4 py-2">
          <div className="flex items-center">
            <span className="select-none text-xs font-medium text-text-muted">
              [x][-][+]
            </span>
            <span className="ml-3 text-[0.875rem] font-normal tracking-[0.02em] text-text-secondary">
              withdraw_capital
            </span>
          </div>
          {!isBusy && (
            <button
              type="button"
              onClick={onClose}
              className="text-text-tertiary hover:text-text-primary text-sm font-mono"
            >
              [x]
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Fund name + deposit info */}
          <div className="text-[0.8125rem] text-text-secondary">
            <span className="text-primary">&gt;</span> fund: <span className="text-text-primary">{toSnakeCaseFund(fundName)}</span>
          </div>
          {userDeposit > BigInt(0) && (
            <div className="text-[0.8125rem] text-text-secondary">
              <span className="text-primary">&gt;</span> your_deposits: <span className="text-primary">{formatUSDC(userDeposit.toString())} USDC</span>
            </div>
          )}

          {/* Shares input */}
          <div className="space-y-2">
            <label
              htmlFor="withdraw-shares"
              className="text-[11px] font-medium tracking-[0.08em] text-text-secondary"
            >
              shares to withdraw
            </label>
            <div className="flex gap-2">
            <input
              id="withdraw-shares"
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              disabled={isBusy || step === 'success'}
              className="flex-1 bg-canvas-base border border-border-default rounded-sm px-3 py-2 text-[0.875rem] font-mono text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-border disabled:opacity-50"
            />
              <button
                type="button"
                onClick={handleMax}
                disabled={isBusy || step === 'success' || shareBalance <= BigInt(0)}
                className="shrink-0 text-[0.75rem] font-medium uppercase tracking-[0.1em] text-accent bg-transparent border border-border-default px-3 py-2 rounded-sm hover:border-accent hover:bg-accent/5 disabled:opacity-50"
              >
                MAX
              </button>
            </div>
            <div className="text-[11px] text-text-muted">
              your shares: <span className="text-text-secondary">{shareBalanceHuman}</span>
              <span className="text-primary ml-1">{'\u2248'} {usdcEstimateHuman} USDC</span>
            </div>
          </div>

          {/* Status feedback */}
          {step === 'requesting' && (
            <div className="text-[0.8125rem] text-accent font-mono animate-pulse">
              &gt; REQUESTING WITHDRAWAL...
            </div>
          )}
          {step === 'claiming' && (
            <div className="text-[0.8125rem] text-accent font-mono animate-pulse">
              &gt; CLAIMING USDC...
            </div>
          )}
          {step === 'success' && (
            <div className="text-[0.8125rem] text-primary font-mono">
              &gt; WITHDRAWN! USDC returned to your wallet.
            </div>
          )}
          {step === 'error' && errorMsg && (
            <div className="text-[0.8125rem] text-negative font-mono break-all">
              &gt; ERROR: {errorMsg}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            {step === 'success' ? (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-[0.75rem] font-medium uppercase tracking-[0.1em] text-primary bg-transparent border border-primary-border px-4 py-2 rounded-sm hover:bg-primary-surface"
              >
                CLOSE
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={step === 'error' ? handleRetry : handleWithdraw}
                  disabled={isBusy || (step === 'input' && !shares)}
                  className="flex-1 text-[0.75rem] font-medium uppercase tracking-[0.1em] text-primary bg-transparent border border-primary-border px-4 py-2 rounded-sm hover:bg-primary-surface disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {buttonLabel[step]}
                </button>
                {!isBusy && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-[0.75rem] font-medium uppercase tracking-[0.1em] text-text-tertiary bg-transparent border border-border-default px-4 py-2 rounded-sm hover:text-text-primary hover:border-border-subtle"
                  >
                    CANCEL
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Refund Modal (raising phase — full USDC withdrawal) ───────────

type RefundStep = 'confirm' | 'refunding' | 'success' | 'error';

function RefundModal({
  fundName,
  raiseAddress,
  depositAmount,
  onClose,
  onSuccess,
}: {
  fundName: string;
  raiseAddress: Address;
  depositAmount: bigint;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [step, setStep] = useState<RefundStep>('confirm');
  const [errorMsg, setErrorMsg] = useState('');

  const {
    writeContract: writeRefund,
    data: refundTxHash,
    error: refundError,
    reset: resetRefund,
  } = useWriteContract();

  const { isSuccess: refundConfirmed, isError: refundReceiptError } =
    useWaitForTransactionReceipt({ hash: refundTxHash });

  useEffect(() => {
    if (refundConfirmed && step === 'refunding') {
      setStep('success');
      onSuccess?.();
    }
  }, [refundConfirmed, step, onSuccess]);

  useEffect(() => {
    if (refundError && step === 'refunding') {
      setStep('error');
      setErrorMsg(refundError.message.split('\n')[0] ?? 'Refund failed');
    }
  }, [refundError, step]);

  useEffect(() => {
    if (refundReceiptError && step === 'refunding') {
      setStep('error');
      setErrorMsg('Refund transaction reverted');
    }
  }, [refundReceiptError, step]);

  function handleRefund() {
    setStep('refunding');
    setErrorMsg('');
    writeRefund({
      address: raiseAddress,
      abi: fundRaiseAbi,
      functionName: 'refund',
    });
  }

  function handleRetry() {
    setStep('confirm');
    setErrorMsg('');
    resetRefund();
  }

  const isBusy = step === 'refunding';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80"
        onClick={!isBusy ? onClose : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !isBusy) onClose();
        }}
      />

      <div className="relative z-10 w-full max-w-md border border-border-default bg-canvas-base rounded-sm overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center justify-between border-b border-border-subtle bg-canvas-elevated px-4 py-2">
          <div className="flex items-center">
            <span className="select-none text-xs font-medium text-text-muted">
              [x][-][+]
            </span>
            <span className="ml-3 text-[0.875rem] font-normal tracking-[0.02em] text-text-secondary">
              withdraw_capital
            </span>
          </div>
          {!isBusy && (
            <button
              type="button"
              onClick={onClose}
              className="text-text-tertiary hover:text-text-primary text-sm font-mono"
            >
              [x]
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div className="text-[0.8125rem] text-text-secondary">
            <span className="text-primary">&gt;</span> fund: <span className="text-text-primary">{toSnakeCaseFund(fundName)}</span>
          </div>
          <div className="text-[0.8125rem] text-text-secondary">
            <span className="text-primary">&gt;</span> your_deposits: <span className="text-primary">{formatUSDC(depositAmount.toString())} USDC</span>
          </div>

          <div className="text-[11px] text-text-muted">
            Withdraw your full deposit. During the raising phase, withdrawals are free and instant.
          </div>

          {/* Status feedback */}
          {step === 'refunding' && (
            <div className="text-[0.8125rem] text-accent font-mono animate-pulse">
              &gt; WITHDRAWING USDC...
            </div>
          )}
          {step === 'success' && (
            <div className="text-[0.8125rem] text-primary font-mono">
              &gt; WITHDRAWN! {formatUSDC(depositAmount.toString())} USDC returned to your wallet.
            </div>
          )}
          {step === 'error' && errorMsg && (
            <div className="text-[0.8125rem] text-negative font-mono break-all">
              &gt; ERROR: {errorMsg}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            {step === 'success' ? (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-[0.75rem] font-medium uppercase tracking-[0.1em] text-primary bg-transparent border border-primary-border px-4 py-2 rounded-sm hover:bg-primary-surface"
              >
                CLOSE
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={step === 'error' ? handleRetry : handleRefund}
                  disabled={isBusy}
                  className="flex-1 text-[0.75rem] font-medium uppercase tracking-[0.1em] text-primary bg-transparent border border-primary-border px-4 py-2 rounded-sm hover:bg-primary-surface disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {step === 'refunding' ? 'WITHDRAWING...' : step === 'error' ? 'RETRY' : 'WITHDRAW'}
                </button>
                {!isBusy && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-[0.75rem] font-medium uppercase tracking-[0.1em] text-text-tertiary bg-transparent border border-border-default px-4 py-2 rounded-sm hover:text-text-primary hover:border-border-subtle"
                  >
                    CANCEL
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ASCII Progress Bar ─────────────────────────────────────────────

function AsciiProgressBar({
  totalDeposited,
  vaultBalance,
  minRaise,
  maxRaise,
  raiseAddress,
  vaultAddress,
  fundName,
  status,
  previewDeposit,
  onTransactionSuccess,
}: {
  totalDeposited: string;
  vaultBalance: string;
  minRaise: string;
  maxRaise: string;
  raiseAddress: Address;
  vaultAddress: Address;
  fundName: string;
  status: FundStatus;
  previewDeposit?: string | null;
  onTransactionSuccess?: () => void;
}) {
  const pct = getRaisePercent(totalDeposited, maxRaise);
  const barWidth = 40;
  const filled = Math.round((pct / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
  const minRaiseMet = BigInt(totalDeposited) >= BigInt(minRaise);

  const { address: userAddress, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [showModal, setShowModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);

  // Read user's initial deposit from the raise contract
  const { data: rawUserDeposit, refetch: refetchUserDeposit } = useReadContract({
    address: raiseAddress,
    abi: fundRaiseAbi,
    functionName: 'deposits',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  // Optimistic flag: instantly show/hide button after tx, before RPC catches up
  const [optimisticHasDeposit, setOptimisticHasDeposit] = useState<boolean | null>(null);

  // Staggered refetch: retries at 0s, 2s, 5s to bust through all cache layers
  const staggeredRefetch = useCallback(() => {
    const doRefetch = () => { onTransactionSuccess?.(); refetchUserDeposit(); };
    doRefetch();
    setTimeout(doRefetch, 2000);
    setTimeout(doRefetch, 5000);
  }, [onTransactionSuccess, refetchUserDeposit]);

  const handleDepositSuccess = useCallback(() => {
    setOptimisticHasDeposit(true);
    staggeredRefetch();
  }, [staggeredRefetch]);

  const handleRefundSuccess = useCallback(() => {
    setOptimisticHasDeposit(false);
    staggeredRefetch();
  }, [staggeredRefetch]);

  const handleWithdrawSuccess = useCallback(() => {
    staggeredRefetch();
  }, [staggeredRefetch]);

  const userDeposit = previewDeposit
    ? BigInt(previewDeposit)
    : rawUserDeposit ?? BigInt(0);
  const hasDeposit = optimisticHasDeposit ?? userDeposit > BigInt(0);

  // Track which modal to open after connecting
  const pendingModalRef = useRef<'deposit' | 'withdraw' | 'refund' | null>(null);
  useEffect(() => {
    if (isConnected && pendingModalRef.current) {
      if (pendingModalRef.current === 'deposit') setShowModal(true);
      if (pendingModalRef.current === 'withdraw') setShowWithdrawModal(true);
      if (pendingModalRef.current === 'refund') setShowRefundModal(true);
      pendingModalRef.current = null;
    }
  }, [isConnected]);

  function handleDeployClick() {
    if (!isConnected) {
      pendingModalRef.current = 'deposit';
      openConnectModal?.();
      return;
    }
    setShowModal(true);
  }

  function handleWithdrawClick() {
    if (!isConnected) {
      pendingModalRef.current = 'withdraw';
      openConnectModal?.();
      return;
    }
    setShowWithdrawModal(true);
  }

  function handleRefundClick() {
    if (!isConnected) {
      pendingModalRef.current = 'refund';
      openConnectModal?.();
      return;
    }
    setShowRefundModal(true);
  }

  return (
    <>
      <div className="relative rounded-sm border border-border-default bg-canvas-surface p-4">
        {/* Header row: title + MIN_RAISE_MET badge top-right */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-medium tracking-[0.08em] text-text-secondary">
            raise_progress
          </div>
          {minRaiseMet && (
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-primary border border-primary-border rounded-sm px-1.5 py-0.5">
              MIN_RAISE_MET
            </span>
          )}
        </div>
        {/* Bar */}
        <div className="flex items-baseline text-[0.8125rem] leading-[1.8] font-medium">
          <span className="shrink-0 text-text-secondary">RAISE </span>
          <span className="shrink-0 text-text-muted">[</span>
          <span className="overflow-hidden whitespace-nowrap min-w-0">
            <span className="text-primary">{bar.slice(0, filled)}</span>
            <span className="text-text-muted">{bar.slice(filled)}</span>
          </span>
          <span className="shrink-0 text-text-muted">]</span>
          <span className="shrink-0 text-primary ml-2">{pct.toFixed(1)}%</span>
        </div>
        {/* USDC amounts */}
        <div className="text-[0.8125rem] text-text-secondary mt-1">
          <span className="text-primary">{formatUSDC(totalDeposited)}</span>
          <span className="text-text-muted"> / </span>
          <span className="text-text-secondary">{formatUSDC(maxRaise)} USDC</span>
        </div>
        {/* Action button / badge based on status */}
        {status === 'raising' && (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleDeployClick}
              className="text-[0.75rem] font-medium uppercase tracking-[0.1em] text-primary bg-transparent border border-primary-border px-4 py-1.5 rounded-sm hover:bg-primary-surface"
            >
              DEPLOY_CAPITAL
            </button>
            {hasDeposit && (
              <button
                type="button"
                onClick={handleRefundClick}
                className="text-[0.75rem] font-medium uppercase tracking-[0.1em] text-accent bg-transparent border border-accent-border px-4 py-1.5 rounded-sm hover:bg-accent-surface"
              >
                WITHDRAW_CAPITAL
              </button>
            )}
          </div>
        )}
        {status === 'active' && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[10px] font-medium tracking-[0.08em] text-primary border border-primary-border rounded-sm px-1.5 py-0.5">
              DEPLOYED
            </span>
            {hasDeposit && (
              <span className="text-[11px] text-text-muted">
                your_deposits: <span className="text-text-secondary">{formatUSDC(userDeposit.toString())} USDC</span>
              </span>
            )}
          </div>
        )}
        {status === 'winding_down' && (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleWithdrawClick}
              className="text-[0.75rem] font-medium uppercase tracking-[0.1em] text-accent bg-transparent border border-accent-border px-4 py-1.5 rounded-sm hover:bg-accent-surface"
            >
              WITHDRAW_CAPITAL
            </button>
            {hasDeposit && (
              <span className="text-[11px] text-text-muted">
                your_deposits: <span className="text-text-secondary">{formatUSDC(userDeposit.toString())} USDC</span>
              </span>
            )}
          </div>
        )}
        {status === 'frozen' && (
          <div className="mt-3">
            <span className="text-[10px] font-medium tracking-[0.08em] text-negative border border-negative/20 rounded-sm px-1.5 py-0.5">
              FROZEN
            </span>
          </div>
        )}
        {status === 'cancelled' && (
          <div className="mt-3">
            <span className="text-[10px] font-medium tracking-[0.08em] text-negative border border-negative/20 rounded-sm px-1.5 py-0.5">
              CANCELLED
            </span>
          </div>
        )}
      </div>

      {showModal && (
        <DepositModal
          fundName={fundName}
          raiseAddress={raiseAddress}
          totalDeposited={totalDeposited}
          maxRaise={maxRaise}
          onClose={() => setShowModal(false)}
          onSuccess={handleDepositSuccess}
        />
      )}

      {showWithdrawModal && (
        <WithdrawModal
          fundName={fundName}
          vaultAddress={vaultAddress}
          raiseAddress={raiseAddress}
          vaultBalance={vaultBalance}
          totalDeposited={totalDeposited}
          previewDeposit={previewDeposit}
          onClose={() => setShowWithdrawModal(false)}
          onSuccess={handleWithdrawSuccess}
        />
      )}

      {showRefundModal && (
        <RefundModal
          fundName={fundName}
          raiseAddress={raiseAddress}
          depositAmount={userDeposit}
          onClose={() => setShowRefundModal(false)}
          onSuccess={handleRefundSuccess}
        />
      )}
    </>
  );
}

// ── Activity Log (CRT Terminal) ────────────────────────────────────

function stripTags(text: string): string {
  return text.replace(/\{(?:green|amber)\}(.*?)\{\/(?:green|amber)\}/g, '$1');
}

function renderPartialLine(
  taggedLine: string,
  charCount: number,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\{(green|amber)\}(.*?)\{\/\1\}/g;
  let lastIndex = 0;
  let charsLeft = charCount;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(taggedLine)) !== null && charsLeft > 0) {
    const plain = taggedLine.slice(lastIndex, match.index);
    if (plain.length > 0) {
      const take = Math.min(plain.length, charsLeft);
      parts.push(plain.slice(0, take));
      charsLeft -= take;
    }
    if (charsLeft > 0) {
      const color = match[1] ?? 'green';
      const content = match[2] ?? '';
      const take = Math.min(content.length, charsLeft);
      parts.push(
        <span
          key={`${match.index}-${color}`}
          className={
            color === 'green' ? 'text-primary opacity-35' : 'text-accent opacity-40'
          }
        >
          {content.slice(0, take)}
        </span>,
      );
      charsLeft -= take;
    }
    lastIndex = regex.lastIndex;
  }

  if (charsLeft > 0 && lastIndex < taggedLine.length) {
    const remaining = taggedLine.slice(lastIndex);
    const take = Math.min(remaining.length, charsLeft);
    parts.push(remaining.slice(0, take));
  }

  return parts;
}

type CompletedLine = { tagged: string; key: number };

/** Generate contextual filler lines based on fund status */
function getFillerLines(status: FundStatus): string[][] {
  switch (status) {
    case 'raising':
      return [['fund_launched: {green}deposit window open{/green}', '— accepting deposits']];
    case 'active':
      return [['fund_active: {green}capital deployed, proposals enabled{/green}']];
    case 'winding_down':
      return [['fund_winding_down: {amber}withdrawals open{/amber}']];
    case 'frozen':
      return [['fund_frozen: {amber}emergency freeze activated{/amber}']];
    case 'cancelled':
      return [['fund_cancelled: {amber}deposits refundable{/amber}']];
    default:
      return [];
  }
}

function ActivityLog({ vaultAddress, status }: { vaultAddress: string; status: FundStatus }) {
  const { data: activityLines, loading } = useFundActivity(vaultAddress);

  // All completed lines (from API + filler)
  const [history, setHistory] = useState<CompletedLine[]>([]);
  // Currently typing lines (typewriter effect for last few)
  const [typedLines, setTypedLines] = useState<
    { tagged: string; total: number; typed: number }[]
  >([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const keyRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, typedLines]);

  // When data loads, populate history and typewriter the last few
  useEffect(() => {
    if (loading || !activityLines || initializedRef.current) return;
    initializedRef.current = true;
    clearTimers();

    // API returns newest-first; reverse for chronological display
    const chronological = [...activityLines].reverse();

    // Build tagged line arrays from API data
    const allLines: string[][] = chronological.map((a) =>
      a.line2 ? [a.line1, a.line2] : [a.line1],
    );

    // Add filler lines if few events
    if (allLines.length < 3) {
      const fillers = getFillerLines(status);
      allLines.unshift(...fillers);
    }

    // Show all but last 3 as instant history, typewrite the last 3
    const typewriteCount = Math.min(3, allLines.length);
    const instantLines = allLines.slice(0, allLines.length - typewriteCount);
    const typewriteLines = allLines.slice(allLines.length - typewriteCount);

    // Set instant history
    const instantHistory: CompletedLine[] = [];
    for (const lines of instantLines) {
      for (const l of lines) {
        instantHistory.push({ tagged: l, key: keyRef.current++ });
      }
    }
    setHistory(instantHistory);

    // Typewrite the last few messages sequentially
    let delay = 500;
    const CHAR_DELAY = 25;
    const LINE_PAUSE = 300;
    const MSG_PAUSE = 600;

    for (let mi = 0; mi < typewriteLines.length; mi++) {
      const lines = typewriteLines[mi] ?? [];
      const lineData = lines.map((l) => ({
        tagged: l,
        total: stripTags(l).length,
        typed: 0,
      }));

      // Show the typing lines
      const capturedMi = mi;
      const startTimer = setTimeout(() => {
        setTypedLines(lineData);
      }, delay);
      timersRef.current.push(startTimer);

      // Type each character
      let msgDelay = delay;
      for (let li = 0; li < lineData.length; li++) {
        const lineLen = lineData[li]?.total ?? 0;
        for (let ci = 1; ci <= lineLen; ci++) {
          const capturedLi = li;
          const capturedCi = ci;
          msgDelay += CHAR_DELAY;
          const t = setTimeout(() => {
            setTypedLines((prev) => {
              const next = [...prev];
              if (next[capturedLi]) {
                next[capturedLi] = { ...next[capturedLi], typed: capturedCi };
              }
              return next;
            });
          }, msgDelay);
          timersRef.current.push(t);
        }
        msgDelay += LINE_PAUSE;
      }

      // Finish: move to history
      const finishTimer = setTimeout(() => {
        setTypedLines([]);
        setHistory((prev) => [
          ...prev,
          ...lines.map((l) => ({ tagged: l, key: keyRef.current++ })),
        ]);
      }, msgDelay + 300);
      timersRef.current.push(finishTimer);

      delay = msgDelay + MSG_PAUSE;
    }

    return () => clearTimers();
  }, [loading, activityLines, status, clearTimers]);

  // Check if currently typing
  const isTyping = typedLines.length > 0;
  const allTyped = isTyping && typedLines.every((l) => l.typed >= l.total);

  return (
    <div className="flex flex-col rounded-sm border border-border-default overflow-hidden flex-1 min-h-0">
      {/* Header */}
      <div className="border-b border-border-subtle bg-canvas-elevated px-4 py-2 shrink-0">
        <span className="text-[11px] font-medium tracking-[0.08em] text-text-secondary">
          activity_log
        </span>
      </div>

      {/* CRT screen */}
      <div className="relative flex-1 min-h-0 bg-canvas-base">
        {/* Scanlines */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'repeating-linear-gradient(0deg, rgba(94,236,192,0.05), rgba(94,236,192,0.05) 1px, transparent 1px, transparent 3px)',
            mixBlendMode: 'screen',
          }}
        />

        {/* Flicker */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            backgroundColor: 'rgba(94, 236, 192, 0.03)',
            animation: 'crt-flicker 4s ease-in-out infinite',
          }}
        />

        {/* Vignette */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)',
          }}
        />

        {/* Scrollable content */}
        <div ref={scrollRef} className="relative z-0 p-4 overflow-y-auto h-full">
          <div className="text-[0.8125rem] leading-[1.8] text-text-secondary">

            {/* Loading state */}
            {loading && (
              <div className="flex">
                <span className="text-text-tertiary opacity-60 mr-1 shrink-0">&gt;</span>
                <span className="animate-pulse">loading activity...</span>
              </div>
            )}

            {/* Completed history */}
            {history.map((line) => (
              <div key={line.key} className="flex">
                <span className="text-text-tertiary opacity-60 mr-1 shrink-0">&gt;</span>
                <span>{parseColorTags(line.tagged)}</span>
              </div>
            ))}

            {/* Currently typing */}
            {typedLines.map((line, i) => (
              <div key={`typing-${i}`} className="flex">
                <span className="text-text-tertiary opacity-60 mr-1 shrink-0">&gt;</span>
                <span>
                  {renderPartialLine(line.tagged, line.typed)}
                  {line.typed < line.total && (
                    <span
                      className="inline-block bg-primary align-text-bottom"
                      style={{
                        width: '7px',
                        height: '14px',
                        opacity: 0.5,
                        animation: 'crt-blink 1.2s step-end infinite',
                      }}
                    />
                  )}
                </span>
              </div>
            ))}

            {/* Blinking cursor when idle or after typing completes */}
            {(!isTyping || allTyped) && !loading && (
              <div className="flex items-center gap-1">
                <span className="text-text-tertiary opacity-60">&gt;</span>
                <span
                  className="inline-block bg-primary"
                  style={{
                    width: '7px',
                    height: '14px',
                    opacity: 0.5,
                    animation: 'crt-blink 1.2s step-end infinite',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Parse {green}...{/green} and {amber}...{/amber} for completed lines. */
function parseColorTags(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\{(green|amber)\}(.*?)\{\/\1\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const color = match[1];
    const content = match[2];
    parts.push(
      <span
        key={`${match.index}-${color}`}
        className={
          color === 'green' ? 'text-primary opacity-35' : 'text-accent opacity-40'
        }
      >
        {content}
      </span>,
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// ── Main component ─────────────────────────────────────────────────

interface FundDetailProps {
  vaultAddress: string;
  previewStatus?: string | null;
}

export function FundDetail({ vaultAddress, previewStatus }: FundDetailProps) {
  const { data: terms, loading: termsLoading, error: termsError } = useFundTerms(vaultAddress);
  const { data: stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useFundStats(vaultAddress);

  // Apply preview override if provided
  const previewOverride = previewStatus ? PREVIEW_STATS_OVERRIDES[previewStatus] : null;

  // Show full-page loading only while terms is pending (stats loads progressively)
  const showLoading = !previewStatus && termsLoading;
  const showError = !previewStatus && !termsLoading && !terms;

  // Use placeholders in preview mode; use real data (or neutral defaults) otherwise.
  // Neutral defaults feed the hooks without showing fake content during loading.
  const LOADING_TERMS: FundTerms = {
    ...PLACEHOLDER_TERMS,
    metadata: { ...PLACEHOLDER_TERMS.metadata!, name: '', managerName: '', description: '', strategyType: '', riskLevel: '' },
  };
  const t = previewStatus ? (terms ?? PLACEHOLDER_TERMS) : (terms ?? LOADING_TERMS);
  const s = previewOverride
    ? { ...PLACEHOLDER_STATS, ...previewOverride }
    : (stats ?? { ...PLACEHOLDER_STATS, depositorCount: 0 });

  const name = t.metadata?.name || '...loading...';
  const metadata = t.metadata;
  const verified = metadata?.erc8004?.verified ?? false;
  const agentId = metadata?.erc8004?.agentId;
  const status = s.status;

  const { command, segments } = buildCommandSegments(name);

  // Title scramble
  const fullTitle = name.toUpperCase().replace(/\s+/g, '_') + '_'.repeat(40);
  const titleScramble = useScramble(fullTitle, { duration: 1400, autoStart: false });

  // Progressive loading: terms-dependent scrambles fire first, stats-dependent later
  const termsReady = !!previewStatus || !!terms;
  const statsReady = !!previewStatus || !!stats;

  // --- Title scramble (terms-gated) ---
  const titleTriggeredRef = useRef(false);
  const triggerTitle = titleScramble.trigger;
  useEffect(() => {
    if (termsReady && !titleTriggeredRef.current) {
      titleTriggeredRef.current = true;
      const id = setTimeout(triggerTitle, 100);
      return () => clearTimeout(id);
    }
  }, [termsReady, triggerTitle]);

  useEffect(() => {
    if (!termsReady) return;
    const id = setInterval(triggerTitle, TIMING.TITLE_RESCRAMBLE);
    return () => clearInterval(id);
  }, [termsReady, triggerTitle]);

  // Status block scrambles
  const statusScramble = useScramble(STATUS_LABELS[status], { duration: 800, autoStart: false });
  const agentScramble = useScramble(metadata?.managerName ?? 'unknown', { duration: 600, autoStart: false });
  const investorsScramble = useScramble(String(s.depositorCount), { duration: 400, autoStart: false });

  const triggerStatus = statusScramble.trigger;
  const triggerAgent = agentScramble.trigger;
  const triggerInvestors = investorsScramble.trigger;

  // --- Agent scramble (terms-gated, data from metadata) ---
  const agentTriggeredRef = useRef(false);
  useEffect(() => {
    if (termsReady && !agentTriggeredRef.current) {
      agentTriggeredRef.current = true;
      const id = setTimeout(triggerAgent, 300);
      return () => clearTimeout(id);
    }
  }, [termsReady, triggerAgent]);

  // --- Status + investors scramble (stats-gated) ---
  const statusTriggeredRef = useRef(false);
  useEffect(() => {
    if (statsReady && !statusTriggeredRef.current) {
      statusTriggeredRef.current = true;
      const id = setTimeout(() => {
        triggerStatus();
        triggerInvestors();
      }, 300);
      return () => clearTimeout(id);
    }
  }, [statsReady, triggerStatus, triggerInvestors]);

  // Re-scramble all status block fields together
  useEffect(() => {
    if (!statsReady) return;
    const id = setInterval(() => {
      triggerStatus();
      triggerAgent();
      triggerInvestors();
    }, TIMING.STATUS_RESCRAMBLE);
    return () => clearInterval(id);
  }, [statsReady, triggerStatus, triggerAgent, triggerInvestors]);

  // Card visibility
  const [cardVisible, setCardVisible] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setCardVisible(true), 1200);
    return () => clearTimeout(id);
  }, []);


  const minRaiseMet = statsReady && BigInt(s.totalDeposited) >= BigInt(t.minRaise);
  const snakeTitle = name.toUpperCase().replace(/\s+/g, '_');

  if (showLoading) {
    return (
      <section className="px-4 pt-10 pb-24 sm:px-6 sm:pt-[104px] lg:px-8 lg:pl-12 lg:pr-12">
        <div className="w-full max-w-[1400px]">
          <div className="text-[0.875rem] leading-[2] text-text-secondary font-mono">
            <span className="text-primary">&gt;</span> loading fund data
            <span className="inline-block animate-pulse">...</span>
          </div>
        </div>
      </section>
    );
  }

  if (showError) {
    return (
      <section className="px-4 pt-10 pb-24 sm:px-6 sm:pt-[104px] lg:px-8 lg:pl-12 lg:pr-12">
        <div className="w-full max-w-[1400px] space-y-4">
          <div className="text-[0.875rem] leading-[2] text-negative font-mono">
            <span className="text-negative">&gt;</span> error: failed to load fund
          </div>
          {(termsError || statsError) && (
            <div className="text-[0.8125rem] text-text-muted font-mono">
              {termsError || statsError}
            </div>
          )}
          <div className="text-[0.8125rem] text-text-muted font-mono">
            vault: {vaultAddress}
          </div>
          <Link
            href="/"
            className="inline-block text-[0.75rem] font-medium uppercase tracking-[0.1em] text-text-tertiary hover:text-primary transition-colors mt-4"
          >
            &lt; back_to_funds
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 pt-10 pb-24 sm:px-6 sm:pt-[104px] lg:px-8 lg:pl-12 lg:pr-12">

      {/* ── Header area (full width, max-w-4xl) ─────────────────── */}
      <div className="w-full max-w-[1400px]">

        {/* Fund title */}
        <h2 className="mb-8 whitespace-nowrap overflow-hidden text-[2rem] font-semibold tracking-[0.02em] leading-[1.2] text-text-primary lowercase">
          {titleScramble.text.slice(0, snakeTitle.length)}
          <span className="text-text-muted">
            {titleScramble.text.slice(snakeTitle.length)}
          </span>
        </h2>

        {/* Typewriter command */}
        <div className="mb-6">
          <TypewriterCommand
            command={command}
            segments={segments}
            retypeInterval={TIMING.TITLE_RESCRAMBLE}
          />
        </div>

        {/* Status block */}
        <div className="text-sm mb-10">
          <div className="flex">
            <span className="w-[120px] text-text-secondary font-medium">STATUS</span>
            {statsReady
              ? <span className={STATUS_COLORS[status]}>{statusScramble.text}</span>
              : <span className="text-text-muted animate-pulse">...</span>
            }
          </div>
          <div className="flex items-center">
            <span className="w-[120px] text-text-secondary font-medium">AGENT</span>
            <span className="text-primary">{agentScramble.text}</span>
            {verified && agentId && (
              <a
                href={`${URLS.ERC8004_AGENT}${agentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-3 text-[11px] font-medium uppercase tracking-[0.08em] text-primary border border-primary-border rounded-sm px-1.5 py-0.5 hover:bg-primary-surface"
              >
                ERC-8004 VERIFIED
              </a>
            )}
          </div>
          <div className="flex">
            <span className="w-[120px] text-text-secondary font-medium">INVESTORS</span>
            {statsReady
              ? <span className="text-text-primary">{investorsScramble.text}</span>
              : <span className="text-text-muted animate-pulse">...</span>
            }
          </div>
        </div>
      </div>

      {/* ── Two-column layout (card + sidebar aligned) ─────────── */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)] lg:grid-rows-[auto_1fr] gap-4 lg:gap-8 max-w-[1400px] transition-opacity duration-300 ${cardVisible ? 'opacity-100' : 'opacity-0'}`}
      >

        {/* Progress bar — first on mobile, right column row 1 on desktop */}
        <div className="lg:col-start-2 lg:row-start-1">
          {statsReady ? (
            <AsciiProgressBar
              totalDeposited={s.totalDeposited}
              vaultBalance={s.vaultBalance}
              minRaise={t.minRaise}
              maxRaise={t.maxRaise}
              raiseAddress={t.raise}
              vaultAddress={t.vault}
              fundName={name}
              status={status}
              previewDeposit={previewStatus ? '5000000000' : null}
              onTransactionSuccess={refetchStats}
            />
          ) : (
            <div className="border border-border bg-surface-primary rounded-md p-4 font-mono text-xs text-text-muted">
              <span className="animate-pulse">loading stats...</span>
            </div>
          )}
        </div>

        {/* Details card — second on mobile, left column spanning both rows on desktop */}
        <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2">
          <WindowChrome
            title={toSnakeCaseFund(name)}
            rightSlot={<Erc8004Badge verified={verified} agentId={agentId} />}
          >
            <div className="px-3 py-5 lg:px-6">

              {/* Metadata */}
              <DetailLine label="agent">
                <span className="text-text-primary">&quot;{metadata?.managerName ?? 'unknown'}&quot;</span>
              </DetailLine>
              <DetailLine label="strategy">
                <span className="text-text-primary">&quot;{metadata?.strategyType ?? 'unknown'}&quot;</span>
              </DetailLine>
              <DescriptionBlock text={metadata?.description ?? 'No description'} />

              <SectionDivider />

              {/* Terms */}
              <DetailLine label="management_fee">
                <span className="text-primary">{formatBps(t.managementFeeBps)}</span>
              </DetailLine>
              <DetailLine label="performance_fee">
                <span className="text-primary">{formatBps(t.performanceFeeBps)}</span>
              </DetailLine>
              <DetailLine label="fund_duration">
                <span className="text-primary">{formatDuration(t.fundDuration)}</span>
              </DetailLine>
              <DetailLine label="min_raise">
                <span className="text-primary">{formatUSDC(t.minRaise)} USDC</span>
              </DetailLine>
              <DetailLine label="max_raise">
                <span className="text-primary">{formatUSDC(t.maxRaise)} USDC</span>
              </DetailLine>
              <DetailLine label="deposit_window">
                <span suppressHydrationWarning className="text-text-primary">
                  {formatDate(t.depositStart)} — {formatDate(t.depositEnd)}
                </span>
              </DetailLine>
              <DetailLine label="withdrawals">
                {statsReady ? (
                  <>
                    {status === 'raising' && <span className="text-primary">OPEN</span>}
                    {status === 'active' && <span className="text-negative">LOCKED</span>}
                    {status === 'winding_down' && <span className="text-primary">OPEN</span>}
                    {status === 'frozen' && <span className="text-negative">FROZEN</span>}
                    {status === 'cancelled' && <span className="text-primary">REFUNDABLE</span>}
                  </>
                ) : (
                  <span className="text-text-muted animate-pulse">...</span>
                )}
              </DetailLine>

              <SectionDivider />

              {/* Stats */}
              <DetailLine label="total_deposited">
                {statsReady
                  ? <span className="text-primary">{formatUSDC(s.totalDeposited)} USDC</span>
                  : <span className="text-text-muted animate-pulse">...</span>
                }
              </DetailLine>
              <DetailLine label="investors">
                {statsReady
                  ? <span className="text-text-primary">{s.depositorCount}</span>
                  : <span className="text-text-muted animate-pulse">...</span>
                }
              </DetailLine>
              <DetailLine label="raise_progress">
                {statsReady ? (
                  <>
                    <span className="text-primary">{formatRaiseProgress(s.totalDeposited, t.maxRaise)}</span>
                    {minRaiseMet && (
                      <span className="ml-2 text-[10px] font-medium uppercase tracking-[0.08em] text-primary border border-primary-border rounded-sm px-1.5 py-0.5">
                        MIN_RAISE_MET
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-text-muted animate-pulse">...</span>
                )}
              </DetailLine>
              <DetailLine label="vault_balance">
                {statsReady
                  ? <span className="text-primary">{formatUSDC(s.vaultBalance)} USDC</span>
                  : <span className="text-text-muted animate-pulse">...</span>
                }
              </DetailLine>

              {statsReady && status === 'active' && (
                <DetailLine label="drawdown">
                  <span className="text-primary">
                    {formatDrawdownProgress(s.cumulativeDrawn, s.drawdownAllowance)}
                  </span>
                </DetailLine>
              )}

              <SectionDivider />

              {/* Addresses */}
              <AddressLine label="vault" address={t.vault} />
              <AddressLine label="raise" address={t.raise} />
              <AddressLine label="manager_wallet" address={t.manager} />

            </div>
          </WindowChrome>
        </div>

        {/* Activity log — third on mobile, right column row 2 on desktop */}
        <div className="min-w-0 lg:col-start-2 lg:row-start-2 lg:min-h-0 lg:overflow-hidden flex flex-col">
          <ActivityLog vaultAddress={t.vault} status={status} />
        </div>

      </div>

      {/* Back link — below both columns */}
      <div className="mt-8">
        <Link
          href="/"
          className="text-[0.75rem] font-medium uppercase tracking-[0.1em] text-text-tertiary hover:text-primary transition-colors"
        >
          &lt; back_to_funds
        </Link>
      </div>
    </section>
  );
}
