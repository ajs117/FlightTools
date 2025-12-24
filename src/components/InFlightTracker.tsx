import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import planeIcon from '../plane-icon.svg';
import CesiumGlobe, { CesiumGlobeRef } from './common/CesiumGlobe';
import { bearingDegrees, calculateInterpolatedPosition, haversineDistanceMeters } from '../utils/geo';

interface FlightData {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  lastUpdate: Date;
  gpsAccuracy: number | null;
}

type CachedFix = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null; // m/s
  heading: number | null; // degrees
  gpsAccuracy: number | null; // meters
  timestamp: number; // ms
};

const LAST_FIX_STORAGE_KEY = 'flighttools:inflight:lastFix';

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function safeParseCachedFix(raw: string | null): CachedFix | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    if (!isFiniteNumber(obj.latitude) || !isFiniteNumber(obj.longitude) || !isFiniteNumber(obj.timestamp)) return null;
    return {
      latitude: obj.latitude,
      longitude: obj.longitude,
      altitude: isFiniteNumber(obj.altitude) ? obj.altitude : null,
      speed: isFiniteNumber(obj.speed) ? obj.speed : null,
      heading: isFiniteNumber(obj.heading) ? obj.heading : null,
      gpsAccuracy: isFiniteNumber(obj.gpsAccuracy) ? obj.gpsAccuracy : null,
      timestamp: obj.timestamp,
    };
  } catch {
    return null;
  }
}

const metersToFeet = (meters: number): number => Math.round(meters * 3.28084);
const kmhToKnots = (kmh: number): number => Math.round(kmh * 0.539957);

const DEFAULT_CAMERA_HEIGHT_METERS = 300000;
const MIN_ZOOM_DISTANCE_METERS = 10000;
const MAX_ZOOM_DISTANCE_METERS = 20000000;

const MIN_TILE_ZOOM = 0;
const MAX_TILE_ZOOM = 4;

