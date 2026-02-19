import Link from 'next/link';
import type { ReactNode } from 'react';

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

export function parseLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const label = match[1] ?? '';
    const href = match[2] ?? '';
    const isExternal = href.startsWith('http://') || href.startsWith('https://');

    if (isExternal) {
      parts.push(
        <a
          key={match.index}
          href={href}
          className="text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {label}
        </a>,
      );
    } else {
      parts.push(
        <Link key={match.index} href={href} className="text-primary hover:underline">
          {label}
        </Link>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
