import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, Loader } from 'lucide-react';
import airportTimezone from 'airport-timezone';
import { zonedTimeToUtc } from 'date-fns-tz';
import { Slider } from '@mui/material';
import planeIcon from '../plane-icon.svg';
import { useTheme } from '../context/ThemeContext';
import CesiumGlobe, { CesiumGlobeRef } from './common/CesiumGlobe';
import { bearingDegrees, haversineDistanceMeters } from '../utils/geo';
import airportData from 'aircodes';

interface Waypoint {
  lat: number;
  lon: number;
  ident: string;
}

interface AirportTimezone {
  code: string;
  timezone: string;
  offset: {
    gmt: number;
    dst: number;
  };
}

interface FlightPlan {
  id: string;
  fromICAO: string;
  toICAO: string;
  fromName: string;
  toName: string;
  distance: number;
  route: { nodes: Waypoint[] };
  departureTime?: string;
  arrivalTime?: string;
  duration?: string;
}

interface RouteProgress {
  position: [number, number];
  currentTime: Date;
  percentage: number;
}

interface CachedRoutePosition {
  position: [number, number];
  currentTime: Date;
  percentage: number;
  timeString: string;
}

const findClosestPosition = (positions: CachedRoutePosition[], target: number): CachedRoutePosition | null => {
  if (!positions.length) return null;
  let low = 0;
  let high = positions.length - 1;
  if (target <= positions[0].percentage) return positions[0];
  if (target >= positions[high].percentage) return positions[high];
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (positions[mid].percentage === target) return positions[mid];
    if (positions[mid].percentage < target) low = mid + 1; else high = mid - 1;
  }
  return (low < positions.length && high >= 0)
    ? (Math.abs(positions[low].percentage - target) < Math.abs(positions[high].percentage - target) ? positions[low] : positions[high])
    : null;
};

// Removed manual DST logic; use IANA timezones via date-fns-tz for accurate conversions.

