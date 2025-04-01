import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import planeIcon from '../plane-icon.svg';
import { useTheme } from '../context/ThemeContext';

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

interface Location {
  lat: number;
  lng: number;
  name?: string;
}

interface FlightData {
  flight: {
    number: string;
    iata: string;
  };
  departure: {
    airport: string;
    timezone: string;
  };
  arrival: {
    airport: string;
    timezone: string;
  };
  airline: {
    name: string;
  };
  live: {
    latitude: number;
    longitude: number;
    altitude: number;
    direction: number;
    speed_horizontal: number;
    speed_vertical: number;
    is_ground: boolean;
    updated: string;
  };
}

interface InterpolatedPosition {
  lat: number;
  lng: number;
  timestamp: number;
}

// Conversion functions
const metersToFeet = (meters: number): number => {
  return Math.round(meters * 3.28084);
};

const kmhToKnots = (kmh: number): number => {
  return Math.round(kmh * 0.539957);
};

// Calculate interpolated position based on speed and heading
const calculateInterpolatedPosition = (startPos: InterpolatedPosition, speed: number, heading: number): InterpolatedPosition => {
  const now = Date.now();
  const timeDiff = (now - startPos.timestamp) / 1000; // Convert to seconds
  const distance = (speed * timeDiff) / 3600; // Convert km/h to km

  // Convert heading to radians
  const headingRad = (heading * Math.PI) / 180;
  
  // Calculate new position using great circle formula
  const lat1 = startPos.lat * Math.PI / 180;
  const lon1 = startPos.lng * Math.PI / 180;
  const d = distance / 6371; // Earth's radius in km

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(headingRad)
  );

  const lon2 = lon1 + Math.atan2(
    Math.sin(headingRad) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: lat2 * 180 / Math.PI,
    lng: lon2 * 180 / Math.PI,
    timestamp: now
  };
};

// Calculate distance between two points using Haversine formula
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // Distance in meters
};

// Component to handle map updates
const MapUpdater = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  
  return null;
};

