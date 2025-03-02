import React, { useState, useCallback, useEffect } from 'react';
import { Search, Loader } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import airportTimezone from 'airport-timezone';
import { Slider } from '@mui/material';
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

  const getAirportTimezone = (icao: string): AirportTimezone | null => {
    const airport = airportTimezone.filter((airport: AirportTimezone) => 
      airport.code === airportData.getAirportByIcao(icao).iata
    )[0];
    return airport || null;
  };

  const calculateDuration = (depTime: string, arrTime: string, depICAO: string, arrICAO: string): string => {
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
  };

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
    } catch (err) {
      setError('Error fetching flight plans: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Calculate map bounds based on waypoints
  const getBounds = (waypoints: Waypoint[]) => {
    if (!waypoints.length) return [[0, 0], [0, 0]];
    const lats = waypoints.map(w => w.lat);
    const lons = waypoints.map(w => w.lon);
    return [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)]
    ];
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
    const totalDurationMs = (hours * 3600000) + (minutes * 60000) + (taxiTime * 2);
    
    // Calculate current time based on percentage
    const startTime = new Date(depTime);
    const elapsedMs = (totalDurationMs * percentage) / 100;
    const currentTime = new Date(startTime.getTime() + elapsedMs);
  
    // Calculate position along route
    const totalSegments = waypoints.length - 1;
    const segmentPercentage = (percentage * totalSegments) / 100;
    const currentSegment = Math.floor(segmentPercentage);
    const segmentProgress = segmentPercentage - currentSegment;
  
    if (currentSegment >= totalSegments) {
      return {
        position: [waypoints[totalSegments].lat, waypoints[totalSegments].lon],
        currentTime,
        percentage
      };
    }
  
    const start = waypoints[currentSegment];
    const end = waypoints[currentSegment + 1];
    
    const lat = start.lat + (end.lat - start.lat) * segmentProgress;
    const lon = start.lon + (end.lon - start.lon) * segmentProgress;
  
    return {
      position: [lat, lon],
      currentTime,
      percentage
    };
  }, []);
  
  const handleSliderChange = useCallback((
    event: Event,
    value: number | number[],
    plan: FlightPlan
  ) => {
    if (!departureTime || !plan.duration) return;
    
    const percentage = typeof value === 'number' ? value : value[0];
    setSliderValue(percentage);
    
    const progress = calculateRoutePosition(
      plan.route.nodes,
      percentage,
      departureTime,
      plan.duration
    );
    setRouteProgress(progress);
  }, [departureTime, calculateRoutePosition]);

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
              center={[0, 0]}
              zoom={2}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
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
                      <Slider
                        value={sliderValue}
                        onChange={(e, value) => handleSliderChange(e, value, plan)}
                        aria-labelledby="route-progress-slider"
                      />
                      {routeProgress && (
                        <div className="text-sm text-gray-600">
                          Current Position: {routeProgress.position[0].toFixed(2)}, {routeProgress.position[1].toFixed(2)}<br />
                          Current Time: {routeProgress.currentTime.toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {flightPlans.map((plan) => (
          <div key={plan.id} className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Route Progress</span>
              {routeProgress && (
                <span className="text-sm font-medium">
                  {routeProgress.currentTime.toLocaleTimeString()}
                </span>
              )}
            </div>
            <Slider
              value={sliderValue}
              onChange={(e, value) => handleSliderChange(e, value, plan)}
              aria-labelledby="route-progress-slider"
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${value}%`}
              disabled={!departureTime || !plan.duration}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;