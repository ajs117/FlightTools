import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, Loader } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import airportTimezone from 'airport-timezone';
import { Slider } from '@mui/material';
// @ts-ignore
import terminator from "@joergdietrich/leaflet.terminator";
import planeIcon from '../plane-icon.svg';
import { useTheme } from '../context/ThemeContext';
import { calculateBearing } from '../utils/geo';
import { formatDuration, calculateDuration, convertToUTC, formatDateTime, parseDuration } from '../utils/time';
import { Waypoint } from '../utils/geo';
import { initializeLeaflet, getTileLayerUrl, createPlaneIcon } from '../utils/leafletHelpers';
const airportData = require('aircodes');

// Initialize Leaflet
initializeLeaflet();

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

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
  route: {
    nodes: Waypoint[];
  };
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

// Map component to set bounds
const SetBoundsToRoute = ({ waypoints }: { waypoints: Waypoint[] }) => {
  const map = useMap();
  
  useEffect(() => {
    if (waypoints.length < 2) return;
    
    const latLngs = waypoints.map(w => L.latLng(w.lat, w.lng));
    const bounds = L.latLngBounds(latLngs);
    
    // Add padding around the bounds
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [waypoints, map]);
  
  return null;
};

const findClosestPosition = (positions: CachedRoutePosition[], target: number): CachedRoutePosition | null => {
  if (!positions.length) return null;
  
  let low = 0;
  let high = positions.length - 1;
  
  // Handle edge cases
  if (target <= positions[0].percentage) return positions[0];
  if (target >= positions[high].percentage) return positions[high];
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (positions[mid].percentage === target) {
      return positions[mid];
    }
    if (positions[mid].percentage < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  
  // Return the closest position
  return (low < positions.length && high >= 0) 
    ? (Math.abs(positions[low].percentage - target) < Math.abs(positions[high].percentage - target) 
       ? positions[low] : positions[high])
    : null;
};

interface DayNightTerminatorProps {
  currentTime?: Date;
}

const DayNightTerminator = ({ currentTime }: DayNightTerminatorProps) => {
  const map = useMap();
  const terminatorRef = useRef<any>(null);
  
  useEffect(() => {
    terminatorRef.current = terminator().addTo(map);

    return () => {
      if (terminatorRef.current) {
        map.removeLayer(terminatorRef.current);
      }
    };
  }, [map]);

  useEffect(() => {
    if (terminatorRef.current && currentTime) {
      terminatorRef.current.setTime(currentTime);
    }
  }, [currentTime]);

  return null;
};

const FlightCalculator: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [departure, setDeparture] = useState('EGBB');
  const [arrival, setArrival] = useState('EDDF');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flightPlans, setFlightPlans] = useState<FlightPlan[]>([]);
  const [departureTime, setDepartureTime] = useState('2024-12-27T17:45');
  const [arrivalTime, setArrivalTime] = useState('2024-12-27T20:20');
  const [routeProgress, setRouteProgress] = useState<RouteProgress | null>(null);
  const [sliderValue, setSliderValue] = useState<number>(0);
  const [cachedPositions, setCachedPositions] = useState<CachedRoutePosition[]>([]);

  const getAirportTimezone = useCallback((icao: string): AirportTimezone | null => {
    try {
      const airport = airportData.getAirportByIcao(icao);
      if (!airport?.iata) return null;
      
      const tzAirport = airportTimezone.filter((apt: AirportTimezone) => 
        apt.code === airport.iata
      )[0];
      
      return tzAirport || null;
    } catch (err) {
      return null;
    }
  }, []);

  const searchFlightPlans = async () => {
    if (!departure || !arrival) {
      setError('Please enter both departure and arrival');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // First get the list of plans
      const searchResponse = await fetch(
        `https://api.flightplandatabase.com/search/plans?fromICAO=${departure}&toICAO=${arrival}`,
        {
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      if (!searchResponse.ok) {
        throw new Error('Failed to fetch flight plans');
      }

      const plans = await searchResponse.json();
      if (plans.length === 0) {
        setError('No flight plans found');
        setFlightPlans([]);
        setCachedPositions([]);
        return;
      }

      // Get the latest plan details
      const latestPlan = plans[0];
      const planResponse = await fetch(
        `https://api.flightplandatabase.com/plan/${latestPlan.id}`,
        {
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      if (!planResponse.ok) {
        throw new Error('Failed to fetch flight plan details');
      }

      const planDetails: FlightPlan = await planResponse.json();
      // Ensure waypoints is always an array
      planDetails.route.nodes = planDetails.route.nodes || [];
      if (departureTime && arrivalTime) {
        const depAirport = getAirportTimezone(planDetails.fromICAO);
        const arrAirport = getAirportTimezone(planDetails.toICAO);
        planDetails.duration = calculateDuration(
          departureTime,
          arrivalTime,
          depAirport,
          arrAirport
        );
      }
      setFlightPlans([planDetails]);
      calculateRoutePositions(planDetails, departureTime);
    } catch (err) {
      setError('Error fetching flight plans: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const calculateRoutePosition = useCallback((
    waypoints: Waypoint[],
    percentage: number,
    depTime: string,
    duration: string
  ): RouteProgress => {
    if (waypoints.length < 2) return {
      position: [0, 0],
      currentTime: new Date(depTime),
      percentage: 0
    };
  
    // Add 10 minutes for taxi at each end
    const taxiTime = 10 * 60 * 1000; // 10 minutes in milliseconds
    const { hours, minutes } = parseDuration(duration);

    const totalDurationMs = (hours * 3600000) + (minutes * 60000);
    const flightDurationMs = totalDurationMs - (taxiTime * 2);
    
    // Calculate the adjusted progress percentage for actual route position
    let adjustedPercentage = percentage;
    
    // Calculate taxi time percentages based on actual taxi time
    const taxiPercentage = (taxiTime / totalDurationMs) * 100;
    
    if (percentage <= taxiPercentage) {
      // Initial taxi phase - position stays at first waypoint
      adjustedPercentage = 0;
    } else if (percentage >= (100 - taxiPercentage)) {
      // Final taxi phase - position stays at last waypoint
      adjustedPercentage = 100;
    } else {
      // Flight phase - rescale percentage to account for taxi time
      const flightRange = 100 - (2 * taxiPercentage);
      adjustedPercentage = ((percentage - taxiPercentage) / flightRange) * 100;
    }
    
    // Calculate position alngg route based on adjusted percentage
    const totalSegments = waypoints.length - 1;
    const segmentPercentage = (adjustedPercentage * totalSegments) / 100;
    const currentSegment = Math.floor(segmentPercentage);
    const segmentProgress = segmentPercentage - currentSegment;
  
    // Get the position
    let position;
    if (adjustedPercentage >= 100) {
      position = [waypoints[totalSegments].lat, waypoints[totalSegments].lng] as [number, number];
    } else if (adjustedPercentage <= 0) {
      position = [waypoints[0].lat, waypoints[0].lng] as [number, number];
    } else {
      const start = waypoints[currentSegment];
      const end = waypoints[currentSegment + 1];
      
      const lat = start.lat + (end.lat - start.lat) * segmentProgress;
      const lng = start.lng + (end.lng - start.lng) * segmentProgress;
      position = [lat, lng] as [number, number];
    }
    
    // Calculate current time based on original percentage (including taxi time)
    const startTime = new Date(depTime);
    const elapsedMs = (totalDurationMs * percentage) / 100;
    const currentTime = new Date(startTime.getTime() + elapsedMs);
  
    return {
      position,
      currentTime,
      percentage
    };
  }, []);
  
  const calculateRoutePositions = useCallback((
    plan: FlightPlan,
    depTime: string
  ) => {
    if (!plan.duration || !plan.route.nodes.length) {
      setCachedPositions([]);
      return;
    }
  
    const positions: CachedRoutePosition[] = [];
    // Create more granular positions for smoother slider
    const INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds (more granular)
    const { hours, minutes } = parseDuration(plan.duration);
    
    const totalDurationMs = (hours * 3600000) + (minutes * 60000) + (20 * 60 * 1000); // Including taxi time
    const steps = Math.ceil(totalDurationMs / INTERVAL);
  
    for (let i = 0; i <= steps; i++) {
      const percentage = (i * INTERVAL * 100) / totalDurationMs;
      if (percentage > 100) break;
  
      const progress = calculateRoutePosition(
        plan.route.nodes,
        percentage,
        depTime,
        plan.duration
      );
  
      positions.push({
        ...progress,
        timeString: progress.currentTime.toLocaleTimeString()
      });
    }
  
    setCachedPositions(positions);
    // Initialize the slider to 0%
    setSliderValue(0);
    setRouteProgress(positions[0] || null);
  }, [calculateRoutePosition]);
  
  const handleSliderChange = useCallback((
    event: Event,
    value: number | number[]
  ) => {
    const percentage = typeof value === 'number' ? value : value[0];
    setSliderValue(percentage);
    
    if (cachedPositions.length === 0) return;
    
    // Use the cached positions directly
    const position = findClosestPosition(cachedPositions, percentage);
    if (position) {
      setRouteProgress({
        position: position.position,
        currentTime: position.currentTime,
        percentage
      });
    }
  }, [cachedPositions]);

  // When departure or arrival time changes, recalculate
  useEffect(() => {
    if (flightPlans.length > 0 && departureTime && arrivalTime) {
      const plan = flightPlans[0];
      const depAirport = getAirportTimezone(plan.fromICAO);
      const arrAirport = getAirportTimezone(plan.toICAO);
      plan.duration = calculateDuration(
        departureTime,
        arrivalTime,
        depAirport,
        arrAirport
      );
      calculateRoutePositions(plan, departureTime);
    }
  }, [departureTime, arrivalTime, flightPlans, getAirportTimezone, calculateRoutePositions]);

  const renderUTCTime = useCallback((time: Date, airport: string): string => {
    const depAirport = getAirportTimezone(airport);
    if (!depAirport) return time.toLocaleString();
    return formatDateTime(convertToUTC(time, depAirport), false);
  }, [getAirportTimezone]);

  return (
    <div className={`${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} p-4 overflow-hidden`}>
      <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6 h-full mx-auto`}>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
          {/* Input section */}
          <div className="lg:col-span-1 space-y-4">
            <div>
              <label className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                Departure (ICAO/Name)
              </label>
              <input
                type="text"
                value={departure}
                onChange={(e) => setDeparture(e.target.value.toUpperCase())}
                className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'
                }`}
                placeholder="EGLL"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                Departure Time
              </label>
              <input
                type="datetime-local"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                Arrival (ICAO/Name)
              </label>
              <input
                type="text"
                value={arrival}
                onChange={(e) => setArrival(e.target.value.toUpperCase())}
                className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'
                }`}
                placeholder="KJFK"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                Arrival Time
              </label>
              <input
                type="datetime-local"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className={`w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'
                }`}
              />
            </div>
            <button
              onClick={searchFlightPlans}
              disabled={loading || !departure || !arrival}
              className="w-full bg-blue-600 text-white p-3 rounded hover:bg-blue-700 disabled:bg-blue-300 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="animate-spin" size={16} />
                  Searching...
                </>
              ) : (
                <>
                  <Search size={16} />
                  Search Flight Plans
                </>
              )}
            </button>
          </div>

          {/* Map and details section */}
          <div className="lg:col-span-3 space-y-4">
            {error && (
              <div className={`p-3 rounded ${
                isDarkMode ? 'bg-red-900 text-red-100' : 'bg-red-100 text-red-700'
              }`}>
                {error}
              </div>
            )}
            
            {/* Map container */}
            <div className={`h-[calc(100vh-300px)] rounded border ${
              isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
            }`}>
              <MapContainer
                style={{ height: '100%', width: '100%' }}
                center={[51.505, -0.09]}
                zoom={2}
                scrollWheelZoom={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url={getTileLayerUrl(isDarkMode)}
                />
                <DayNightTerminator currentTime={routeProgress?.currentTime} />
                {flightPlans.map((plan) => (
                  <React.Fragment key={plan.id}>
                    <Polyline
                      positions={plan.route.nodes.map(w => [w.lat, w.lng])}
                      color={isDarkMode ? "white" : "black"}
                    />
                    {routeProgress && (
                      <Marker
                        position={routeProgress.position}
                        icon={createPlaneIcon((() => {
                          const currentIdx = Math.floor((routeProgress.percentage * (plan.route.nodes.length - 1)) / 100);
                          const nextIdx = Math.min(currentIdx + 1, plan.route.nodes.length - 1);
                          const start: [number, number] = [plan.route.nodes[currentIdx].lat, plan.route.nodes[currentIdx].lng];
                          const end: [number, number] = [plan.route.nodes[nextIdx].lat, plan.route.nodes[nextIdx].lng];
                          return calculateBearing(start, end);
                        })())}
                      />
                    )}
                    {plan.route.nodes.length > 0 && (
                      <SetBoundsToRoute waypoints={plan.route.nodes} />
                    )}
                  </React.Fragment>
                ))}
              </MapContainer>
            </div>

            {/* Flight plan details */}
            {flightPlans.length > 0 && (
              <div className={`${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} p-4 rounded border`}>
                <h2 className={`text-xl font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Flight Plan Details
                </h2>
                <div className="space-y-4">
                  {flightPlans.map((plan) => (
                    <div key={plan.id}>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {plan.fromICAO} → {plan.toICAO}
                          </div>
                          <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {plan.fromName} → {plan.toName}
                          </div>
                          {plan.duration && (
                            <div className="text-sm font-medium text-blue-400">
                              Duration: {plan.duration}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {Math.round(plan.distance)} nm
                          </div>
                          {departureTime && (
                            <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              Departure: {formatDateTime(new Date(departureTime), false)} - 
                              {getAirportTimezone(plan.fromICAO)?.timezone}
                            </div>
                          )}
                          {arrivalTime && (
                            <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              Arrival: {formatDateTime(new Date(arrivalTime), false)} - 
                              {getAirportTimezone(plan.toICAO)?.timezone}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {routeProgress?.currentTime.toLocaleTimeString() || 'Route Progress'}
                          </span>
                          {routeProgress && (
                            <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                              {Math.round(routeProgress.percentage)}%
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <Slider
                            value={sliderValue}
                            onChange={handleSliderChange}
                            aria-labelledby="route-progress-slider"
                            min={0}
                            max={100}
                            step={0.1}
                            disabled={!departureTime || !cachedPositions.length}
                            sx={{
                              '& .MuiSlider-thumb': {
                                transition: 'none',
                                backgroundColor: isDarkMode ? '#fff' : '#1976d2',
                                '&:hover, &.Mui-focusVisible': {
                                  backgroundColor: isDarkMode ? '#e0e0e0' : '#1565c0',
                                },
                              },
                              '& .MuiSlider-track': {
                                transition: 'none',
                                backgroundColor: isDarkMode ? '#fff' : '#1976d2',
                              },
                              '& .MuiSlider-rail': {
                                backgroundColor: isDarkMode ? '#4b5563' : '#e5e7eb',
                              },
                            }}
                          />
                          <div className="relative group">
                            {cachedPositions.filter((_, idx) => idx % 3 === 0).map((pos, idx) => (
                              <div
                                key={idx}
                                className="absolute -translate-x-1/2 text-xs text-gray-400"
                                style={{ left: `${pos.percentage}%` }}
                              >
                                |
                                <span className="hidden group-hover:block absolute -translate-x-1/2 whitespace-nowrap">
                                  {pos.timeString}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {routeProgress && (
                          <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mt-4`}>
                            Current Position: {routeProgress.position[0].toFixed(2)}, {routeProgress.position[1].toFixed(2)}
                            <br />
                            Current Time (UTC): {renderUTCTime(routeProgress.currentTime, flightPlans[0]?.fromICAO || '')}
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
    </div>
  );
};

export default FlightCalculator;