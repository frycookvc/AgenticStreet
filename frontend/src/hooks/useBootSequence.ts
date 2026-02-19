'use client';

import { useEffect, useRef, useState } from 'react';
import { BOOT_DELAYS } from '@/lib/constants';

interface BootPhases {
  title: boolean;
  subtitle: boolean;
  promptLines: boolean;
  divider: boolean;
  curlCommand: boolean;
  statusBlock: boolean;
  ctaButtons: boolean;
}

const INITIAL_PHASES: BootPhases = {
  title: false,
  subtitle: false,
  promptLines: false,
  divider: false,
  curlCommand: false,
  statusBlock: false,
  ctaButtons: false,
};

export function useBootSequence(typewriterComplete: boolean): BootPhases {
  const [phases, setPhases] = useState<BootPhases>(INITIAL_PHASES);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const typewriterFiredRef = useRef<boolean>(false);

  // Schedule fixed-delay phases on mount
  useEffect(() => {
    const schedule = (
      key: keyof BootPhases,
      delay: number,
    ): void => {
      const id = setTimeout(() => {
        setPhases((prev) => ({ ...prev, [key]: true }));
      }, delay);
      timersRef.current.push(id);
    };

    schedule('title', BOOT_DELAYS.TITLE);
    schedule('subtitle', BOOT_DELAYS.SUBTITLE);
    schedule('promptLines', BOOT_DELAYS.PROMPT_LINES);
    schedule('divider', BOOT_DELAYS.DIVIDER);
    schedule('curlCommand', BOOT_DELAYS.CURL_COMMAND);

    return () => {
      for (const id of timersRef.current) {
        clearTimeout(id);
      }
      timersRef.current = [];
    };
  }, []);

  // Schedule reactive phases when typewriterComplete first becomes true
  useEffect(() => {
    if (!typewriterComplete || typewriterFiredRef.current) return;
    typewriterFiredRef.current = true;

    const statusId = setTimeout(() => {
      setPhases((prev) => ({ ...prev, statusBlock: true }));
    }, BOOT_DELAYS.STATUS_BLOCK_OFFSET);

    const ctaId = setTimeout(() => {
      setPhases((prev) => ({ ...prev, ctaButtons: true }));
    }, BOOT_DELAYS.STATUS_BLOCK_OFFSET + BOOT_DELAYS.CTA_BUTTONS_OFFSET);

    timersRef.current.push(statusId, ctaId);
  }, [typewriterComplete]);

  return phases;
}