const FlightCalculator: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [departure, setDeparture] = useState(() => localStorage.getItem('calcDeparture') || '');
  const [arrival, setArrival] = useState(() => localStorage.getItem('calcArrival') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flightPlans, setFlightPlans] = useState<FlightPlan[]>([]);
  const [departureTime, setDepartureTime] = useState(() => localStorage.getItem('calcDepartureTime') || '');
  const [arrivalTime, setArrivalTime] = useState(() => localStorage.getItem('calcArrivalTime') || '');
  const [routeProgress, setRouteProgress] = useState<RouteProgress | null>(null);
  const [sliderValue, setSliderValue] = useState<number>(0);
  const [cachedPositions, setCachedPositions] = useState<CachedRoutePosition[]>([]);
  const globeRef = useRef<CesiumGlobeRef | null>(null);

  useEffect(() => { departure ? localStorage.setItem('calcDeparture', departure) : localStorage.removeItem('calcDeparture'); }, [departure]);
  useEffect(() => { arrival ? localStorage.setItem('calcArrival', arrival) : localStorage.removeItem('calcArrival'); }, [arrival]);
  useEffect(() => { departureTime ? localStorage.setItem('calcDepartureTime', departureTime) : localStorage.removeItem('calcDepartureTime'); }, [departureTime]);
  useEffect(() => { arrivalTime ? localStorage.setItem('calcArrivalTime', arrivalTime) : localStorage.removeItem('calcArrivalTime'); }, [arrivalTime]);

  const handleDepartureTimeChange = (time: string) => {
    setDepartureTime(time);
    if (!arrivalTime || new Date(arrivalTime) <= new Date(time)) {
      const newArrivalTime = new Date(time); newArrivalTime.setHours(newArrivalTime.getHours() + 1);
      setArrivalTime(newArrivalTime.toISOString().slice(0, 16));
    }
  };

  const getAirportTimezone = useCallback((icao: string): AirportTimezone | null => {
    try {
      const airport = airportData.getAirportByIcao(icao);
      if (!airport?.iata) return null;
      const tzAirport = airportTimezone.filter((apt: AirportTimezone) => apt.code === airport.iata)[0];
      return tzAirport || null;
    } catch { return null; }
  }, []);

  const calculateDuration = useCallback((depTime: string, arrTime: string, depICAO: string, arrICAO: string): string => {
    const depAirport = getAirportTimezone(depICAO);
    const arrAirport = getAirportTimezone(arrICAO);
    if (!depAirport || !arrAirport) return 'Unknown duration';
    try {
      // Interpret depTime/arrTime as wall-times in their respective airport timezones
      const depUTC = zonedTimeToUtc(depTime, depAirport.timezone);
      const arrUTC = zonedTimeToUtc(arrTime, arrAirport.timezone);
      const durationMs = arrUTC.getTime() - depUTC.getTime();
      if (durationMs < 0) return 'Invalid times';
      const hours = Math.floor(durationMs / 3600000);
      const minutes = Math.round((durationMs % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    } catch (e) {
      return 'Unknown duration';
    }
  }, [getAirportTimezone]);

  const searchFlightPlans = async () => {
    if (!departure || !arrival) { setError('Please enter both departure and arrival'); return; }
    setLoading(true); setError('');
    try {
      const searchResponse = await fetch(`https://api.flightplandatabase.com/search/plans?fromICAO=${departure}&toICAO=${arrival}`, { headers: { Accept: 'application/json' } });
      if (!searchResponse.ok) {
        const body = await searchResponse.text().catch(() => '');
        throw new Error(`Failed to fetch flight plans: ${searchResponse.status} ${searchResponse.statusText} ${body}`);
      }
      const plans = await searchResponse.json();
      if (plans.length === 0) { setError('No flight plans found'); setFlightPlans([]); setCachedPositions([]); return; }
      const latestPlan = plans[0];
      const planResponse = await fetch(`https://api.flightplandatabase.com/plan/${latestPlan.id}`, { headers: { Accept: 'application/json' } });
      if (!planResponse.ok) {
        const body = await planResponse.text().catch(() => '');
        throw new Error(`Failed to fetch flight plan details: ${planResponse.status} ${planResponse.statusText} ${body}`);
      }
      const planDetails: FlightPlan = await planResponse.json();
      planDetails.route.nodes = planDetails.route.nodes || [];
      if (departureTime && arrivalTime) planDetails.duration = calculateDuration(departureTime, arrivalTime, planDetails.fromICAO, planDetails.toICAO);
      setFlightPlans([planDetails]);
      calculateRoutePositions(planDetails, departureTime);
      // Fit view
      if (globeRef.current && planDetails.route.nodes.length > 0) {
        const first = planDetails.route.nodes[0];
        globeRef.current.setView({ lat: first.lat, lng: first.lon, height: 2_000_000, pitchDeg: -85 });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Attempt fallback: generate straight-line plan between airports if possible
      try {
        const fallback = generateStraightLinePlan(departure, arrival, 24);
        setFlightPlans([fallback]);
        calculateRoutePositions(fallback, departureTime || new Date().toISOString());
        setError('Using fallback straight-line plan due to API error: ' + msg);
      } catch (fallbackErr) {
        setError('Error fetching flight plans: ' + msg);
      }
    } finally { setLoading(false); }
  };

  const generateStraightLinePlan = (fromICAO: string, toICAO: string, points = 24): FlightPlan => {
    const fromAirport: any = (airportData as any).getAirportByIcao(fromICAO);
    const toAirport: any = (airportData as any).getAirportByIcao(toICAO);
    if (!fromAirport || !toAirport) throw new Error('Airport data not available for fallback');
    const fromLat = fromAirport.latitude_deg ?? fromAirport.lat ?? null;
    const fromLon = fromAirport.longitude_deg ?? fromAirport.lon ?? null;
    const toLat = toAirport.latitude_deg ?? toAirport.lat ?? null;
    const toLon = toAirport.longitude_deg ?? toAirport.lon ?? null;
    if (fromLat === null || fromLon === null || toLat === null || toLon === null) throw new Error('Incomplete airport coordinates');
    // Use great-circle interpolation for more realistic routing
    const toRad = (d: number) => d * Math.PI / 180;
    const toDeg = (r: number) => r * 180 / Math.PI;
    const φ1 = toRad(fromLat), λ1 = toRad(fromLon);
    const φ2 = toRad(toLat), λ2 = toRad(toLon);
    const Δλ = λ2 - λ1;
    const sinφ1 = Math.sin(φ1), cosφ1 = Math.cos(φ1);
    const sinφ2 = Math.sin(φ2), cosφ2 = Math.cos(φ2);
    const central = Math.acos(Math.min(1, Math.max(-1, sinφ1 * sinφ2 + cosφ1 * cosφ2 * Math.cos(Δλ))));

    const nodes: Waypoint[] = [];
    if (central === 0 || !isFinite(central)) {
      // same point
      for (let i = 0; i <= points; i++) nodes.push({ lat: fromLat, lon: fromLon, ident: `WP${i}` });
    } else {
      for (let i = 0; i <= points; i++) {
        const f = i / points;
        const A = Math.sin((1 - f) * central) / Math.sin(central);
        const B = Math.sin(f * central) / Math.sin(central);
        const x = A * cosφ1 * Math.cos(λ1) + B * cosφ2 * Math.cos(λ2);
        const y = A * cosφ1 * Math.sin(λ1) + B * cosφ2 * Math.sin(λ2);
        const z = A * sinφ1 + B * sinφ2;
        const φi = Math.atan2(z, Math.sqrt(x * x + y * y));
        const λi = Math.atan2(y, x);
        nodes.push({ lat: toDeg(φi), lon: toDeg(λi), ident: `WP${i}` });
      }
    }
    const distance = haversineDistanceMeters(fromLat, fromLon, toLat, toLon);
    const plan: FlightPlan = {
      id: `fallback-${fromICAO}-${toICAO}-${Date.now()}`,
      fromICAO,
      toICAO,
      fromName: fromAirport.name || fromICAO,
      toName: toAirport.name || toICAO,
      distance,
      route: { nodes },
      duration: undefined,
    };
    return plan;
  };

  const calculateRoutePosition = useCallback((waypoints: Waypoint[], percentage: number, depTime: string, duration: string): RouteProgress => {
    if (waypoints.length < 2) return { position: [0, 0], currentTime: new Date(depTime), percentage: 0 };
    const taxiTime = 10 * 60 * 1000;
    const [hours, minutes] = duration.split('h ').map(part => parseInt(part.replace('m', '')));
    const totalDurationMs = hours * 3600000 + minutes * 60000;
    let adjustedPercentage = percentage;
    const taxiPercentage = (taxiTime / totalDurationMs) * 100;
    if (percentage <= taxiPercentage) adjustedPercentage = 0;
    else if (percentage >= 100 - taxiPercentage) adjustedPercentage = 100;
    else adjustedPercentage = ((percentage - taxiPercentage) / (100 - 2 * taxiPercentage)) * 100;
    const totalSegments = waypoints.length - 1;
    const segmentPercentage = (adjustedPercentage * totalSegments) / 100;
    const currentSegment = Math.floor(segmentPercentage);
    const segmentProgress = segmentPercentage - currentSegment;
    let position: [number, number];
    if (adjustedPercentage >= 100) position = [waypoints[totalSegments].lat, waypoints[totalSegments].lon];
    else if (adjustedPercentage <= 0) position = [waypoints[0].lat, waypoints[0].lon];
    else {
      const start = waypoints[currentSegment];
      const end = waypoints[currentSegment + 1];
      position = [start.lat + (end.lat - start.lat) * segmentProgress, start.lon + (end.lon - start.lon) * segmentProgress];
    }
    // depTime is expected to be an ISO UTC string here (see calculateRoutePositions)
    const startTime = new Date(depTime);
    const elapsedMs = (totalDurationMs * percentage) / 100;
    const currentTime = new Date(startTime.getTime() + elapsedMs);
    return { position, currentTime, percentage };
  }, []);

  const calculateRoutePositions = useCallback((plan: FlightPlan, depTime: string) => {
    if (!plan.duration || !plan.route.nodes.length) { setCachedPositions([]); return; }
    const positions: CachedRoutePosition[] = [];
    const INTERVAL = 5 * 60 * 1000;
    const [hours, minutes] = plan.duration.split('h ').map(part => parseInt(part.replace('m', '')));
    const totalDurationMs = hours * 3600000 + minutes * 60000 + 20 * 60 * 1000;
    const steps = Math.ceil(totalDurationMs / INTERVAL);
    for (let i = 0; i <= steps; i++) {
      const percentage = (i * INTERVAL * 100) / totalDurationMs; if (percentage > 100) break;
      // Convert departure wall-time into UTC using the plan's departure timezone
      let depUtcIso = depTime;
      try {
        const depAirport = getAirportTimezone(plan.fromICAO);
        if (depAirport) {
          const depUtc = zonedTimeToUtc(depTime, depAirport.timezone);
          depUtcIso = depUtc.toISOString();
        }
      } catch (e) {
        // fall back to provided depTime
      }
      const progress = calculateRoutePosition(plan.route.nodes, percentage, depUtcIso, plan.duration);
      positions.push({ ...progress, timeString: progress.currentTime.toLocaleTimeString() });
    }
    setCachedPositions(positions); setSliderValue(0); setRouteProgress(positions[0] || null);
  }, [calculateRoutePosition, getAirportTimezone]);

  useEffect(() => {
    // Draw route and aircraft on globe when plan/progress changes
    const plan = flightPlans[0];
    if (!globeRef.current) return;
    if (!plan) { globeRef.current.removePolyline('route'); globeRef.current.removeMarker('calc-plane'); return; }
    if (plan.route.nodes.length > 1) {
      globeRef.current.upsertPolyline({
        id: 'route',
        positions: plan.route.nodes.map(w => ({ lat: w.lat, lng: w.lon })),
        colorCss: '#ef4444',
        width: 3,
      });
    }
    if (routeProgress) {
      const idx = Math.floor((routeProgress.percentage * (plan.route.nodes.length - 1)) / 100);
      const nextIdx = Math.min(idx + 1, plan.route.nodes.length - 1);
      const start: [number, number] = [plan.route.nodes[idx].lat, plan.route.nodes[idx].lon];
      const end: [number, number] = [plan.route.nodes[nextIdx].lat, plan.route.nodes[nextIdx].lon];
      const bearing = bearingDegrees(start, end);
      globeRef.current.upsertMarker({ id: 'calc-plane', lat: routeProgress.position[0], lng: routeProgress.position[1], image: planeIcon, size: 24, rotationDeg: bearing });
      // Keep map north-up; center on route progress only
      // Preserve user zoom by omitting `height` (CesiumGlobe keeps current camera height)
      globeRef.current.setView({ lat: routeProgress.position[0], lng: routeProgress.position[1], pitchDeg: -85 });
      // Set globe time to the calculated route progress time so the terminator matches
      try { globeRef.current.setTime(routeProgress.currentTime); } catch (e) { /* ignore if not supported */ }
    }
  }, [flightPlans, routeProgress]);

  // When the calculator component is closed/unmounted, restore globe time to current
  useEffect(() => {
    const viewer = globeRef.current;
    return () => {
      try { viewer?.setTime(null); } catch (e) { /* ignore */ }
    };
  }, []);

  const handleSliderChange = useCallback((_: Event, value: number | number[]) => {
    const percentage = typeof value === 'number' ? value : value[0];
    setSliderValue(percentage);
    if (!cachedPositions.length) return;
    const position = findClosestPosition(cachedPositions, percentage);
    if (position) setRouteProgress({ position: position.position, currentTime: position.currentTime, percentage });
  }, [cachedPositions]);

  const clearStoredFields = () => {
    setDeparture(''); setArrival(''); setDepartureTime(''); setArrivalTime(''); setFlightPlans([]); setRouteProgress(null); setSliderValue(0); setCachedPositions([]); setError('');
    localStorage.removeItem('calcDeparture'); localStorage.removeItem('calcArrival'); localStorage.removeItem('calcDepartureTime'); localStorage.removeItem('calcArrivalTime');
  };

  useEffect(() => {
    if (flightPlans.length > 0 && departureTime && arrivalTime) {
      const plan = flightPlans[0];
      plan.duration = calculateDuration(departureTime, arrivalTime, plan.fromICAO, plan.toICAO);
      calculateRoutePositions(plan, departureTime);
    }
  }, [departureTime, arrivalTime, flightPlans, calculateDuration, calculateRoutePositions]);

  return (
    <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-3 sm:p-6 h-full mx-auto`}>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-6 h-full">
        <div className="lg:col-span-1 space-y-3 sm:space-y-4">
          <div>
            <label className={`block text-xs sm:text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Departure (ICAO/Name)</label>
            <input type="text" value={departure} onChange={(e) => setDeparture(e.target.value.toUpperCase())} className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'}`} placeholder="EGLL" />
          </div>
          <div>
            <label className={`block text-xs sm:text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Departure Time</label>
            <input type="datetime-local" value={departureTime} onChange={(e) => handleDepartureTimeChange(e.target.value)} className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'}`} />
          </div>
          <div>
            <label className={`block text-xs sm:text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Arrival (ICAO/Name)</label>
            <input type="text" value={arrival} onChange={(e) => setArrival(e.target.value.toUpperCase())} className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'}`} placeholder="KJFK" />
          </div>
          <div>
            <label className={`block text-xs sm:text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Arrival Time</label>
            <input type="datetime-local" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'}`} />
          </div>
          <button onClick={searchFlightPlans} disabled={loading || !departure || !arrival} className="w-full bg-blue-600 text-white p-2 sm:p-3 rounded hover:bg-blue-700 disabled:bg-blue-300 flex items-center justify-center gap-2 text-sm sm:text-base">
            {loading ? (<><Loader className="animate-spin" size={16} />Searching...</>) : (<><Search size={16} />Search Flight Plans</>)}
          </button>
          <button onClick={clearStoredFields} className="w-full bg-red-600 text-white p-2 sm:p-3 rounded hover:bg-red-700 flex items-center justify-center gap-2 text-sm sm:text-base">Clear All Fields</button>
        </div>

        <div className="lg:col-span-3 space-y-3 sm:space-y-4">
          {error && (<div className={`p-2 sm:p-3 rounded text-sm sm:text-base ${isDarkMode ? 'bg-red-900 text-red-100' : 'bg-red-100 text-red-700'}`}>{error}</div>)}

          <div className={`h-[50vh] md:h-[calc(100vh-350px)] rounded border ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
            <CesiumGlobe ref={globeRef as any} isDarkMode={isDarkMode} initialCenter={{ lat: 51.505, lng: -0.09, height: 3_000_000 }} />
          </div>

          {flightPlans.length > 0 && (
            <div className={`${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} p-3 sm:p-4 rounded border text-sm sm:text-base`}>
              <h2 className={`text-lg sm:text-xl font-semibold mb-2 sm:mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Flight Plan Details</h2>
              <div className="space-y-3 sm:space-y-4">
                {flightPlans.map((plan) => (
                  <div key={plan.id}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 mb-2 sm:mb-4">
                      <div>
                        <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{plan.fromICAO} → {plan.toICAO}</div>
                        <div className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{plan.fromName} → {plan.toName}</div>
                        {plan.duration && (<div className="text-xs sm:text-sm font-medium text-blue-400">Duration: {plan.duration}</div>)}
                      </div>
                      <div className="text-right">
                        <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{Math.round(plan.distance)} nm</div>
                        {departureTime && (<div className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Departure: {new Date(departureTime).toLocaleString()} - {getAirportTimezone(plan.fromICAO)?.timezone}</div>)}
                        {arrivalTime && (<div className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Arrival: {new Date(arrivalTime).toLocaleString()} - {getAirportTimezone(plan.toICAO)?.timezone}</div>)}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1 sm:mb-2">
                        <span className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{routeProgress?.currentTime.toLocaleTimeString() || 'Route Progress'}</span>
                        {routeProgress && (<span className={`text-xs sm:text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{Math.round(routeProgress.percentage)}%</span>)}
                      </div>
                      <div className="relative">
                        <Slider value={sliderValue} onChange={handleSliderChange} aria-labelledby="route-progress-slider" min={0} max={100} step={0.1} disabled={!departureTime || !cachedPositions.length} sx={{ '& .MuiSlider-thumb': { transition: 'none', backgroundColor: isDarkMode ? '#fff' : '#1976d2', '&:hover, &.Mui-focusVisible': { backgroundColor: isDarkMode ? '#e0e0e0' : '#1565c0' }, }, '& .MuiSlider-track': { transition: 'none', backgroundColor: isDarkMode ? '#fff' : '#1976d2', }, '& .MuiSlider-rail': { backgroundColor: isDarkMode ? '#4b5563' : '#e5e7eb', }, }} />
                        <div className="relative group">
                          {cachedPositions.filter((_, idx) => idx % 3 === 0).map((pos, idx) => (
                            <div key={idx} className="absolute -translate-x-1/2 text-xs text-gray-400" style={{ left: `${pos.percentage}%` }}>
                              |
                              <span className="hidden group-hover:block absolute -translate-x-1/2 whitespace-nowrap text-[10px] sm:text-xs">{pos.timeString}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {routeProgress && (
                        <div className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mt-4 sm:mt-4`}>
                          Current Position: {routeProgress.position[0].toFixed(2)}, {routeProgress.position[1].toFixed(2)}
                          <br />
                          Current Time (UTC): {routeProgress.currentTime.toUTCString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FlightCalculator;