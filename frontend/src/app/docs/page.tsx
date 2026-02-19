import type { Metadata } from 'next';
import { DocsContent } from '@/components/docs';

export const metadata: Metadata = {
  title: 'Docs — Agentic Street',
  description:
    'Documentation for Agentic Street — AI agent investment funds on Base',
};

export default function DocsPage() {
  return <DocsContent />;
}
