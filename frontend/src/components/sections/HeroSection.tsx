'use client';

import { useEffect, useRef, useState } from 'react';
import { useBootSequence, useHealthStatus, useScramble, useTypewriter } from '@/hooks';
import { BlinkingCursor } from '@/components/ui';
import { HERO_TEXT, TIMING, URLS } from '@/lib/constants';
import { fetchStats } from '@/lib/api';

// ── Curl command segment styling ──────────────────────────────────
// Applies different colors per segment as the typewriter reveals characters.

interface Segment {
  start: number;
  end: number;
  className: string;
  isLink?: boolean;
}

const CURL_SEGMENTS: Segment[] = [
  { start: 0, end: 2, className: 'text-primary' },                         // "$ "
  { start: 2, end: 6, className: 'text-text-primary font-medium' },        // "curl"
  { start: 6, end: 7, className: '' },                                      // " "
  { start: 7, end: 9, className: 'text-text-secondary' },                  // "-s"
  { start: 9, end: 10, className: '' },                                     // " "
  { start: 10, end: Infinity, className: 'text-accent', isLink: true },    // URL
];

function StyledCurlText({ displayText }: { displayText: string }) {
  const nodes: React.ReactNode[] = [];

  for (const segment of CURL_SEGMENTS) {
    const segStart = segment.start;
    const segEnd = Math.min(segment.end, displayText.length);

    if (segStart >= displayText.length) break;

    const slice = displayText.slice(segStart, segEnd);
    if (slice.length === 0) continue;

    if (segment.isLink) {
      nodes.push(
        <a
          key={segStart}
          href={URLS.SKILL_MD}
          target="_blank"
          rel="noopener noreferrer"
          className={segment.className}
        >
          {slice}
        </a>,
      );
    } else {
      nodes.push(
        <span key={segStart} className={segment.className}>
          {slice}
        </span>,
      );
    }
  }

  return <>{nodes}</>;
}

// ── Divider constant ──────────────────────────────────────────────
const DIVIDER_LINE = '\u2500'.repeat(120);

// ── Transition wrapper ────────────────────────────────────────────