const InFlightTracker: React.FC = () => {
  const { isDarkMode, theme } = useTheme();
  const [flightData, setFlightData] = useState<FlightData>({ latitude: null, longitude: null, altitude: null, speed: null, heading: null, lastUpdate: new Date(), gpsAccuracy: null });
  const [error, setError] = useState<string | null>(null);
  const [isGpsAvailable, setIsGpsAvailable] = useState<boolean>(true);
  const [gpsMode, setGpsMode] = useState<'High accuracy' | 'Low accuracy' | 'Cached' | 'Dead-reckoning' | 'Waiting' | 'Denied'>('Waiting');

  const globeRef = useRef<CesiumGlobeRef | null>(null);
  const watchId = useRef<number | null>(null);
  const lastFixRef = useRef<CachedFix | null>(null);
  const prevFixRef = useRef<CachedFix | null>(null);
  const lastRealFixAtRef = useRef<number>(0);
  const deadReckonTimerRef = useRef<number | null>(null);
  const retryWatchTimerRef = useRef<number | null>(null);
  const usingLowAccuracyRef = useRef<boolean>(false);
  const cameraHeightRef = useRef<number>(DEFAULT_CAMERA_HEIGHT_METERS);

  const precacheTiles = useCallback(async () => {
    // In fully offline mode, attempting hundreds of fetches can hang for a while
    // and slow down initial UI. Only precache when online.
    if (!navigator.onLine) return;

    // Must match the basemap used in `CesiumGlobe` so cached tiles are actually used.
    const template = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}';

    const fetchWithTimeout = async (url: string, timeoutMs: number) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        // no-cors yields opaque responses; that's fine for SW caching.
        await fetch(url, { mode: 'no-cors', signal: controller.signal }).catch(() => {});
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    // Limit concurrency to avoid saturating the connection.
    const concurrency = 8;
    const queue: string[] = [];

    for (let z = MIN_TILE_ZOOM; z <= MAX_TILE_ZOOM; z++) {
      const num = 1 << z;
      for (let x = 0; x < num; x++) {
        for (let y = 0; y < num; y++) {
          queue.push(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
        }
      }
    }

    let cursor = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < queue.length) {
        const url = queue[cursor++];
        await fetchWithTimeout(url, 2500);
      }
    });
    await Promise.all(workers);
  }, []);

  const applyToGlobe = useCallback((data: FlightData) => {
    if (!globeRef.current || data.latitude === null || data.longitude === null) return;
    globeRef.current.upsertMarker({
      id: 'plane',
      lat: data.latitude,
      lng: data.longitude,
      image: planeIcon,
      size: 16,
      rotationDeg: data.heading ?? 0,
    });
    if (data.gpsAccuracy) {
      globeRef.current.upsertEllipse({
        id: 'accuracy',
        lat: data.latitude,
        lng: data.longitude,
        radiusMeters: data.gpsAccuracy,
        colorCss: isDarkMode ? theme.primary.light : theme.primary.main,
        fillAlpha: 0.2,
        outline: true,
      });
    }
    const currentHeight = Math.max(MIN_ZOOM_DISTANCE_METERS, Math.min(MAX_ZOOM_DISTANCE_METERS, cameraHeightRef.current));
    globeRef.current.setView({ lat: data.latitude, lng: data.longitude, height: currentHeight, pitchDeg: -85 });
  }, [isDarkMode, theme]);

  useEffect(() => {
    if (!navigator.geolocation) { setIsGpsAvailable(false); setError('GPS is not available on this device'); return; }

    // Seed from last cached fix so we can show something even before GPS locks.
    const cached = safeParseCachedFix(localStorage.getItem(LAST_FIX_STORAGE_KEY));
    if (cached) {
      lastFixRef.current = cached;
      prevFixRef.current = cached;
      lastRealFixAtRef.current = cached.timestamp;
      setGpsMode('Cached');
      const seeded: FlightData = {
        latitude: cached.latitude,
        longitude: cached.longitude,
        altitude: cached.altitude,
        speed: cached.speed,
        heading: cached.heading,
        gpsAccuracy: cached.gpsAccuracy,
        lastUpdate: new Date(cached.timestamp),
      };
      setFlightData(seeded);
      // Don't force an error UI just because we're using cache.
      applyToGlobe(seeded);
    }

    const clearWatch = () => {
      try {
        if (watchId.current !== null) {
          navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null;
        }
      } catch (_) {}
    };

    const scheduleRetry = (fn: () => void, ms: number) => {
      if (retryWatchTimerRef.current) {
        window.clearTimeout(retryWatchTimerRef.current);
        retryWatchTimerRef.current = null;
      }
      retryWatchTimerRef.current = window.setTimeout(() => {
        retryWatchTimerRef.current = null;
        fn();
      }, ms);
    };

    const handlePosition = (position: GeolocationPosition, source?: 'high' | 'low' | 'cached') => {
      const now = Date.now();
      lastRealFixAtRef.current = now;

      if (source === 'cached') setGpsMode('Cached');
      else if (source === 'low') setGpsMode('Low accuracy');
      else setGpsMode('High accuracy');

      const rawLat = position.coords.latitude;
      const rawLng = position.coords.longitude;

      // Some devices don't populate speed/heading. Estimate from previous fix if needed.
      let speed = isFiniteNumber(position.coords.speed) ? position.coords.speed : null; // m/s
      let heading = isFiniteNumber(position.coords.heading) ? position.coords.heading : null; // deg

      const prev = lastFixRef.current;
      if ((speed === null || heading === null) && prev && isFiniteNumber(prev.latitude) && isFiniteNumber(prev.longitude) && isFiniteNumber(prev.timestamp)) {
        const dtSec = Math.max(0.001, (now - prev.timestamp) / 1000);
        const distM = haversineDistanceMeters(prev.latitude, prev.longitude, rawLat, rawLng);
        if (speed === null) {
          const est = distM / dtSec;
          if (Number.isFinite(est)) speed = est;
        }
        if (heading === null && distM >= 2) {
          heading = bearingDegrees([prev.latitude, prev.longitude], [rawLat, rawLng]);
        }
      }

      const fix: CachedFix = {
        latitude: rawLat,
        longitude: rawLng,
        altitude: isFiniteNumber(position.coords.altitude) ? position.coords.altitude : null,
        speed,
        heading,
        gpsAccuracy: isFiniteNumber(position.coords.accuracy) ? position.coords.accuracy : null,
        timestamp: now,
      };

      prevFixRef.current = lastFixRef.current;
      lastFixRef.current = fix;

      try { localStorage.setItem(LAST_FIX_STORAGE_KEY, JSON.stringify(fix)); } catch (_) {}

      const newData: FlightData = {
        latitude: fix.latitude,
        longitude: fix.longitude,
        altitude: fix.altitude,
        speed: fix.speed,
        heading: fix.heading,
        lastUpdate: new Date(now),
        gpsAccuracy: fix.gpsAccuracy,
      };

      setFlightData(newData);
      setError(null);
      applyToGlobe(newData);
    };

    const handlePositionError = (geoError: GeolocationPositionError) => {
      // Be forgiving: keep cached/predicted position and try again.
      const cachedFix = lastFixRef.current;
      if (geoError.code === geoError.PERMISSION_DENIED) {
        setError('GPS permission denied');
        setGpsMode('Denied');
        clearWatch();
        return;
      }

      if (cachedFix) {
        setError('GPS signal weak — using last known position');
        // If we were waiting, mark that we're now using cached data.
        setGpsMode(prev => prev === 'Waiting' ? 'Cached' : prev);
      } else {
        setError('Waiting for GPS signal…');
        setGpsMode('Waiting');
      }

      // If high accuracy is struggling (common with weak signal), fall back to low accuracy.
      if (!usingLowAccuracyRef.current && (geoError.code === geoError.POSITION_UNAVAILABLE || geoError.code === geoError.TIMEOUT)) {
        usingLowAccuracyRef.current = true;
        scheduleRetry(() => startWatch(true), 750);
        return;
      }

      // Otherwise retry the current mode after a short delay.
      scheduleRetry(() => startWatch(usingLowAccuracyRef.current), 1500);
    };

    const startWatch = (useLowAccuracy: boolean) => {
      clearWatch();
      try {
        setGpsMode(useLowAccuracy ? 'Low accuracy' : 'High accuracy');
        watchId.current = navigator.geolocation.watchPosition(
          (pos) => handlePosition(pos, useLowAccuracy ? 'low' : 'high'),
          handlePositionError,
          // Weak-signal friendly settings:
          // - allow cached fixes (maximumAge)
          // - long timeout
          // - highAccuracy when possible, but allow fallback
          {
            enableHighAccuracy: !useLowAccuracy,
            timeout: 45000,
            maximumAge: useLowAccuracy ? 5 * 60 * 1000 : 60 * 1000,
          }
        );
      } catch (err) {
        setError('Failed to start GPS tracking');
      }
    };

    const startTracking = async () => {
      try {
        // First: try a fast, cached fix (works even with very weak GPS).
        try {
          navigator.geolocation.getCurrentPosition(
            (pos) => handlePosition(pos, 'cached'),
            () => {},
            { enableHighAccuracy: false, timeout: 2500, maximumAge: 10 * 60 * 1000 }
          );
        } catch (_) {}

        // Then: start watching; try high accuracy first, but auto-fallback on errors.
        usingLowAccuracyRef.current = false;
        startWatch(false);
      } catch (err) { setError('Failed to start GPS tracking'); }
    };

    startTracking();
    precacheTiles();

    // Dead reckoning between fixes: when GPS stalls, keep the marker moving briefly
    // using last known speed + heading. Stops automatically after a short window
    // so it doesn't drift forever.
    if (deadReckonTimerRef.current) {
      window.clearInterval(deadReckonTimerRef.current);
      deadReckonTimerRef.current = null;
    }
    deadReckonTimerRef.current = window.setInterval(() => {
      const fix = lastFixRef.current;
      if (!fix) return;

      const now = Date.now();
      const msSinceReal = now - (lastRealFixAtRef.current || fix.timestamp);
      // Start predicting after 2s without a real fix; stop after 60s.
      if (msSinceReal < 2000 || msSinceReal > 60000) return;

      if (!isFiniteNumber(fix.speed) || !isFiniteNumber(fix.heading)) return;
      // If essentially stationary, don't drift.
      if (fix.speed < 1.0) return;

      const startPos = {
        lat: fix.latitude,
        lng: fix.longitude,
        name: 'plane',
        timestamp: fix.timestamp,
      };
      const predicted = calculateInterpolatedPosition(startPos, fix.speed * 3.6, fix.heading);
      const predictedFix: CachedFix = {
        ...fix,
        latitude: predicted.lat,
        longitude: predicted.lng,
        timestamp: predicted.timestamp ?? now,
      };
      lastFixRef.current = predictedFix;

      setGpsMode('Dead-reckoning');

      const data: FlightData = {
        latitude: predictedFix.latitude,
        longitude: predictedFix.longitude,
        altitude: predictedFix.altitude,
        speed: predictedFix.speed,
        heading: predictedFix.heading,
        gpsAccuracy: predictedFix.gpsAccuracy,
        lastUpdate: new Date(predictedFix.timestamp),
      };
      setFlightData(data);
      applyToGlobe(data);
    }, 1000);

    return () => {
      clearWatch();
      if (retryWatchTimerRef.current) {
        window.clearTimeout(retryWatchTimerRef.current);
        retryWatchTimerRef.current = null;
      }
      if (deadReckonTimerRef.current) {
        window.clearInterval(deadReckonTimerRef.current);
        deadReckonTimerRef.current = null;
      }
    };
  }, [applyToGlobe, precacheTiles]);

  return (
    <div className={`p-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
      <h2 className="text-2xl font-bold mb-4">In-Flight Tracker</h2>
      {!isGpsAvailable && (<div className={`p-4 rounded-lg mb-4 ${isDarkMode ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-800'}`}>GPS is not available on this device. This tool requires GPS functionality to work.</div>)}
      {error && (<div className={`p-4 rounded-lg mb-4 ${isDarkMode ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800'}`}>{error}</div>)}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow`}>
          <h3 className="text-lg font-semibold mb-2">Current Position</h3>
          <div className="space-y-2">
            <p>GPS Mode: {gpsMode}</p>
            <p>Latitude: {flightData.latitude?.toFixed(6) || 'N/A'}</p>
            <p>Longitude: {flightData.longitude?.toFixed(6) || 'N/A'}</p>
            <p>Altitude: {flightData.altitude ? `${metersToFeet(Math.round(flightData.altitude))}ft` : 'N/A'}</p>
            <p>Speed: {flightData.speed ? `${kmhToKnots(Math.round(flightData.speed * 3.6))} knots` : 'N/A'}</p>
            <p>Heading: {flightData.heading ? `${Math.round(flightData.heading)}°` : 'N/A'}</p>
            <p>GPS Accuracy: {flightData.gpsAccuracy ? `±${Math.round(flightData.gpsAccuracy)}m` : 'N/A'}</p>
            <p>Last Update: {flightData.lastUpdate.toLocaleTimeString()}</p>
          </div>
        </div>
        <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow`}>
          <h3 className="text-lg font-semibold mb-2">Globe View</h3>
          <div className="w-full h-[60vh] md:h-[70vh] rounded-lg">
            <CesiumGlobe
              ref={globeRef as any}
              isDarkMode={isDarkMode}
              initialCenter={{ lat: 0, lng: 0, height: DEFAULT_CAMERA_HEIGHT_METERS }}
              minZoom={MIN_ZOOM_DISTANCE_METERS}
              maxZoom={MAX_ZOOM_DISTANCE_METERS}
              onViewChange={() => {
                const h = globeRef.current?.getCameraHeight();
                if (typeof h === 'number') cameraHeightRef.current = h;
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default InFlightTracker; 