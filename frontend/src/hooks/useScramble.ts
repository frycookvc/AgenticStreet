'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SCRAMBLE_CHARS, TIMING } from '@/lib/constants';

interface UseScrambleOptions {
  /** Total animation duration in ms. Default: TIMING.SCRAMBLE_DURATION (1400ms) */
  duration?: number;
  /** Start the scramble animation immediately on mount. Default: true */
  autoStart?: boolean;
}

interface UseScrambleReturn {
  /** Current display text (scrambled or final) */
  text: string;
  /** Re-fire the scramble animation */
  trigger: () => void;
  /** True when all characters have settled to their final value */
  isComplete: boolean;
}

function getScrambledText(finalText: string, elapsed: number, duration: number): string {
  let result = '';
  const len = finalText.length;

  for (let i = 0; i < len; i++) {
    const settleTime = ((i + 1) / len) * duration;

    if (elapsed >= settleTime) {
      result += finalText[i];
    } else {
      const randomIndex = Math.floor(Math.random() * SCRAMBLE_CHARS.length);
      result += SCRAMBLE_CHARS[randomIndex];
    }
  }

  return result;
}

export function useScramble(
  finalText: string,
  options?: UseScrambleOptions,
): UseScrambleReturn {
  const duration = options?.duration ?? TIMING.SCRAMBLE_DURATION;
  const autoStart = options?.autoStart ?? true;

  const [text, setText] = useState<string>(finalText);
  const [isComplete, setIsComplete] = useState<boolean>(false);

  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const isRunningRef = useRef<boolean>(false);

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    isRunningRef.current = false;
  }, []);

  const animate = useCallback(
    (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;

      if (elapsed >= duration) {
        setText(finalText);
        setIsComplete(true);
        stopAnimation();
        return;
      }

      setText(getScrambledText(finalText, elapsed, duration));
      rafRef.current = requestAnimationFrame(animate);
    },
    [finalText, duration, stopAnimation],
  );

  const trigger = useCallback(() => {
    stopAnimation();
    startTimeRef.current = null;
    setIsComplete(false);

    if (finalText.length === 0) {
      setText('');
      setIsComplete(true);
      return;
    }

    isRunningRef.current = true;
    rafRef.current = requestAnimationFrame(animate);
  }, [finalText, animate, stopAnimation]);

  // Auto-start on mount (or when finalText / duration changes with autoStart enabled)
  useEffect(() => {
    if (autoStart) {
      trigger();
    }
    return stopAnimation;
  }, [autoStart, trigger, stopAnimation]);

  return { text, trigger, isComplete };
}
