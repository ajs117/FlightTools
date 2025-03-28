import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search, Loader } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import airportTimezone from 'airport-timezone';
import { Slider } from '@mui/material';
// @ts-ignore
import terminator from "@joergdietrich/leaflet.terminator";
const airportData = require('aircodes');

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

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
    
    const latLngs = waypoints.map(w => L.latLng(w.lat, w.lon));
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

const App = () => {
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

  const calculateDuration = useCallback((depTime: string, arrTime: string, depICAO: string, arrICAO: string): string => {
    const depAirport = getAirportTimezone(depICAO);
    const arrAirport = getAirportTimezone(arrICAO);

    if (!depAirport || !arrAirport) {
      return 'Unknown duration';
    }

    const depDate = new Date(depTime);
    const arrDate = new Date(arrTime);

    // Convert to UTC considering timezone offsets
    const depUTC = new Date(depDate.getTime() - (depAirport.offset.dst * 3600000));
    const arrUTC = new Date(arrDate.getTime() - (arrAirport.offset.dst * 3600000));

    const durationMs = arrUTC.getTime() - depUTC.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.round((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }, [getAirportTimezone]);

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
        planDetails.duration = calculateDuration(
          departureTime,
          arrivalTime,
          planDetails.fromICAO,
          planDetails.toICAO
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
    const [hours, minutes] = duration.split('h ').map(part => 
      parseInt(part.replace('m', ''))
    );
    const totalDurationMs = (hours * 3600000) + (minutes * 60000);
    const flightDurationMs = totalDurationMs - (taxiTime * 2);
    
    // Calculate the adjusted progress percentage for actual route position
    let adjustedPercentage = percentage;
    
    // Progress through different phases: initial taxi, flight, final taxi
    if (percentage <= 10) {
      // Initial 10% is taxi - position stays at first waypoint
      adjustedPercentage = 0;
    } else if (percentage >= 90) {
      // Final 10% is taxi - position stays at last waypoint
      adjustedPercentage = 100;
    } else {
      // Middle 80% is actual flight
      // Rescale from 10-90% range to 0-100% for position calculation
      adjustedPercentage = ((percentage - 10) / 80) * 100;
    }
    
    // Calculate position along route based on adjusted percentage
    const totalSegments = waypoints.length - 1;
    const segmentPercentage = (adjustedPercentage * totalSegments) / 100;
    const currentSegment = Math.floor(segmentPercentage);
    const segmentProgress = segmentPercentage - currentSegment;
  
    // Get the position
    let position;
    if (adjustedPercentage >= 100) {
      position = [waypoints[totalSegments].lat, waypoints[totalSegments].lon] as [number, number];
    } else if (adjustedPercentage <= 0) {
      position = [waypoints[0].lat, waypoints[0].lon] as [number, number];
    } else {
      const start = waypoints[currentSegment];
      const end = waypoints[currentSegment + 1];
      
      const lat = start.lat + (end.lat - start.lat) * segmentProgress;
      const lon = start.lon + (end.lon - start.lon) * segmentProgress;
      position = [lat, lon] as [number, number];
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
    const [hours, minutes] = plan.duration.split('h ').map(part => 
      parseInt(part.replace('m', ''))
    );
    
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
      plan.duration = calculateDuration(
        departureTime,
        arrivalTime,
        plan.fromICAO,
        plan.toICAO
      );
      calculateRoutePositions(plan, departureTime);
    }
  }, [departureTime, arrivalTime, flightPlans, calculateDuration, calculateRoutePositions]);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">Flight Tools</h1>
      
      <div className="bg-white rounded-lg shadow p-4 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Departure (ICAO/Name)
              </label>
              <input
                type="text"
                value={departure}
                onChange={(e) => setDeparture(e.target.value.toUpperCase())}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="EGLL"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Departure Time
              </label>
              <input
                type="datetime-local"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Arrival (ICAO/Name)
              </label>
              <input
                type="text"
                value={arrival}
                onChange={(e) => setArrival(e.target.value.toUpperCase())}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="KJFK"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Arrival Time
              </label>
              <input
                type="datetime-local"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        <button
          onClick={searchFlightPlans}
          disabled={loading || !departure || !arrival}
          className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:bg-blue-300 flex items-center justify-center gap-2"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {/* Map container */}
          <div className="h-[500px] bg-gray-50 rounded border">
            <MapContainer
              style={{ height: '100%', width: '100%' }}
              center={[51.505, -0.09]} // Default center (London)
              zoom={2}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <DayNightTerminator currentTime={routeProgress?.currentTime} />
              {flightPlans.map((plan) => (
                <React.Fragment key={plan.id}>
                  <Polyline
                    positions={plan.route.nodes.map(w => [w.lat, w.lon])}
                    color="black"
                  />
                  {routeProgress && (
                    <Marker
                      position={routeProgress.position}
                      icon={L.divIcon({
                        className: 'bg-blue-500 w-4 h-4 rounded-full border-2 border-white',
                        iconSize: [16, 16]
                      })}
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
          <div>
            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded mb-4">
                {error}
              </div>
            )}
            {flightPlans.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-3">Flight Plan Details</h2>
                <div className="space-y-3">
                  {flightPlans.map((plan) => (
                    <div key={plan.id} className="bg-gray-50 p-3 rounded border">
                      <div className="grid grid-cols-2 gap-4 mb-2">
                        <div>
                          <div className="font-medium">{plan.fromICAO} → {plan.toICAO}</div>
                          <div className="text-sm text-gray-600">{plan.fromName} → {plan.toName}</div>
                          {plan.duration && (
                            <div className="text-sm font-medium text-blue-600">
                              Duration: {plan.duration}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{Math.round(plan.distance)} nm</div>
                          {departureTime && (
                            <div className="text-sm text-gray-600">
                              Departure: {new Date(departureTime).toLocaleString()} - 
                              {getAirportTimezone(plan.fromICAO)?.timezone}
                            </div>
                          )}
                          {arrivalTime && (
                            <div className="text-sm text-gray-600">
                              Arrival: {new Date(arrivalTime).toLocaleString()} - 
                              {getAirportTimezone(plan.toICAO)?.timezone}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-600">
                            {routeProgress?.currentTime.toLocaleTimeString() || 'Route Progress'}
                          </span>
                          {routeProgress && (
                            <span className="text-sm font-medium">
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
                                transition: 'none'
                              },
                              '& .MuiSlider-track': {
                                transition: 'none'
                              }
                            }}
                          />
                          <div className="absolute w-full top-10">
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
                            <div className="text-sm text-gray-600 mt-10">
                            Current Position: {routeProgress.position[0].toFixed(2)}, {routeProgress.position[1].toFixed(2)}
                            <br />
                            Current Time (UTC): {(() => {
                              const depAirport = getAirportTimezone(flightPlans[0]?.fromICAO || '');
                              if (!depAirport) return routeProgress.currentTime.toLocaleString();
                              const utcTime = new Date(routeProgress.currentTime.getTime() - 
                              ((depAirport.offset.gmt + depAirport.offset.dst) * 3600000));
                              return utcTime.toLocaleString() + ' UTC';
                            })()}
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

export default App;