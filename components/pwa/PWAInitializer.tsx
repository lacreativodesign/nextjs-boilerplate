'use client';

import { useEffect, useState } from 'react';

function OfflineIndicator({ offline }: { offline: boolean }) {
  if (!offline) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-white">
      Offline mode enabled
    </div>
  );
}

export default function PWAInitializer() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOffline(!navigator.onLine);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return <OfflineIndicator offline={offline} />;
}
