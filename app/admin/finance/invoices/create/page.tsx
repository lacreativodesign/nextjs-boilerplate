'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateInvoicePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/finance/invoices?create=true');
  }, [router]);

  return null;
}