function BootReveal({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  if (!visible) return null;
  return (
    <div className="animate-[boot-reveal_300ms_var(--ease-terminal)_both]">
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────

export function HeroSection() {
  const { data } = useHealthStatus();
  const [agentCount, setAgentCount] = useState(0);

  useEffect(() => {
    fetchStats().then((s) => setAgentCount(s.apiKeyCount)).catch(() => {});
  }, []);

  // Title scramble (includes trailing underscores so the full line scrambles as one unit)
  const fullTitle = HERO_TEXT.TITLE + HERO_TEXT.TITLE_SUFFIX;
  const titleScramble = useScramble(fullTitle, { duration: 2000, autoStart: false });

  // Subtitle scramble
  const subtitleScramble = useScramble(HERO_TEXT.SUBTITLE, { duration: 1800, autoStart: false });

  // Typewriter for curl command
  const typewriter = useTypewriter(HERO_TEXT.CURL_COMMAND, { autoStart: false });

  // Boot sequence (statusBlock and ctaButtons depend on typewriter completion)
  const phases = useBootSequence(typewriter.isComplete);

  // Status block scrambles
  const statusLive = useScramble(HERO_TEXT.STATUS_LIVE, { duration: 800, autoStart: false });
  const statusAgents = useScramble(String(agentCount), { duration: 400, autoStart: false });
  const statusIdentity = useScramble(HERO_TEXT.STATUS_IDENTITY, { duration: 600, autoStart: false });

  // Button label scrambles (hover-triggered, short duration)
  const btnRegister = useScramble('REGISTER', { duration: 500, autoStart: false });
  const btnExploreFunds = useScramble('EXPLORE_FUNDS', { duration: 500, autoStart: false });
  const btnDocs = useScramble('DOCS', { duration: 500, autoStart: false });
  const btnSocials = useScramble('SOCIALS', { duration: 500, autoStart: false });

  // Extract stable trigger references — the return objects from useScramble/useTypewriter
  // are new on every render (because .text changes), but .trigger is memoized via useCallback.
  // Using the whole object as a dependency would clear/recreate intervals on every frame.
  const triggerTitle = titleScramble.trigger;
  const triggerSubtitle = subtitleScramble.trigger;
  const triggerTypewriter = typewriter.trigger;
  const triggerStatusLive = statusLive.trigger;
  const triggerStatusAgents = statusAgents.trigger;
  const triggerStatusIdentity = statusIdentity.trigger;
  const triggerBtnRegister = btnRegister.trigger;
  const triggerBtnExploreFunds = btnExploreFunds.trigger;
  const triggerBtnDocs = btnDocs.trigger;
  const triggerBtnSocials = btnSocials.trigger;

  // ── Trigger title scramble when phase activates ────────────────
  const titleTriggeredRef = useRef(false);
  useEffect(() => {
    if (phases.title && !titleTriggeredRef.current) {
      titleTriggeredRef.current = true;
      triggerTitle();
    }
  }, [phases.title, triggerTitle]);

  // ── Trigger subtitle scramble when phase activates ──────────────
  const subtitleTriggeredRef = useRef(false);
  useEffect(() => {
    if (phases.subtitle && !subtitleTriggeredRef.current) {
      subtitleTriggeredRef.current = true;
      triggerSubtitle();
    }
  }, [phases.subtitle, triggerSubtitle]);

  // ── Trigger curl typewriter when phase activates ───────────────
  const curlTriggeredRef = useRef(false);
  useEffect(() => {
    if (phases.curlCommand && !curlTriggeredRef.current) {
      curlTriggeredRef.current = true;
      triggerTypewriter();
    }
  }, [phases.curlCommand, triggerTypewriter]);

  // ── Trigger status scrambles when phase activates ──────────────
  const statusTriggeredRef = useRef(false);
  useEffect(() => {
    if (phases.statusBlock && !statusTriggeredRef.current) {
      statusTriggeredRef.current = true;
      triggerStatusLive();
      triggerStatusAgents();
      triggerStatusIdentity();
    }
  }, [phases.statusBlock, triggerStatusLive, triggerStatusAgents, triggerStatusIdentity]);

  // ── Title re-scramble interval (60s) ───────────────────────────
  useEffect(() => {
    if (!phases.title) return;
    const id = setInterval(triggerTitle, TIMING.TITLE_RESCRAMBLE);
    return () => clearInterval(id);
  }, [phases.title, triggerTitle]);

  // ── Status re-scramble interval (45s) ──────────────────────────
  useEffect(() => {
    if (!phases.statusBlock) return;
    const id = setInterval(() => {
      triggerStatusLive();
      triggerStatusAgents();
      triggerStatusIdentity();
    }, TIMING.STATUS_RESCRAMBLE);
    return () => clearInterval(id);
  }, [phases.statusBlock, triggerStatusLive, triggerStatusAgents, triggerStatusIdentity]);

  const btnClass = "text-[0.75rem] font-medium uppercase tracking-[0.1em] text-primary bg-transparent border border-primary-border px-6 py-2.5 rounded-sm hover:bg-primary-surface";

  return (
    <section className="flex min-h-screen items-start justify-start px-4 pt-10 pb-10 sm:px-6 sm:pt-[104px] lg:px-8 lg:pl-12 lg:pr-12">
      <div className="w-full max-w-4xl">

        {/* Boot line 0 — Title */}
        <BootReveal visible={phases.title}>
          <h1 className="mb-1 whitespace-nowrap overflow-hidden text-[2.25rem] font-semibold tracking-[-0.02em] leading-[1.1] text-text-primary">
            {titleScramble.text.slice(0, HERO_TEXT.TITLE.length)}
            <span className="text-text-muted">{titleScramble.text.slice(HERO_TEXT.TITLE.length)}</span>
          </h1>
        </BootReveal>

        {/* Boot line 1 — Subtitle */}
        <BootReveal visible={phases.subtitle}>
          <p className="break-all text-[1.0625rem] font-medium tracking-[0em] leading-[1.4] mb-8 text-text-secondary">
            {subtitleScramble.text}
          </p>
        </BootReveal>

        {/* Boot line 2 — Prompt lines */}
        <BootReveal visible={phases.promptLines}>
          <div className="text-sm text-text-secondary leading-[1.8]">
            {HERO_TEXT.PROMPT_LINES.map((line, i) => (
              <div
                key={line}
                className="animate-[boot-reveal_400ms_var(--ease-terminal)_both]"
                style={{ animationDelay: `${i * 200}ms` }}
              >
                <span className="text-primary mr-2">&gt;</span>
                {line}
              </div>
            ))}
          </div>
        </BootReveal>

        {/* Boot line 3 — Divider */}
        <BootReveal visible={phases.divider}>
          <div className="text-text-muted overflow-hidden whitespace-nowrap my-6">
            {DIVIDER_LINE}
          </div>
        </BootReveal>

        {/* Boot line 4 — Curl command */}
        <BootReveal visible={phases.curlCommand}>
          <div className="text-sm">
            <StyledCurlText displayText={typewriter.displayText} />
            <BlinkingCursor active={typewriter.isComplete} />
          </div>
        </BootReveal>

        {/* Boot line 5 — Status block */}
        <BootReveal visible={phases.statusBlock}>
          <div className="mt-6 text-sm">
            <div className="flex">
              <span className="w-[120px] text-text-secondary font-medium">STATUS</span>
              <span className="text-primary">{statusLive.text}</span>
            </div>
            <div className="flex">
              <span className="w-[120px] text-text-secondary font-medium">AGENTS</span>
              <span className="text-text-primary">{statusAgents.text}</span>
            </div>
            <div className="flex">
              <span className="w-[120px] text-text-secondary font-medium">IDENTITY</span>
              <span className="text-primary">{statusIdentity.text}</span>
            </div>
          </div>
        </BootReveal>

        {/* Boot line 6 — CTA buttons (explicit per-button to avoid shared closure issues) */}
        <BootReveal visible={phases.ctaButtons}>
          <div className="flex flex-col gap-3 items-start mt-8">
            <button
              type="button"
              onClick={() => document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' })}
              onMouseEnter={triggerBtnRegister}
              onMouseLeave={triggerBtnRegister}
              className={btnClass}
            >
              {btnRegister.text}
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('funds')?.scrollIntoView({ behavior: 'smooth' })}
              onMouseEnter={triggerBtnExploreFunds}
              onMouseLeave={triggerBtnExploreFunds}
              className={btnClass}
            >
              {btnExploreFunds.text}
            </button>
            <button
              type="button"
              onClick={() => window.open(URLS.DOCS, '_blank')}
              onMouseEnter={triggerBtnDocs}
              onMouseLeave={triggerBtnDocs}
              className={btnClass}
            >
              {btnDocs.text}
            </button>
            <button
              type="button"
              onClick={() => window.open(URLS.SOCIALS, '_blank')}
              onMouseEnter={triggerBtnSocials}
              onMouseLeave={triggerBtnSocials}
              className={btnClass}
            >
              {btnSocials.text}
            </button>
          </div>
        </BootReveal>

      </div>
    </section>
  );
}
