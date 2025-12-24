import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ONLINE_POLL_INTERVAL_MS = 5000;

// Keep online detection simple and resilient:
// - Use navigator.onLine as the primary signal (so we don't block UI)
// - Avoid same-origin "ping" requests because the service worker can satisfy them from cache
//   even when the device is truly offline, causing incorrect results.
async function checkConnection(): Promise<boolean> {
  return navigator.onLine;
}

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const isMountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const result = await checkConnection();
    if (isMountedRef.current) setIsOnline(result);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const intervalId = setInterval(refresh, ONLINE_POLL_INTERVAL_MS);

    refresh();

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  }, [refresh]);

  return useMemo(() => ({ isOnline, refresh }), [isOnline, refresh]);
} 