export const FlightTracker: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [location, setLocation] = useState<Location | null>(() => {
    const savedLocation = localStorage.getItem('lastLocation');
    return savedLocation ? JSON.parse(savedLocation) : null;
  });
  const [aircraftPosition, setAircraftPosition] = useState<Location | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [displayedDistance, setDisplayedDistance] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [flightNumber, setFlightNumber] = useState('');
  const [flightData, setFlightData] = useState<FlightData | null>(() => {
    const cachedData = localStorage.getItem('cachedFlightData');
    if (cachedData) {
      const { data, timestamp, flightNum } = JSON.parse(cachedData);
      // Check if the data is less than 24 hours old
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        setFlightNumber(flightNum);
        return data;
      } else {
        localStorage.removeItem('cachedFlightData');
      }
    }
    return null;
  });
  const [lastKnownPosition, setLastKnownPosition] = useState<InterpolatedPosition | null>(() => {
    const cachedPosition = localStorage.getItem('cachedPosition');
    return cachedPosition ? JSON.parse(cachedPosition) : null;
  });
  const [trackingInterval, setTrackingInterval] = useState<NodeJS.Timeout | null>(null);
  const [interpolationInterval, setInterpolationInterval] = useState<NodeJS.Timeout | null>(null);
  const [distanceUpdateInterval, setDistanceUpdateInterval] = useState<NodeJS.Timeout | null>(null);
  const [distanceInterpolationInterval, setDistanceInterpolationInterval] = useState<NodeJS.Timeout | null>(null);
  const [lastDrawTime, setLastDrawTime] = useState<Date | null>(() => {
    const cachedTime = localStorage.getItem('cachedLastDrawTime');
    return cachedTime ? new Date(JSON.parse(cachedTime)) : null;
  });
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(() => {
    const cachedData = localStorage.getItem('cachedFlightData');
    if (cachedData) {
      const { timestamp } = JSON.parse(cachedData);
      return timestamp;
    }
    return null;
  });

  // Save location to localStorage whenever it changes
  useEffect(() => {
    if (location) {
      localStorage.setItem('lastLocation', JSON.stringify(location));
    } else {
      localStorage.removeItem('lastLocation');
    }
  }, [location]);

  // Save flight data to localStorage whenever it changes
  useEffect(() => {
    if (flightData && flightNumber) {
      const timestamp = Date.now();
      setCacheTimestamp(timestamp);
      localStorage.setItem('cachedFlightData', JSON.stringify({
        data: flightData,
        timestamp,
        flightNum: flightNumber
      }));
    } else {
      setCacheTimestamp(null);
      localStorage.removeItem('cachedFlightData');
    }
  }, [flightData, flightNumber]);

  // Save lastKnownPosition to localStorage whenever it changes
  useEffect(() => {
    if (lastKnownPosition) {
      localStorage.setItem('cachedPosition', JSON.stringify(lastKnownPosition));
    } else {
      localStorage.removeItem('cachedPosition');
    }
  }, [lastKnownPosition]);

  // Save lastDrawTime to localStorage whenever it changes
  useEffect(() => {
    if (lastDrawTime) {
      localStorage.setItem('cachedLastDrawTime', JSON.stringify(lastDrawTime.toISOString()));
    } else {
      localStorage.removeItem('cachedLastDrawTime');
    }
  }, [lastDrawTime]);

  // Cleanup tracking interval on unmount
  useEffect(() => {
    return () => {
      if (trackingInterval) {
        clearInterval(trackingInterval);
      }
      if (interpolationInterval) {
        clearInterval(interpolationInterval);
      }
      if (distanceUpdateInterval) {
        clearInterval(distanceUpdateInterval);
      }
      if (distanceInterpolationInterval) {
        clearInterval(distanceInterpolationInterval);
      }
    };
  }, [trackingInterval, interpolationInterval, distanceUpdateInterval, distanceInterpolationInterval]);

  // Update distance when location or aircraft position changes
  useEffect(() => {
    if (location && aircraftPosition) {
      const newDistance = calculateDistance(
        location.lat,
        location.lng,
        aircraftPosition.lat,
        aircraftPosition.lng
      );
      setDistance(newDistance);
      setDisplayedDistance(newDistance); // Set initial value immediately

      // Clear existing intervals
      if (distanceUpdateInterval) {
        clearInterval(distanceUpdateInterval);
      }
      if (distanceInterpolationInterval) {
        clearInterval(distanceInterpolationInterval);
      }

      // Set up new interval for distance updates
      const interval = setInterval(() => {
        if (location && aircraftPosition) {
          const currentDistance = calculateDistance(
            location.lat,
            location.lng,
            aircraftPosition.lat,
            aircraftPosition.lng
          );
          setDistance(currentDistance);
        }
      }, 25); // Update every 100ms for smooth display

      setDistanceUpdateInterval(interval);

      // Set up separate interval for position interpolation for distance calculation
      if (flightData?.live && lastKnownPosition) {
        const distanceInterpolation = setInterval(() => {
          if (flightData.live && lastKnownPosition && !flightData.live.is_ground && flightData.live.speed_horizontal >= 50) {
            const newPos = calculateInterpolatedPosition(
              lastKnownPosition,
              flightData.live.speed_horizontal,
              flightData.live.direction
            );
            setAircraftPosition({
              lat: newPos.lat,
              lng: newPos.lng,
              name: `${flightData.airline.name} ${flightData.flight.number}`
            });
          }
        }, 100); // Update every 100ms for smooth distance calculation

        setDistanceInterpolationInterval(distanceInterpolation);
      }
    } else {
      setDistance(null);
      setDisplayedDistance(null);
      if (distanceUpdateInterval) {
        clearInterval(distanceUpdateInterval);
        setDistanceUpdateInterval(null);
      }
      if (distanceInterpolationInterval) {
        clearInterval(distanceInterpolationInterval);
        setDistanceInterpolationInterval(null);
      }
    }
  }, [location, aircraftPosition, flightData, lastKnownPosition, calculateInterpolatedPosition]);

  // Animate distance display
  useEffect(() => {
    if (distance === null || displayedDistance === null) {
      setDisplayedDistance(distance);
      return;
    }

    const diff = distance - displayedDistance;
    if (Math.abs(diff) < 1) {
      setDisplayedDistance(distance);
      return;
    }

    const step = Math.sign(diff) * Math.min(Math.abs(diff), Math.max(1, Math.abs(diff) / 5));
    const timer = setTimeout(() => {
      setDisplayedDistance(prev => prev !== null ? prev + step : null);
    }, 16); // ~60fps

    return () => clearTimeout(timer);
  }, [distance, displayedDistance]);

  // Get current location
  const getCurrentLocation = () => {
    setLoading(true);
    setError('');
    
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          name: 'Current Location'
        };
        setLocation(newLocation);
        setAircraftPosition(null); // Clear aircraft position when getting current location
        setLoading(false);
      },
      (error) => {
        setError('Error getting location: ' + error.message);
        setLoading(false);
      }
    );
  };

  // Search for location
  const searchLocation = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
      );
      
      if (!response.ok) throw new Error('Failed to fetch location');
      
      const data = await response.json();
      if (data.length === 0) {
        setError('Location not found');
        setLoading(false);
        return;
      }
      
      const newLocation = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        name: data[0].display_name
      };
      setLocation(newLocation);
      setAircraftPosition(null); // Clear aircraft position when searching for location
    } catch (err) {
      setError('Error searching location: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Update interpolated position for map display
  const updateInterpolatedPosition = useCallback(() => {
    if (flightData?.live && lastKnownPosition) {
      // Don't interpolate if on ground or if speed is too low
      if (flightData.live.is_ground || flightData.live.speed_horizontal < 50) {
        console.log('Not interpolating - aircraft on ground or speed too low');
        setLastDrawTime(new Date()); // Still update the timestamp to show it's trying
        return;
      }

      console.log('Calculating new position...');
      const newPos = calculateInterpolatedPosition(
        lastKnownPosition,
        flightData.live.speed_horizontal,
        flightData.live.direction
      );
      
      console.log(`New position: ${newPos.lat}, ${newPos.lng}`);
      setLastKnownPosition(newPos);
      setAircraftPosition({
        lat: newPos.lat,
        lng: newPos.lng,
        name: `${flightData.airline.name} ${flightData.flight.number}`
      });
      setLastDrawTime(new Date());
    } else {
      console.log('Cannot interpolate - missing flight data or last position');
    }
  }, [flightData, lastKnownPosition, setLastKnownPosition, setAircraftPosition, setLastDrawTime]);

  // Initialize map interpolation if cached data is loaded
  useEffect(() => {
    if (flightData && lastKnownPosition && !interpolationInterval) {
      console.log('Initializing interpolation from cached data');
      // Use immediate call for testing and then set interval
      updateInterpolatedPosition(); // Initial call
      const interpolation = setInterval(() => {
        console.log('Interpolation interval triggered');
        updateInterpolatedPosition();
      }, 5000); // Update position every 5 seconds
      
      setInterpolationInterval(interpolation);
    }

    // Clean up interval when component unmounts
    return () => {
      if (interpolationInterval) {
        clearInterval(interpolationInterval);
      }
    };
  }, [flightData, lastKnownPosition, interpolationInterval, updateInterpolatedPosition]);

  // Track flight
  const trackFlight = async () => {
    if (!flightNumber.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      console.log('Tracking flight:', flightNumber);
      const response = await fetch(
        `https://api.aviationstack.com/v1/flights?access_key=0568428049f1cef2ccb5aef37792e31f&flight_iata=${flightNumber}`
      );
      
      if (!response.ok) throw new Error('Failed to fetch flight data');
      
      const data = await response.json();
      if (!data.data || data.data.length === 0) {
        setError('Flight not found');
        setLoading(false);
        return;
      }

      const flight = data.data[0];
      setFlightData(flight);
      
      // Update location with flight position
      if (flight.live) {
        const newPosition = {
          lat: flight.live.latitude,
          lng: flight.live.longitude,
          timestamp: Date.now()
        };
        setLastKnownPosition(newPosition);
        setAircraftPosition({
          lat: flight.live.latitude,
          lng: flight.live.longitude,
          name: `${flight.airline.name} ${flight.flight.number}`
        });
        setLastDrawTime(new Date()); // Set initial draw time
      }

      // Clear existing intervals
      if (trackingInterval) {
        clearInterval(trackingInterval);
      }
      if (interpolationInterval) {
        clearInterval(interpolationInterval);
      }
      
      // Set up intervals
      const tracking = setInterval(trackFlight, 3600000); // Update API every hour
      
      // Use immediate call for testing and then set interval
      console.log('Setting up interpolation interval...');
      updateInterpolatedPosition(); // Initial call
      const interpolation = setInterval(() => {
        console.log('Interpolation interval triggered');
        updateInterpolatedPosition();
      }, 5000); // Update position every 5 seconds
      
      setTrackingInterval(tracking);
      setInterpolationInterval(interpolation);
    } catch (err) {
      setError('Error tracking flight: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Clear stored location
  const clearLocation = () => {
    setLocation(null);
    setAircraftPosition(null);
    setSearchQuery('');
    setError('');
    setFlightNumber('');
    setFlightData(null);
    setLastKnownPosition(null);
    if (trackingInterval) {
      clearInterval(trackingInterval);
      setTrackingInterval(null);
    }
    if (interpolationInterval) {
      clearInterval(interpolationInterval);
      setInterpolationInterval(null);
    }
    if (distanceUpdateInterval) {
      clearInterval(distanceUpdateInterval);
      setDistanceUpdateInterval(null);
    }
    if (distanceInterpolationInterval) {
      clearInterval(distanceInterpolationInterval);
      setDistanceInterpolationInterval(null);
    }
  };

  // Force refresh flight data from API
  const refreshFlightData = () => {
    if (flightNumber) {
      trackFlight();
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} p-4`}>
      <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6 max-w-7xl mx-auto`}>
        <div className="mb-4 space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px] flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchLocation()}
                hidden={location !== null}
                placeholder="Enter location (e.g., London, UK)"
                className={`flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'
                }`}
              />
              <button
                onClick={searchLocation}
                disabled={loading || !searchQuery.trim()}
                hidden={location !== null}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 whitespace-nowrap"
              >
                Search
              </button>
            </div>
            <div className="flex-1 min-w-[200px] flex gap-2">
              <input
                type="text"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && trackFlight()}
                placeholder="Enter flight number (e.g., BA123)"
                className={`flex-1 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'
                }`}
              />
              <button
                onClick={trackFlight}
                disabled={loading || !flightNumber.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-300 whitespace-nowrap"
              >
                Track Flight
              </button>
            </div>
            <div className="flex gap-2">
              {location && (
                <button
                  onClick={clearLocation}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-red-300 whitespace-nowrap"
                >
                  Clear Location
                </button>
              )}
              {flightData && (
                <button
                  onClick={refreshFlightData}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap"
                >
                  Refresh
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className={`p-3 rounded ${
              isDarkMode ? 'bg-red-900 text-red-100' : 'bg-red-100 text-red-700'
            }`}>
              {error}
            </div>
          )}
          
          {flightData && (
            <div className={`p-4 rounded ${
              isDarkMode ? 'bg-blue-900 text-blue-100' : 'bg-blue-100 text-blue-700'
            }`}>
              <div className="flex justify-between items-center mb-3">
                <div className="font-medium text-lg">
                  {flightData.airline.name} {flightData.flight.number}
                </div>
              </div>
              {displayedDistance !== null && (
                <div className="text-center">
                  <div className={`text-sm font-medium mb-1 ${
                    isDarkMode ? 'text-blue-200' : 'text-blue-800'
                  }`}>
                    Distance to Aircraft
                  </div>
                  <div className="font-mono text-2xl font-bold">
                    {Math.round(displayedDistance).toLocaleString()}m
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className={`text-sm font-medium text-center ${
                      isDarkMode ? 'text-blue-200' : 'text-blue-800'
                    }`}>
                      From
                    </div>
                    <div className="text-base text-center">{flightData.departure.airport}</div>
                  </div>
                  <div>
                    <div className={`text-sm font-medium text-center ${
                      isDarkMode ? 'text-blue-200' : 'text-blue-800'
                    }`}>
                      To
                    </div>
                    <div className="text-base text-center">{flightData.arrival.airport}</div>
                  </div>
                </div>

                {flightData.live && (
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <div className={`text-sm font-medium text-center ${
                        isDarkMode ? 'text-blue-200' : 'text-blue-800'
                      }`}>
                        Altitude
                      </div>
                      <div className="text-base text-center">{metersToFeet(flightData.live.altitude)}ft</div>
                    </div>
                    <div>
                      <div className={`text-sm font-medium text-center ${
                        isDarkMode ? 'text-blue-200' : 'text-blue-800'
                      }`}>
                        Speed
                      </div>
                      <div className="text-base text-center">{kmhToKnots(flightData.live.speed_horizontal)}kts</div>
                    </div>
                    <div>
                      <div className={`text-sm font-medium text-center ${
                        isDarkMode ? 'text-blue-200' : 'text-blue-800'
                      }`}>
                        Direction
                      </div>
                      <div className="text-base text-center">{flightData.live.direction}°</div>
                    </div>
                    <div>
                      <div className={`text-sm font-medium text-center ${
                        isDarkMode ? 'text-blue-200' : 'text-blue-800'
                      }`}>
                        Status
                      </div>
                      <div className="text-base text-center">{flightData.live.is_ground ? 'On Ground' : 'In Air'}</div>
                    </div>
                  </div>
                )}

                {cacheTimestamp && (
                  <div className={`text-xs mt-2 text-center ${
                    isDarkMode ? 'text-blue-300' : 'text-blue-600'
                  }`}>
                    Using cached data from {new Date(cacheTimestamp).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={`h-[600px] rounded border ${
          isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
        }`}>
          <MapContainer
            style={{ height: '100%', width: '100%' }}
            center={location ? [location.lat, location.lng] : [51.505, -0.09]}
            zoom={location ? 13 : 2}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={isDarkMode 
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              }
            />
            {location && (
              <Marker 
                position={[location.lat, location.lng]} 
              />
            )}
            {aircraftPosition && (
              <>
                <Marker 
                  key={`${aircraftPosition.lat.toFixed(6)}-${aircraftPosition.lng.toFixed(6)}-${flightData?.live?.direction || 0}-${lastDrawTime?.getTime() || 0}`}
                  position={[aircraftPosition.lat, aircraftPosition.lng]} 
                  icon={L.divIcon({
                    html: `<div style="transform: rotate(${flightData?.live?.direction || 0}deg)">
                      <img src="${planeIcon}" alt="plane" style="width: 24px; height: 24px;" />
                    </div>`,
                    className: '',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                  })}
                />
                <MapUpdater center={[aircraftPosition.lat, aircraftPosition.lng]} />
              </>
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}; 