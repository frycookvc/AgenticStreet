'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ClaimCard } from '@/components/claim/ClaimCard';

function ClaimContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const preview = searchParams.get('preview');
  return <ClaimCard token={token} preview={preview} />;
}

export default function ClaimPage() {
  return (
    <Suspense>
      <ClaimContent />
    </Suspense>
  );
}
