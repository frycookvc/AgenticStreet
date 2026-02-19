'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TIMING } from '@/lib/constants';

interface UseTypewriterOptions {
  /** Milliseconds per character. Default: TIMING.TYPEWRITER_CHAR (30ms) */
  speed?: number;
  /** Start typing immediately on mount. Default: true */
  autoStart?: boolean;
  /** Milliseconds to wait before the first character appears. Default: 0 */
  startDelay?: number;
  /** Called once when the full text has been revealed */
  onComplete?: () => void;
}

interface UseTypewriterReturn {
  /** Currently visible portion of the text */
  displayText: string;
  /** True when all characters have been revealed */
  isComplete: boolean;
  /** Restart the typewriter from the beginning */
  trigger: () => void;
}

export function useTypewriter(
  text: string,
  options?: UseTypewriterOptions,
): UseTypewriterReturn {
  const speed = options?.speed ?? TIMING.TYPEWRITER_CHAR;
  const autoStart = options?.autoStart ?? true;
  const startDelay = options?.startDelay ?? 0;
  const onComplete = options?.onComplete;

  const [charIndex, setCharIndex] = useState<number>(0);
  const [isStarted, setIsStarted] = useState<boolean>(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Keep the onComplete ref fresh so the interval closure always calls the latest callback
  onCompleteRef.current = onComplete;

  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (delayRef.current !== null) {
      clearTimeout(delayRef.current);
      delayRef.current = null;
    }
  }, []);

  const startTyping = useCallback(() => {
    clearTimers();

    if (text.length === 0) {
      setCharIndex(0);
      setIsStarted(true);
      onCompleteRef.current?.();
      return;
    }

    setCharIndex(0);
    setIsStarted(false);

    delayRef.current = setTimeout(() => {
      setIsStarted(true);
      let currentIndex = 0;

      intervalRef.current = setInterval(() => {
        currentIndex += 1;
        setCharIndex(currentIndex);

        if (currentIndex >= text.length) {
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          onCompleteRef.current?.();
        }
      }, speed);
    }, startDelay);
  }, [text, speed, startDelay, clearTimers]);

  const trigger = useCallback(() => {
    startTyping();
  }, [startTyping]);

  // Auto-start on mount (or when text / speed / startDelay changes with autoStart enabled)
  useEffect(() => {
    if (autoStart) {
      startTyping();
    }
    return clearTimers;
  }, [autoStart, startTyping, clearTimers]);

  const isComplete = isStarted && charIndex >= text.length;
  const displayText = text.slice(0, charIndex);

  return { displayText, isComplete, trigger };
}
