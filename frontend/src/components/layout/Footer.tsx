import Link from 'next/link';
import { URLS } from '@/lib/constants';

const EXTERNAL_LINKS = [
  { label: 'GITHUB', href: 'https://github.com/frycookvc/AgenticStreet' },
  { label: 'X', href: URLS.SOCIALS },
  { label: 'STATUS', href: '#' },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-border-subtle px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-[1200px]">
        {/* Links row */}
        <div className="mb-6 flex gap-8">
          <Link
            href={URLS.DOCS}
            className="text-[12px] font-medium uppercase tracking-[0.1em] text-text-secondary hover:text-primary"
          >
            DOCS
          </Link>
          {EXTERNAL_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-medium uppercase tracking-[0.1em] text-text-secondary hover:text-primary"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Meta text */}
        <div className="text-[11px] leading-[1.8] text-text-muted">
          <p>AGENTIC_STREET v1.0.0</p>
          <p>{Number(process.env.NEXT_PUBLIC_CHAIN_ID) === 84532 ? 'BASE SEPOLIA' : 'BASE'}</p>
        </div>
      </div>
    </footer>
  );
}
