import React, { useState, useEffect, useCallback, useRef } from 'react';
import planeIcon from '../plane-icon.svg';
import { useTheme } from '../context/ThemeContext';
import CesiumGlobe, { CesiumGlobeRef } from './common/CesiumGlobe';
import { AllAircraftData, FlightData, InterpolatedPosition, Location } from '../models';
import { getAllAircraftData, findStateByFlightNumber } from '../services/opensky';
import { bananasToMeters, bananasToNauticalMiles, calculateInterpolatedPosition, haversineDistanceMeters, kmhToKnots, metersToBananas, metersToFeet } from '../utils/geo';

const FlightTracker: React.FC = () => {
  const { isDarkMode, theme } = useTheme();
  const [location, setLocation] = useState<Location | null>(null);
  const [aircraftPosition, setAircraftPosition] = useState<Location | null>(null);
  const [allAircraft, setAllAircraft] = useState<AllAircraftData[]>([]);
  const [visibleAircraft, setVisibleAircraft] = useState<AllAircraftData[]>([]);
  const [trackingAllAircraft, setTrackingAllAircraft] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [followEnabled, setFollowEnabled] = useState<boolean>(true);
  const [displayedDistance, setDisplayedDistance] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('lastSearchQuery') || '');
  const [loading, setLoading] = useState(false);
  const [flightNumber, setFlightNumber] = useState(() => localStorage.getItem('lastFlightNumber') || '');
  const [flightData, setFlightData] = useState<FlightData | null>(null);
  const [lastKnownPosition, setLastKnownPosition] = useState<InterpolatedPosition | null>(null);
  const trackingIntervalRef = useRef<number | null>(null);
  const autoRefreshIntervalRef = useRef<number | null>(null);
  const interpolationIntervalRef = useRef<number | null>(null);
  const distanceUpdateIntervalRef = useRef<number | null>(null);
  const distanceInterpolationIntervalRef = useRef<number | null>(null);
  const [lastApiCall, setLastApiCall] = useState<number | null>(null);

  const globeRef = useRef<CesiumGlobeRef | null>(null);
  const viewRectRef = useRef<{ west: number; south: number; east: number; north: number } | null>(null);
  const cameraHeightRef = useRef<number>(400000);
  const activeMarkerIdsRef = useRef<Set<string>>(new Set());
  const lastUserInteractionRef = useRef<number>(0);
  // Throttling refs for view-change handling
  const viewChangeHandlerRef = useRef<() => void>(() => {});
  const viewChangeThrottleRef = useRef<{ timeoutId: number | null }>({ timeoutId: null });

  // Auto-track flight and use saved location on mount (effect moved below where `trackFlight` is defined)

  // Persist UI state
  useEffect(() => { searchQuery ? localStorage.setItem('lastSearchQuery', searchQuery) : localStorage.removeItem('lastSearchQuery'); }, [searchQuery]);
  useEffect(() => { flightNumber ? localStorage.setItem('lastFlightNumber', flightNumber) : localStorage.removeItem('lastFlightNumber'); }, [flightNumber]);
  useEffect(() => { location ? localStorage.setItem('lastLocation', JSON.stringify(location)) : localStorage.removeItem('lastLocation'); }, [location]);

  // Cleanup intervals on unmount
  useEffect(() => () => {
    if (trackingIntervalRef.current) { clearInterval(trackingIntervalRef.current); trackingIntervalRef.current = null; }
    if (autoRefreshIntervalRef.current) { clearInterval(autoRefreshIntervalRef.current); autoRefreshIntervalRef.current = null; }
    if (interpolationIntervalRef.current) { clearInterval(interpolationIntervalRef.current); interpolationIntervalRef.current = null; }
    if (distanceUpdateIntervalRef.current) { clearInterval(distanceUpdateIntervalRef.current); distanceUpdateIntervalRef.current = null; }
    if (distanceInterpolationIntervalRef.current) { clearInterval(distanceInterpolationIntervalRef.current); distanceInterpolationIntervalRef.current = null; }
  }, []);

  // Update distance when location or aircraft position changes
  useEffect(() => {
    if (location && aircraftPosition) {
      const newDistance = haversineDistanceMeters(location.lat, location.lng, aircraftPosition.lat, aircraftPosition.lng);
      setDistance(newDistance);
      setDisplayedDistance(newDistance);
      if (distanceUpdateIntervalRef.current) { clearInterval(distanceUpdateIntervalRef.current); distanceUpdateIntervalRef.current = null; }
      if (distanceInterpolationIntervalRef.current) { clearInterval(distanceInterpolationIntervalRef.current); distanceInterpolationIntervalRef.current = null; }
      const interval = window.setInterval(() => {
        if (location && aircraftPosition) {
          setDistance(haversineDistanceMeters(location.lat, location.lng, aircraftPosition.lat, aircraftPosition.lng));
        }
      }, 25);
      distanceUpdateIntervalRef.current = interval;
      if (flightData?.live && lastKnownPosition) {
        const distanceInterpolation = window.setInterval(() => {
          if (flightData.live && lastKnownPosition && !flightData.live.is_ground && flightData.live.speed_horizontal >= 50) {
            const newPos = calculateInterpolatedPosition(lastKnownPosition, flightData.live.speed_horizontal, flightData.live.direction);
            setAircraftPosition({ lat: newPos.lat, lng: newPos.lng, name: `${flightData.airline.name} ${flightData.flight.number}` });
          }
        }, 100);
        distanceInterpolationIntervalRef.current = distanceInterpolation;
      }
    } else {
      setDistance(null);
      setDisplayedDistance(null);
      if (distanceUpdateIntervalRef.current) { clearInterval(distanceUpdateIntervalRef.current); distanceUpdateIntervalRef.current = null; }
      if (distanceInterpolationIntervalRef.current) { clearInterval(distanceInterpolationIntervalRef.current); distanceInterpolationIntervalRef.current = null; }
    }
  }, [location, aircraftPosition, flightData, lastKnownPosition]);

  // Animate distance display
  useEffect(() => {
    if (distance === null || displayedDistance === null) { setDisplayedDistance(distance); return; }
    const diff = metersToBananas(distance) - metersToBananas(displayedDistance);
    if (Math.abs(diff) < 1) { setDisplayedDistance(distance); return; }
    const step = Math.sign(diff) * Math.min(Math.abs(diff), Math.max(1, Math.abs(diff) / 5));
    const timer = setTimeout(() => { setDisplayedDistance(prev => (prev !== null ? bananasToMeters(metersToBananas(prev) + step) : null)); }, 16);
    return () => clearTimeout(timer);
  }, [distance, displayedDistance]);

  const getCurrentLocation = () => {
    setLoading(true); setError('');
    if (!navigator.geolocation) { setError('Geolocation is not supported by your browser'); setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLoc = { lat: position.coords.latitude, lng: position.coords.longitude, name: 'Current Location' };
        setLocation(newLoc);
        setAircraftPosition(null);
        // Center globe
        globeRef.current?.setView({ lat: newLoc.lat, lng: newLoc.lng, height: 800000, pitchDeg: -85 });
        setLoading(false);
      },
      (error) => { setError('Error getting location: ' + error.message); setLoading(false); }
    );
  };

  const searchLocation = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error('Failed to fetch location');
      const data = await response.json();
      if (data.length === 0) { setError('Location not found'); setLoading(false); return; }
      const newLoc = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), name: data[0].display_name };
      setLocation(newLoc);
      setAircraftPosition(null);
      globeRef.current?.setView({ lat: newLoc.lat, lng: newLoc.lng, height: 1200000, pitchDeg: -85 });
    } catch (err) {
      setError('Error searching location: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally { setLoading(false); }
  };

  const updateInterpolatedPosition = useCallback(() => {
    if (flightData?.live && lastKnownPosition) {
      if (flightData.live.is_ground || flightData.live.speed_horizontal < 50) { return; }
      const newPos = calculateInterpolatedPosition(lastKnownPosition, flightData.live.speed_horizontal, flightData.live.direction);
      newPos.name = `${flightData.flight.number}-${flightData.airline.name}`;
      setLastKnownPosition(newPos);
      setAircraftPosition({ lat: newPos.lat, lng: newPos.lng, name: newPos.name });
    }
  }, [flightData, lastKnownPosition]);

  // Update visible aircraft when view rectangle or all aircraft changes
  const updateVisibleAircraft = useCallback(() => {
    const rect = viewRectRef.current;
    if (trackingAllAircraft && rect && allAircraft.length > 0) {
      const inView = allAircraft.filter(a => a.latitude >= rect.south && a.latitude <= rect.north && a.longitude >= rect.west && a.longitude <= rect.east);
      setVisibleAircraft(inView);
    } else {
      setVisibleAircraft(allAircraft);
    }
  }, [allAircraft, trackingAllAircraft]);

  // Keep a stable throttled handler reference for Cesium view-change notifications
  useEffect(() => {
    viewChangeHandlerRef.current = () => {
      const rect = globeRef.current?.getViewRectangle();
      if (rect) { viewRectRef.current = rect; updateVisibleAircraft(); }
      const h = globeRef.current?.getCameraHeight();
      if (typeof h === 'number') cameraHeightRef.current = h;
      lastUserInteractionRef.current = Date.now();
    };
  }, [updateVisibleAircraft]);

  const stableOnViewChange = React.useCallback(() => {
    // debounce/trailing: run after 200ms of no further events
    if (viewChangeThrottleRef.current.timeoutId) {
      window.clearTimeout(viewChangeThrottleRef.current.timeoutId);
    }
    viewChangeThrottleRef.current.timeoutId = window.setTimeout(() => {
      try { viewChangeHandlerRef.current(); } catch (e) { /* ignore */ }
      viewChangeThrottleRef.current.timeoutId = null;
    }, 200) as unknown as number;
  }, []);

  const resetAllTrackingState = useCallback(() => {
    if (autoRefreshIntervalRef.current) { clearInterval(autoRefreshIntervalRef.current); autoRefreshIntervalRef.current = null; }
    if (trackingIntervalRef.current) { clearInterval(trackingIntervalRef.current); trackingIntervalRef.current = null; }
    if (interpolationIntervalRef.current) { clearInterval(interpolationIntervalRef.current); interpolationIntervalRef.current = null; }
    if (distanceUpdateIntervalRef.current) { clearInterval(distanceUpdateIntervalRef.current); distanceUpdateIntervalRef.current = null; }
    if (distanceInterpolationIntervalRef.current) { clearInterval(distanceInterpolationIntervalRef.current); distanceInterpolationIntervalRef.current = null; }
    setAircraftPosition(null); setAllAircraft([]); setTrackingAllAircraft(false); setFlightData(null); setLastKnownPosition(null);
    setDistance(null); setDisplayedDistance(null); setLastApiCall(null);
    // Clear globe markers
    activeMarkerIdsRef.current.forEach(id => globeRef.current?.removeMarker(id));
    activeMarkerIdsRef.current.clear();
    globeRef.current?.removeMarker('tracked-plane');
    globeRef.current?.removeMarker('user-location');
    sessionStorage.removeItem('lastApiCall');
  }, []);

  const clearAutoRefreshInterval = useCallback(() => {
    if (autoRefreshIntervalRef.current) { clearInterval(autoRefreshIntervalRef.current); autoRefreshIntervalRef.current = null; }
  }, []);

  // Start an auto-refresh interval only if network conditions are ok
  const startAutoRefresh = useCallback((fn: () => void, ms: number) => {
    // clear existing
    if (autoRefreshIntervalRef.current) { clearInterval(autoRefreshIntervalRef.current); autoRefreshIntervalRef.current = null; }
    try {
      const connection = (navigator as any).connection;
      if (connection?.saveData) return; // respect save-data
      const effective = connection?.effectiveType || '';
      if (effective.includes('2g')) return; // avoid heavy polling on slow networks
    } catch (e) {}
    autoRefreshIntervalRef.current = window.setInterval(fn, ms);
  }, []);

  const trackFlight = useCallback(async (forceRefresh: boolean = false) => {
    if (!flightNumber.trim()) { if (forceRefresh) setError('Please enter a flight number'); return; }
    if (!forceRefresh) { localStorage.setItem('lastFlightNumber', flightNumber); resetAllTrackingState(); } else { clearAutoRefreshInterval(); }
    setLoading(true); if (!forceRefresh) setError('');
    try {
      const flightState = await findStateByFlightNumber(flightNumber);
      if (!flightState) throw new Error('Flight not found in current tracking data');
      const longitude = flightState[5];
      const latitude = flightState[6];
      const altitude = flightState[7];
      const isOnGround = flightState[8];
      const velocity = flightState[9];
      const heading = flightState[10];
      const verticalRate = flightState[11];
      const speedKmh = velocity ? velocity * 3.6 : 0;
      const flight: FlightData = {
        flight: { number: flightNumber, iata: flightNumber },
        departure: { airport: 'N/A', timezone: '' },
        arrival: { airport: 'N/A', timezone: '' },
        airline: { name: flightNumber },
        live: { latitude, longitude, altitude: altitude || 0, direction: heading || 0, speed_horizontal: speedKmh, speed_vertical: verticalRate || 0, is_ground: Boolean(isOnGround), updated: new Date().toISOString() },
      };
      const apiTimestamp = Date.now(); setLastApiCall(apiTimestamp); sessionStorage.setItem('lastApiCall', apiTimestamp.toString());
      setFlightData(flight);
      const newPosition = { lat: flight.live.latitude, lng: flight.live.longitude, name: `${flight.airline.name} ${flight.flight.number}`, timestamp: apiTimestamp };
      setLastKnownPosition(newPosition);
      setAircraftPosition({ lat: newPosition.lat, lng: newPosition.lng, name: newPosition.name });
      // Update globe
      globeRef.current?.upsertMarker({ id: 'tracked-plane', lat: newPosition.lat, lng: newPosition.lng, image: planeIcon, size: 16, rotationDeg: heading || 0 });
      // Keep map north-up on initial track; center without rotating camera (respect follow)
      if (followEnabled) {
        globeRef.current?.setView({ lat: newPosition.lat, lng: newPosition.lng, height: cameraHeightRef.current, pitchDeg: -85 });
      }
      startAutoRefresh(() => { trackFlight(true); }, 60000);
    } catch (err) {
      setError('Error tracking flight: ' + (err instanceof Error ? err.message : 'Unknown error'));
      clearAutoRefreshInterval();
    } finally { setLoading(false); }
  }, [flightNumber, resetAllTrackingState, clearAutoRefreshInterval, followEnabled, startAutoRefresh]);

  // Auto-track flight and use saved location on mount
  useEffect(() => {
    const savedLocation = localStorage.getItem('lastLocation');
    if (savedLocation) {
      try { setLocation(JSON.parse(savedLocation)); } catch (e) { console.error('Error parsing saved location:', e); }
    }
    const savedFlightNumber = localStorage.getItem('lastFlightNumber');
    if (savedFlightNumber) {
      setFlightNumber(savedFlightNumber);
      setTimeout(() => { trackFlight(false); }, 100);
    }
  }, [trackFlight]);

  const getAllAircraft = useCallback(async (isAutoRefresh: boolean = false) => {
    if (!isAutoRefresh) resetAllTrackingState(); else clearAutoRefreshInterval();
    setLoading(true); if (!isAutoRefresh) setError('');
    try {
      const aircraftData = await getAllAircraftData();
      if (!aircraftData || aircraftData.length === 0) { setAllAircraft([]); }
      else {
        setAllAircraft(aircraftData);
        // Center globe on middle aircraft initially
        if (!isAutoRefresh && aircraftData.length > 0) {
          const c = aircraftData[Math.floor(aircraftData.length / 2)];
          globeRef.current?.setView({ lat: c.latitude, lng: c.longitude, height: 4000000, pitchDeg: -85 });
        }
      }
      const apiTimestamp = Date.now(); setLastApiCall(apiTimestamp); sessionStorage.setItem('lastApiCall', apiTimestamp.toString()); setError('');
      startAutoRefresh(() => { getAllAircraft(true); }, 60000);
      setTrackingAllAircraft(true);
    } catch (err) {
      setError('Error fetching aircraft: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setTrackingAllAircraft(false); clearAutoRefreshInterval();
    } finally { setLoading(false); }
  }, [resetAllTrackingState, clearAutoRefreshInterval, startAutoRefresh]);

  const clearLocation = () => {
    setLocation(null); setSearchQuery(''); setError(''); setFlightNumber(''); resetAllTrackingState();
    localStorage.removeItem('lastLocation'); localStorage.removeItem('lastSearchQuery'); localStorage.removeItem('lastFlightNumber');
  };

  // Interpolation loop setup
  useEffect(() => {
    if (interpolationIntervalRef.current) { clearInterval(interpolationIntervalRef.current); interpolationIntervalRef.current = null; }
    if (flightData && lastKnownPosition && !trackingAllAircraft) {
      updateInterpolatedPosition();
      const interpolation = window.setInterval(() => { updateInterpolatedPosition(); }, 5000);
      interpolationIntervalRef.current = interpolation;
    }
    return () => { if (interpolationIntervalRef.current) { clearInterval(interpolationIntervalRef.current); interpolationIntervalRef.current = null; } };
  }, [flightData, lastKnownPosition, trackingAllAircraft, updateInterpolatedPosition]);

  

  // Sync globe markers for all-aircraft mode
  useEffect(() => {
    if (!trackingAllAircraft || !globeRef.current) return;
    const newIds = new Set<string>();
    visibleAircraft.forEach(ac => {
      const id = `ac-${ac.icao24}`;
      newIds.add(id);
      globeRef.current!.upsertMarker({ id, lat: ac.latitude, lng: ac.longitude, image: planeIcon, size: 12, rotationDeg: ac.direction });
    });
    // Remove markers that are no longer visible
    activeMarkerIdsRef.current.forEach(id => { if (!newIds.has(id)) globeRef.current?.removeMarker(id); });
    activeMarkerIdsRef.current = newIds as any;
  }, [visibleAircraft, trackingAllAircraft]);

  // Update tracked plane marker and view
  useEffect(() => {
    if (!trackingAllAircraft && aircraftPosition && flightData && globeRef.current) {
      globeRef.current.upsertMarker({ id: 'tracked-plane', lat: aircraftPosition.lat, lng: aircraftPosition.lng, image: planeIcon, size: 16, rotationDeg: flightData.live.direction || 0 });
      const now = Date.now();
      // Give the user more time to interact before recentering
      const quietMs = 2500;
      if (followEnabled && now - lastUserInteractionRef.current > quietMs) {
        globeRef.current.setView({ lat: aircraftPosition.lat, lng: aircraftPosition.lng, height: cameraHeightRef.current, pitchDeg: -85 });
      }
    }
  }, [aircraftPosition, flightData, trackingAllAircraft, followEnabled]);

  return (
    <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-3 sm:p-6 max-w-7xl mx-auto`}>
      <div className="mb-2 sm:mb-4 space-y-2 sm:space-y-4">
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-4">
          <div className="w-full sm:flex-1 sm:min-w-[200px] flex gap-2">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && searchLocation()} hidden={location !== null} placeholder="Enter location (e.g., London, UK)" className={`flex-1 p-2 text-sm sm:text-base border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'}`} />
            <button onClick={searchLocation} disabled={loading || !searchQuery.trim()} hidden={location !== null} className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 whitespace-nowrap">Search</button>
            <button onClick={getCurrentLocation} disabled={loading} hidden={location !== null} className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 whitespace-nowrap"><span role="img" aria-label="GPS" className="text-lg">📍</span></button>
          </div>
          <div className="w-full sm:flex-1 sm:min-w-[200px] flex gap-2">
            <input type="text" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value.toUpperCase())} onKeyPress={(e) => e.key === 'Enter' && trackFlight()} placeholder="Enter flight number (e.g., BA123)" disabled={trackingAllAircraft} className={`flex-1 p-2 text-sm sm:text-base border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'} ${trackingAllAircraft ? 'opacity-50' : ''}`} />
            <button onClick={(e) => trackFlight()} disabled={loading || !flightNumber.trim() || trackingAllAircraft} className={`px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-300 whitespace-nowrap ${trackingAllAircraft ? 'opacity-50' : ''}`}>{loading ? 'Working...' : 'Track'}</button>
            <button onClick={(e) => getAllAircraft(false)} disabled={loading || trackingAllAircraft} className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-green-300 whitespace-nowrap">{loading ? 'Loading' : 'All Aircraft'}</button>
          </div>
          <div className="flex gap-2 items-center">
            {(location || trackingAllAircraft) && (<button onClick={clearLocation} disabled={loading} className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-red-300 whitespace-nowrap">Clear</button>)}
            {(flightData || trackingAllAircraft) && (<button onClick={(e) => { e.preventDefault(); trackingAllAircraft ? getAllAircraft(false) : trackFlight(true); }} className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap">Refresh</button>)}
            <button onClick={() => setFollowEnabled((v) => !v)} className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded border ${followEnabled ? 'bg-gray-200 text-gray-900' : 'bg-white text-gray-700'} ${isDarkMode ? 'border-gray-500' : 'border-gray-300'}`} title="Toggle follow camera">
              {followEnabled ? 'Following' : 'Free look'}
            </button>
          </div>
        </div>

        {error && (<div className={`p-2 sm:p-3 rounded text-xs sm:text-sm ${isDarkMode ? 'bg-red-900 text-red-100' : 'bg-red-100 text-red-700'}`}>{error}</div>)}

        {flightData && (
          <div className={`p-2 sm:p-4 rounded`} style={{ backgroundColor: isDarkMode ? theme.primary.dark : theme.primary.light, color: isDarkMode ? theme.text.muted : theme.text.primary }}>
            <div className="flex justify-between items-center mb-2 sm:mb-3"><div className="font-medium text-base sm:text-lg">{flightData.flight.number}</div></div>
            {displayedDistance !== null && (
              <div className="text-center">
                <div className={`text-xs sm:text-sm font-medium mb-1`} style={{ color: isDarkMode ? theme.primary.light : theme.primary.dark }}>Distance to Aircraft</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-1 sm:gap-2 px-4 sm:px-0">
                  <div className="font-mono text-lg sm:text-2xl font-bold order-2 sm:order-none sm:text-right">{bananasToNauticalMiles(metersToBananas(displayedDistance)).toFixed(2)}nm</div>
                  <div className="font-mono text-lg sm:text-2xl font-bold order-1 sm:order-none text-center">{Math.round(displayedDistance).toLocaleString()}m</div>
                  <div className="font-mono text-lg sm:text-2xl font-bold order-3 sm:order-none sm:text-left whitespace-nowrap">{Math.round(metersToBananas(displayedDistance)).toLocaleString()}🍌</div>
                </div>
              </div>
            )}
            <div className="space-y-2 sm:space-y-3">
              {flightData.live && (
                <div className="grid grid-cols-2 gap-2 sm:gap-4 mt-1 sm:mt-2">
                  <div><div className={`text-xs sm:text-sm font-medium text-center ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>Altitude</div><div className="text-sm sm:text-base text-center">{metersToFeet(flightData.live.altitude)}ft</div></div>
                  <div><div className={`text-xs sm:text-sm font-medium text-center ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>Speed</div><div className="text-sm sm:text-base text-center">{kmhToKnots(flightData.live.speed_horizontal)}kts</div></div>
                  <div><div className={`text-xs sm:text-sm font-medium text-center ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>Direction</div><div className="text-sm sm:text-base text-center">{flightData.live.direction}°</div></div>
                  <div><div className={`text-xs sm:text-sm font-medium text-center ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>Status</div><div className="text-sm sm:text-base text-center">{flightData.live.is_ground ? 'On Ground' : 'In Air'}</div></div>
                </div>
              )}
              {lastApiCall && (<div className={`text-[10px] sm:text-xs mt-1 sm:mt-2 text-center ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>Using API data from {new Date(lastApiCall).toLocaleString()}<br /><span className="italic">Auto-refreshes every minute, this use a lot of data so recommend using this feature with wifi only</span></div>)}
            </div>
          </div>
        )}

        {trackingAllAircraft && (
          <div className={`p-2 sm:p-4 rounded`} style={{ backgroundColor: isDarkMode ? theme.accent.success : '#d1fae5', color: isDarkMode ? theme.text.primary : theme.text.primary }}>
            <div className="flex justify-between items-center mb-1 sm:mb-3"><div className="font-medium text-base sm:text-lg">All Aircraft</div><div className="text-xs sm:text-sm font-mono">{visibleAircraft.length} visible / {allAircraft.length} total</div></div>
            <div className={`text-[10px] sm:text-xs mt-1 sm:mt-2 text-center ${isDarkMode ? 'text-green-300' : 'text-green-600'}`}>Using API data from {lastApiCall ? new Date(lastApiCall).toLocaleString() : 'N/A'}<br /><span className="italic">Auto-refreshes every minute, this use a lot of data so recommend using this feature with wifi only</span></div>
          </div>
        )}
      </div>

      <div className={`h-[50vh] sm:h-[60vh] md:h-[600px] rounded border ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
        <CesiumGlobe
          ref={globeRef as any}
          isDarkMode={isDarkMode}
          initialCenter={{ lat: location?.lat ?? 51.505, lng: location?.lng ?? -0.09, height: 3_000_000 }}
          onViewChange={stableOnViewChange}
        />
      </div>
    </div>
  );
};

export default FlightTracker; 