import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ONLINE_POLL_INTERVAL_MS_MOBILE = 2000;
const ONLINE_POLL_INTERVAL_MS_DESKTOP = 5000;

async function checkConnection(): Promise<boolean> {
  try {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection && connection.type === 'none') {
      return false;
    }
    // Prefer a same-origin lightweight request so CORS/opaque responses don't give false positives.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const publicUrl = process.env.PUBLIC_URL || '';
      const pingUrl = `${publicUrl}/favicon.ico`;
      const resp = await fetch(pingUrl, { method: 'HEAD', cache: 'no-cache', signal: controller.signal });
      clearTimeout(timeoutId);
      return resp && resp.ok;
    } catch (e) {
      clearTimeout(timeoutId);
      return false;
    }
  } catch {
    return false;
  }
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
    const handleOnline = async () => setIsOnline(await checkConnection());
    const handleOffline = async () => setIsOnline(!(await checkConnection()) ? false : true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    const handleNetworkChange = async () => setIsOnline(await checkConnection());
    if (connection) {
      connection.addEventListener('change', handleNetworkChange);
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const intervalId = setInterval(refresh, isMobile ? ONLINE_POLL_INTERVAL_MS_MOBILE : ONLINE_POLL_INTERVAL_MS_DESKTOP);

    refresh();

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', handleNetworkChange);
      }
      clearInterval(intervalId);
    };
  }, [refresh]);

  return useMemo(() => ({ isOnline, refresh }), [isOnline, refresh]);
} 