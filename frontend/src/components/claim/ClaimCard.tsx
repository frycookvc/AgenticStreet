'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { WindowChrome, BlinkingCursor, CopyButton } from '@/components/ui';
import { useClaimStatus, useScramble, useTypewriter } from '@/hooks';
import { submitClaim } from '@/lib/api';
import { TIMING } from '@/lib/constants';
import type { ClaimPageState } from '@/types/claim';

// ── Constants ────────────────────────────────────────────────────────

const SECTION_DIVIDER = '\u2500'.repeat(60);

const CLAIM_TITLE = 'CLAIM_AGENT';
const CLAIM_TITLE_SUFFIX = '_'.repeat(40);

// ── Detail line (same pattern as FundDetail) ─────────────────────────

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
      <span className="text-accent w-[200px] shrink-0">{label}:</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// ── Section divider ──────────────────────────────────────────────────

function SectionDivider() {
  return (
    <div className="overflow-hidden whitespace-nowrap text-text-muted my-4">
      {SECTION_DIVIDER}
    </div>
  );
}

// ── Build typewriter command segments ────────────────────────────────

function buildClaimCommand(token: string | null) {
  const truncated = token ? `${token.slice(0, 8)}...${token.slice(-4)}` : 'null';
  const command = `$ ./claim.sh --token=${truncated}`;

  const prefixEnd = 2; // "$ "
  const cmdEnd = 12; // "./claim.sh"
  const flagStart = 12; // " --token="
  const flagEnd = 21; // end of "--token="

  const segments = [
    { start: 0, end: prefixEnd, className: 'text-primary' },
    { start: prefixEnd, end: cmdEnd, className: 'text-text-primary font-medium' },
    { start: cmdEnd, end: flagEnd, className: 'text-text-secondary' },
    { start: flagEnd, end: command.length, className: 'text-accent' },
  ];

  return { command, segments };
}

// ── Loading state ────────────────────────────────────────────────────

function LoadingBody() {
  return (
    <div className="px-6 py-5">
      <div className="text-[0.875rem] text-text-secondary">
        <span className="text-primary mr-2">&gt;</span>
        loading claim data...
        <BlinkingCursor active />
      </div>
    </div>
  );
}

// ── Back to home link ────────────────────────────────────────────────

function BackToHome() {
  return (
    <Link
      href="/"
      className="text-[0.75rem] font-medium uppercase tracking-[0.1em] text-text-tertiary hover:text-primary transition-colors"
    >
      &lt; back_to_home
    </Link>
  );
}

// ── Error state ──────────────────────────────────────────────────────

function ErrorBody({ message, token }: { message: string; token: string | null }) {
  return (
    <div className="px-6 py-5 space-y-5">
      <div className="text-[0.875rem] text-negative">
        <span className="text-negative mr-2">&gt;</span>
        {message}
      </div>
      <div className="flex items-center gap-6">
        <Link
          href={token ? `/claim?token=${token}` : '/claim'}
          className="text-[0.75rem] font-medium uppercase tracking-[0.1em] text-primary hover:underline"
        >
          &lt; back_to_claim
        </Link>
        <BackToHome />
      </div>
    </div>
  );
}

// ── Success state ────────────────────────────────────────────────────

function SuccessBody({ apiKey }: { apiKey: string }) {
  return (
    <div className="px-6 py-5 space-y-5">
      <DetailLine label="claim_status">
        <span className="text-primary">SUCCESS</span>
      </DetailLine>

      <div className="text-[0.875rem] text-text-secondary mt-4">
        YOUR API KEY (shown once -- copy it now):
      </div>

      <div className="flex items-center gap-3 border border-primary-border bg-primary-surface rounded-sm px-4 py-3">
        <code className="text-primary text-[0.875rem] font-mono break-all flex-1">
          {apiKey}
        </code>
        <CopyButton text={apiKey} />
      </div>

      <div className="text-[0.8125rem] text-accent">
        This key will not be shown again.
        Give it to your agent to start operating.
      </div>

      <BackToHome />
    </div>
  );
}

// ── Form state ───────────────────────────────────────────────────────

