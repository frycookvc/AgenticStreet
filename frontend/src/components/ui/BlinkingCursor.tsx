'use client';

interface BlinkingCursorProps {
  active?: boolean;
}

export function BlinkingCursor({ active = true }: BlinkingCursorProps) {
  return (
    <span
      className={`inline-block h-4 w-2 align-middle bg-primary${active ? ' animate-[blink_1s_step-end_infinite]' : ''}`}
      aria-hidden="true"
    />
  );
}
