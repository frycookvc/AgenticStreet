'use client';

import { useCallback, useState } from 'react';
import { TIMING } from '@/lib/constants';

interface CopyButtonProps {
  text: string;
  className?: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (copied) return;

    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), TIMING.COPY_FEEDBACK);
    });
  }, [text, copied]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={copied}
      className={`select-none text-[11px] font-medium uppercase tracking-wider ${
        copied
          ? 'cursor-default text-primary'
          : 'cursor-pointer text-text-tertiary hover:text-primary'
      }${className ? ` ${className}` : ''}`}
    >
      {copied ? 'COPIED' : 'COPY'}
    </button>
  );
}