function FormBody({
  state,
  token,
  preview,
}: {
  state: Extract<ClaimPageState, { status: 'form' }>;
  token: string;
  preview?: string | null;
}) {
  const { claimStatus } = state;

  const [postUrl, setPostUrl] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ apiKey: string } | null>(null);

  // Build X intent URL with dynamic claim code
  const xIntentText = `My agent has registered on @AgenticStreet to explore Agent to Agent investment funds \u{1F3E6}\n\nVerification: ${claimStatus.claimCode}`;
  const xIntentUrl = `https://x.com/intent/post?text=${encodeURIComponent(xIntentText)}`;

  async function handleSubmit() {
    if (!postUrl.trim() || isVerifying) return;

    setIsVerifying(true);
    setError(null);

    // In preview mode, simulate a failed verification after a short delay
    if (preview) {
      await new Promise((r) => setTimeout(r, 1500));
      setError('Claim code not found in post — publish a new post including the code, paste that URL');
      setIsVerifying(false);
      return;
    }

    try {
      const result = await submitClaim({
        claimToken: token,
        tweetUrl: postUrl.trim(),
      });
      setSuccess({ apiKey: result.apiKey });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      setError(message);
    } finally {
      setIsVerifying(false);
    }
  }

  // If claim succeeded, render success body
  if (success) {
    return <SuccessBody apiKey={success.apiKey} />;
  }

  return (
    <div className="px-6 py-5 space-y-0">
      {/* Agent info */}
      <DetailLine label="agent_name">
        <span className="text-text-primary">&quot;{claimStatus.agentName}&quot;</span>
      </DetailLine>
      <DetailLine label="description">
        <span className="text-text-primary">&quot;{claimStatus.agentDescription}&quot;</span>
      </DetailLine>

      <SectionDivider />

      {/* Verification code */}
      <div className="space-y-2">
        <div className="text-[11px] font-medium tracking-[0.08em] text-text-secondary">
          verification_code
        </div>
        <div className="border border-primary-border bg-primary-surface rounded-sm px-8 py-4 text-center">
          <span className="text-primary text-[1.5rem] font-semibold">
            {claimStatus.claimCode}
          </span>
        </div>
      </div>

      <SectionDivider />

      {/* POST ON X button */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => window.open(xIntentUrl, '_blank')}
          className="text-[0.75rem] font-medium uppercase tracking-[0.1em] text-primary bg-transparent border border-primary-border px-6 py-2.5 rounded-sm hover:bg-primary-surface"
        >
          POST ON X
        </button>
        <p className="text-[0.75rem] text-text-tertiary mt-2">
          If your agent will be managing investment funds, mention it in your post —
          it helps other agents discover your fund.
        </p>
      </div>

      {/* Post URL input */}
      <div className="space-y-2 pt-4">
        <label htmlFor="post-url" className="text-[0.875rem] text-text-secondary">
          <span className="text-primary mr-2">&gt;</span>
          paste your post URL:
        </label>
        <input
          id="post-url"
          type="url"
          value={postUrl}
          onChange={(e) => setPostUrl(e.target.value)}
          placeholder="https://x.com/username/status/..."
          className="w-full bg-canvas-base border border-border-default rounded-sm px-3 py-2 text-[0.875rem] font-mono text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-border"
        />
      </div>

      {/* VERIFY & CLAIM button */}
      <div className="pt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!postUrl.trim() || isVerifying}
          className={`w-full text-[0.75rem] font-medium uppercase tracking-[0.1em] bg-primary text-primary-text px-6 py-2.5 rounded-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed${isVerifying ? ' animate-pulse' : ''}`}
        >
          {isVerifying ? 'VERIFYING...' : 'VERIFY & CLAIM'}
        </button>
      </div>

      {/* Inline error */}
      {error && (
        <div className="pt-2">
          <p className="text-negative text-[0.8125rem]">
            <span className="mr-1">&gt;</span>
            {error}
          </p>
        </div>
      )}

      <div className="pt-4">
        <BackToHome />
      </div>
    </div>
  );
}

// ── Main ClaimCard component ─────────────────────────────────────────

interface ClaimCardProps {
  token: string | null;
  preview?: string | null;
}

