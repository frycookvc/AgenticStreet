'use client';

import { useEffect, useRef } from 'react';
import { useTypewriter } from '@/hooks';
import { BlinkingCursor } from './BlinkingCursor';

// ── Segment-based coloring (same pattern as hero StyledCurlText) ────

interface Segment {
  start: number;
  end: number;
  className: string;
}

function StyledCommandText({
  displayText,
  segments,
}: {
  displayText: string;
  segments: Segment[];
}) {
  const nodes: React.ReactNode[] = [];

  for (const segment of segments) {
    const segStart = segment.start;
    const segEnd = Math.min(segment.end, displayText.length);

    if (segStart >= displayText.length) break;

    const slice = displayText.slice(segStart, segEnd);
    if (slice.length === 0) continue;

    nodes.push(
      <span key={segStart} className={segment.className}>
        {slice}
      </span>,
    );
  }

  return <>{nodes}</>;
}

// ── Public API ──────────────────────────────────────────────────────

interface TypewriterCommandProps {
  /** Full command string, e.g. "$ ls -la ./funds/" */
  command: string;
  /** Color segments keyed to character positions */
  segments: Segment[];
  /** Re-type interval in ms. 0 = type once. Default: 60000 */
  retypeInterval?: number;
  /** Typewriter speed in ms per char. Default: 30 */
  speed?: number;
}

export function TypewriterCommand({
  command,
  segments,
  retypeInterval = 60_000,
  speed = 30,
}: TypewriterCommandProps) {
  const typewriter = useTypewriter(command, { speed, autoStart: true });

  // Periodic re-type
  const triggerRef = useRef(typewriter.trigger);
  triggerRef.current = typewriter.trigger;

  useEffect(() => {
    if (retypeInterval <= 0) return;
    const id = setInterval(() => triggerRef.current(), retypeInterval);
    return () => clearInterval(id);
  }, [retypeInterval]);

  return (
    <div className="text-sm">
      <StyledCommandText displayText={typewriter.displayText} segments={segments} />
      <BlinkingCursor active={typewriter.isComplete} />
    </div>
  );
}
