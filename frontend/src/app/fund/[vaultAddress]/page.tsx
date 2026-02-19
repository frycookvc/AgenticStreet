'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { FundDetail } from '@/components/fund';
import { useParams } from 'next/navigation';

function FundContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const vaultAddress = params.vaultAddress as string;
  const preview = searchParams.get('preview');
  return <FundDetail vaultAddress={vaultAddress} previewStatus={preview} />;
}

export default function FundPage() {
  return (
    <Suspense>
      <FundContent />
    </Suspense>
  );
}
