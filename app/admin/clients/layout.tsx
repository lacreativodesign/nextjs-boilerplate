'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const tabs = [
  { label: 'Overview', path: '/admin/clients' },
  { label: 'Key Accounts', path: '/admin/clients/key-accounts' },
  { label: 'Segments', path: '/admin/clients/segments' },
];

export default function ClientsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full">
      <div className="tabs-bar">
        {tabs.map((t) => {
          const active = pathname === t.path;
          return (
            <Link key={t.path} href={t.path} className={clsx('tab-pill', active && 'active')}>
              {t.label}
            </Link>
          );
        })}
      </div>

      <div>{children}</div>
    </div>
  );
}