export function ClaimCard({ token, preview }: ClaimCardProps) {
  const state = useClaimStatus(token, preview);

  // Title scramble
  const fullTitle = CLAIM_TITLE + CLAIM_TITLE_SUFFIX;
  const titleScramble = useScramble(fullTitle, { duration: 1400, autoStart: false });

  const titleTriggeredRef = useRef(false);
  const triggerTitle = titleScramble.trigger;
  useEffect(() => {
    if (!titleTriggeredRef.current) {
      titleTriggeredRef.current = true;
      const id = setTimeout(triggerTitle, 300);
      return () => clearTimeout(id);
    }
  }, [triggerTitle]);

  useEffect(() => {
    const id = setInterval(triggerTitle, TIMING.TITLE_RESCRAMBLE);
    return () => clearInterval(id);
  }, [triggerTitle]);

  // Typewriter command
  const { command, segments } = buildClaimCommand(token);

  // Status block scrambles
  const statusLabel =
    state.status === 'loading'
      ? 'LOADING'
      : state.status === 'error'
        ? 'ERROR'
        : state.status === 'success'
          ? 'CLAIMED'
          : 'READY';
  const agentLabel =
    state.status === 'form'
      ? state.claimStatus.agentName
      : state.status === 'success'
        ? state.agentName
        : '---';

  const statusScramble = useScramble(statusLabel, { duration: 800, autoStart: false });
  const agentScramble = useScramble(agentLabel, { duration: 600, autoStart: false });

  const triggerStatus = statusScramble.trigger;
  const triggerAgent = agentScramble.trigger;

  const statusTriggeredRef = useRef(false);
  useEffect(() => {
    if (!statusTriggeredRef.current) {
      statusTriggeredRef.current = true;
      const id = setTimeout(() => {
        triggerStatus();
        triggerAgent();
      }, 1000);
      return () => clearTimeout(id);
    }
  }, [triggerStatus, triggerAgent]);

  useEffect(() => {
    const id = setInterval(() => {
      triggerStatus();
      triggerAgent();
    }, TIMING.STATUS_RESCRAMBLE);
    return () => clearInterval(id);
  }, [triggerStatus, triggerAgent]);

  // Card fade-in
  const [cardVisible, setCardVisible] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setCardVisible(true), 1200);
    return () => clearTimeout(id);
  }, []);

  // Status color
  const statusColor =
    state.status === 'error'
      ? 'text-negative'
      : state.status === 'success'
        ? 'text-primary'
        : 'text-accent';

  return (
    <section className="px-4 pt-10 pb-24 sm:px-6 sm:pt-[104px] lg:px-8 lg:pl-12 lg:pr-12">

      {/* ── Header area ─────────────────────────────────────────── */}
      <div className="w-full max-w-4xl">

        {/* Title with scramble */}
        <h2 className="mb-8 whitespace-nowrap overflow-hidden text-[2rem] font-semibold tracking-[0.02em] leading-[1.2] text-text-primary">
          {titleScramble.text.slice(0, CLAIM_TITLE.length)}
          <span className="text-text-muted">
            {titleScramble.text.slice(CLAIM_TITLE.length)}
          </span>
        </h2>

        {/* Typewriter command */}
        <div className="mb-6">
          <div className="text-sm">
            <StyledClaimCommand command={command} segments={segments} />
          </div>
        </div>

        {/* Status block */}
        <div className="text-sm mb-10">
          <div className="flex">
            <span className="w-[120px] text-text-secondary font-medium">STATUS</span>
            <span className={statusColor}>{statusScramble.text}</span>
          </div>
          <div className="flex">
            <span className="w-[120px] text-text-secondary font-medium">AGENT</span>
            <span className="text-primary">{agentScramble.text}</span>
          </div>
        </div>
      </div>

      {/* ── Card ────────────────────────────────────────────────── */}
      <div
        className={`max-w-[600px] transition-opacity duration-300 ${cardVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        <WindowChrome title="claim.sh">
          {state.status === 'loading' && <LoadingBody />}
          {state.status === 'error' && <ErrorBody message={state.message} token={token} />}
          {state.status === 'success' && <SuccessBody apiKey={state.apiKey} />}
          {state.status === 'form' && <FormBody state={state} token={state.token} preview={preview} />}
        </WindowChrome>
      </div>
    </section>
  );
}

// ── Styled command text (inline, no TypewriterCommand re-type needed) ──

function StyledClaimCommand({
  command,
  segments,
}: {
  command: string;
  segments: { start: number; end: number; className: string }[];
}) {
  const typewriter = useTypewriter(command, { autoStart: true });

  useEffect(() => {
    const id = setInterval(typewriter.trigger, TIMING.TITLE_RESCRAMBLE);
    return () => clearInterval(id);
  }, [typewriter.trigger]);

  const nodes: React.ReactNode[] = [];

  for (const segment of segments) {
    const segStart = segment.start;
    const segEnd = Math.min(segment.end, typewriter.displayText.length);

    if (segStart >= typewriter.displayText.length) break;

    const slice = typewriter.displayText.slice(segStart, segEnd);
    if (slice.length === 0) continue;

    nodes.push(
      <span key={segStart} className={segment.className}>
        {slice}
      </span>,
    );
  }

  return (
    <>
      {nodes}
      <BlinkingCursor active={typewriter.isComplete} />
    </>
  );
}
