import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import planeIcon from '../plane-icon.svg';
import CesiumGlobe, { CesiumGlobeRef } from './common/CesiumGlobe';

interface FlightData {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  lastUpdate: Date;
  gpsAccuracy: number | null;
}

const metersToFeet = (meters: number): number => Math.round(meters * 3.28084);
const kmhToKnots = (kmh: number): number => Math.round(kmh * 0.539957);

const DEFAULT_CAMERA_HEIGHT_METERS = 300000;
const MIN_ZOOM_DISTANCE_METERS = 10000;
const MAX_ZOOM_DISTANCE_METERS = 20000000;

const MIN_TILE_ZOOM = 0;
const MAX_TILE_ZOOM = 4;

const InFlightTracker: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [flightData, setFlightData] = useState<FlightData>({ latitude: null, longitude: null, altitude: null, speed: null, heading: null, lastUpdate: new Date(), gpsAccuracy: null });
  const [error, setError] = useState<string | null>(null);
  const [isGpsAvailable, setIsGpsAvailable] = useState<boolean>(true);

  const globeRef = useRef<CesiumGlobeRef | null>(null);
  const watchId = useRef<number | null>(null);
  const lastKnownPosition = useRef<GeolocationPosition | null>(null);
  const cameraHeightRef = useRef<number>(DEFAULT_CAMERA_HEIGHT_METERS);

  const precacheTiles = useCallback(async () => {
    const subdomains = ['a', 'b', 'c', 'd'];
    const template = isDarkMode
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';

    const fetches: Promise<any>[] = [];
    for (let z = MIN_TILE_ZOOM; z <= MAX_TILE_ZOOM; z++) {
      const num = 1 << z;
      for (let x = 0; x < num; x++) {
        for (let y = 0; y < num; y++) {
          const s = subdomains[(x + y) % subdomains.length];
          const url = template.replace('{s}', s).replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
          try { fetches.push(fetch(url, { mode: 'no-cors', cache: 'reload' }).catch(() => {})); } catch (_) {}
        }
      }
    }
    await Promise.all(fetches);
  }, [isDarkMode]);

  useEffect(() => {
    if (!navigator.geolocation) { setIsGpsAvailable(false); setError('GPS is not available on this device'); return; }

    const startTracking = async () => {
      try {
        watchId.current = navigator.geolocation.watchPosition(
          (position) => {
            lastKnownPosition.current = position;
            const newData = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              altitude: position.coords.altitude,
              speed: position.coords.speed,
              heading: position.coords.heading,
              lastUpdate: new Date(),
              gpsAccuracy: position.coords.accuracy,
            };
            setFlightData(newData);
            setError(null);

            if (globeRef.current && newData.latitude !== null && newData.longitude !== null) {
              // Update plane marker
              globeRef.current.upsertMarker({ id: 'plane', lat: newData.latitude, lng: newData.longitude, image: planeIcon, size: 16, rotationDeg: newData.heading ?? 0 });
              // Update accuracy ellipse
              if (newData.gpsAccuracy) {
                globeRef.current.upsertEllipse({ id: 'accuracy', lat: newData.latitude, lng: newData.longitude, radiusMeters: newData.gpsAccuracy, colorCss: isDarkMode ? '#60a5fa' : '#3b82f6', fillAlpha: 0.2, outline: true });
              }
              // Maintain user zoom
              const currentHeight = Math.max(MIN_ZOOM_DISTANCE_METERS, Math.min(MAX_ZOOM_DISTANCE_METERS, cameraHeightRef.current));
              // Keep map north-up; update position and preserve existing heading
              globeRef.current.setView({ lat: newData.latitude, lng: newData.longitude, height: currentHeight, pitchDeg: -85 });
            }
          },
          (error) => {
            setError(`GPS Error: ${error.message}`);
            if (lastKnownPosition.current && globeRef.current) {
              const coords = lastKnownPosition.current.coords;
              const newData = { latitude: coords.latitude, longitude: coords.longitude, altitude: coords.altitude, speed: coords.speed, heading: coords.heading, lastUpdate: new Date(), gpsAccuracy: coords.accuracy };
              setFlightData(newData);
              globeRef.current.upsertMarker({ id: 'plane', lat: newData.latitude!, lng: newData.longitude!, image: planeIcon, size: 16, rotationDeg: newData.heading ?? 0 });
              if (newData.gpsAccuracy) globeRef.current.upsertEllipse({ id: 'accuracy', lat: newData.latitude!, lng: newData.longitude!, radiusMeters: newData.gpsAccuracy, colorCss: isDarkMode ? '#60a5fa' : '#3b82f6', fillAlpha: 0.2, outline: true });
            }
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      } catch (err) { setError('Failed to start GPS tracking'); }
    };

    startTracking();
    precacheTiles();

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [isDarkMode, precacheTiles]);

  return (
    <div className={`p-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
      <h2 className="text-2xl font-bold mb-4">In-Flight Tracker</h2>
      {!isGpsAvailable && (<div className={`p-4 rounded-lg mb-4 ${isDarkMode ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-800'}`}>GPS is not available on this device. This tool requires GPS functionality to work.</div>)}
      {error && (<div className={`p-4 rounded-lg mb-4 ${isDarkMode ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800'}`}>{error}</div>)}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow`}>
          <h3 className="text-lg font-semibold mb-2">Current Position</h3>
          <div className="space-y-2">
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