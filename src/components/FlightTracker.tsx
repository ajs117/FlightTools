import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Tooltip } from 'react-leaflet';
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

interface AllAircraftData {
  icao24: string;
  callsign?: string;
  latitude: number;
  longitude: number;
  altitude: number;
  direction: number;
  speed: number;
  isOnGround: boolean;
}

interface InterpolatedPosition {
  lat: number;
  lng: number;
  name: string;
  timestamp?: number;
}

interface CachedFlightData {
  data: any;
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
  const timeDiff = (now - (startPos.timestamp ?? now)) / 1000; // Convert to seconds
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
    timestamp: now,
    name: startPos.name // Add the required 'name' property from the input position
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

// Component to track map bounds
const BoundsTracker = ({ setBounds }: { setBounds: React.Dispatch<React.SetStateAction<L.LatLngBounds | null>> }) => {
  const map = useMap();
  
  useEffect(() => {
    // Set initial bounds
    setBounds(map.getBounds());
  }, [map, setBounds]);
  
  // Update bounds when map moves
  useMapEvents({
    moveend: () => {
      setBounds(map.getBounds());
    },
    zoomend: () => {
      setBounds(map.getBounds());
    }
  });
  
  return null;
};

const FlightTracker: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [location, setLocation] = useState<Location | null>(null);
  const [aircraftPosition, setAircraftPosition] = useState<Location | null>(null);
  const [allAircraft, setAllAircraft] = useState<AllAircraftData[]>([]);
  const [visibleAircraft, setVisibleAircraft] = useState<AllAircraftData[]>([]);
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds | null>(null);
  const [trackingAllAircraft, setTrackingAllAircraft] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [displayedDistance, setDisplayedDistance] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState(() => {
    const saved = localStorage.getItem('lastSearchQuery');
    return saved || '';
  });
  const [loading, setLoading] = useState(false);
  const [flightNumber, setFlightNumber] = useState(() => {
    const saved = localStorage.getItem('lastFlightNumber');
    return saved || '';
  });
  const [flightData, setFlightData] = useState<FlightData | null>(null);
  const [lastKnownPosition, setLastKnownPosition] = useState<InterpolatedPosition | null>(null);
  const [trackingInterval, setTrackingInterval] = useState<NodeJS.Timeout | null>(null);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [interpolationInterval, setInterpolationInterval] = useState<NodeJS.Timeout | null>(null);
  const [distanceUpdateInterval, setDistanceUpdateInterval] = useState<NodeJS.Timeout | null>(null);
  const [distanceInterpolationInterval, setDistanceInterpolationInterval] = useState<NodeJS.Timeout | null>(null);
  const [lastDrawTime, setLastDrawTime] = useState<Date | null>(null);
  const [lastApiCall, setLastApiCall] = useState<number | null>(null);

  // Auto-track flight and use saved location on mount
  useEffect(() => {
    // Load saved location if it exists
    const savedLocation = localStorage.getItem('lastLocation');
    if (savedLocation) {
      try {
        const parsedLocation = JSON.parse(savedLocation);
        setLocation(parsedLocation);
      } catch (e) {
        console.error('Error parsing saved location:', e);
      }
    }

    // Auto-track flight if flight number exists
    const savedFlightNumber = localStorage.getItem('lastFlightNumber');
    if (savedFlightNumber) {
      console.log('Auto-tracking saved flight:', savedFlightNumber);
      setFlightNumber(savedFlightNumber);
      // Use a setTimeout to ensure flightNumber state is set before tracking
      setTimeout(() => {
        trackFlight(false);
      }, 100);
    }
  }, []);  // Empty dependency array means this runs once on mount

  // Save search query to localStorage whenever it changes
  useEffect(() => {
    if (searchQuery) {
      localStorage.setItem('lastSearchQuery', searchQuery);
    } else {
      localStorage.removeItem('lastSearchQuery');
    }
  }, [searchQuery]);

  // Save flight number to localStorage whenever it changes
  useEffect(() => {
    if (flightNumber) {
      localStorage.setItem('lastFlightNumber', flightNumber);
    } else {
      localStorage.removeItem('lastFlightNumber');
    }
  }, [flightNumber]);

  // Save location to localStorage whenever it changes
  useEffect(() => {
    if (location) {
      localStorage.setItem('lastLocation', JSON.stringify(location));
    } else {
      localStorage.removeItem('lastLocation');
    }
  }, [location]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      console.log('Component unmounting, clearing all intervals.');
      if (trackingInterval) clearInterval(trackingInterval);
      if (autoRefreshIntervalRef.current) clearInterval(autoRefreshIntervalRef.current);
      if (interpolationInterval) clearInterval(interpolationInterval);
      if (distanceUpdateInterval) clearInterval(distanceUpdateInterval);
      if (distanceInterpolationInterval) clearInterval(distanceInterpolationInterval);
    };
  }, []); // Empty dependency array ensures this runs only on unmount

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
      
      // Update positions with a unique flight identifier
      newPos.name = `${flightData.flight.number}-${flightData.airline.name}`;
      
      // Set the new interpolated position
      setLastKnownPosition(newPos);
      setAircraftPosition({
        lat: newPos.lat,
        lng: newPos.lng,
        name: newPos.name
      });
      setLastDrawTime(new Date());
    } else {
      console.log('Cannot interpolate - missing flight data or last position');
    }
  }, [flightData, lastKnownPosition, setLastKnownPosition, setAircraftPosition, setLastDrawTime]);

  // Reset all tracking state and intervals
  const resetAllTrackingState = useCallback(() => {
    console.log('Completely resetting all tracking state');

    // Clear the auto-refresh interval using the ref
    if (autoRefreshIntervalRef.current) {
      console.log('Clearing auto-refresh interval during reset');
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }
    
    // Clear other intervals
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

    // Clear aircraft data
    setAircraftPosition(null);
    setAllAircraft([]);
    setTrackingAllAircraft(false);
    setFlightData(null);
    setLastKnownPosition(null);
    
    // Clear UI state
    setDistance(null);
    setDisplayedDistance(null);
    setLastApiCall(null);
    setLastDrawTime(null);
    
    // Clear session storage but NOT the flight number in localStorage
    sessionStorage.removeItem('lastApiCall');
    // Don't remove the flight number to keep it persisted
    // localStorage.removeItem('lastFlightNumber');
  }, [trackingInterval, interpolationInterval, distanceUpdateInterval, distanceInterpolationInterval]); // Include interval states if they are used in cleanup

  // Function to clear the auto-refresh interval specifically
  const clearAutoRefreshInterval = useCallback(() => {
    if (autoRefreshIntervalRef.current) {
      console.log('Clearing existing auto-refresh interval explicitly');
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }
  }, []);

  // Track flight
  const trackFlight = useCallback(async (forceRefresh: boolean = false) => {
    if (!flightNumber.trim()) {
      // Don't set error if just loading from storage initially
      if (forceRefresh) setError('Please enter a flight number');
      return;
    }

    // Store the flight number in localStorage immediately if not just a refresh
    if (!forceRefresh) {
        localStorage.setItem('lastFlightNumber', flightNumber);
    }

    // Reset state only when initiating a new track, not on auto-refresh
    if (!forceRefresh) {
      resetAllTrackingState();
    } else {
      // On auto-refresh, just clear the previous interval timer
      clearAutoRefreshInterval();
    }
    
    setLoading(true);
    // Clear error only when initiating, not necessarily on refresh
    if (!forceRefresh) setError('');

    try {
      console.log(`Fetching flight data for ${flightNumber} (Refresh: ${forceRefresh})`);
      const callsign = flightNumber.padEnd(8, ' ');
      const response = await fetch(
        `https://opensky-network.org/api/states/all?time=0&icao24=&callback=`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch flight data (${response.status})`);
      }

      const data = await response.json();
      
      if (!data.states || data.states.length === 0) {
        throw new Error('No state data received from API');
      }
      
      const flightState = data.states.find((state: any[]) => 
        state[1] && state[1].trim().includes(flightNumber.toUpperCase())
      );
      
      if (!flightState) {
        throw new Error('Flight not found in current tracking data');
      }
      
      // Extract information from the OpenSky state array
      const icao24 = flightState[0];
      const callsignFromApi = flightState[1]?.trim();
      const country = flightState[2];
      const longitude = flightState[5];
      const latitude = flightState[6]; 
      const altitude = flightState[7];
      const isOnGround = flightState[8];
      const velocity = flightState[9]; // m/s
      const heading = flightState[10];
      const verticalRate = flightState[11];
      
      // Convert velocity from m/s to km/h
      const speedKmh = velocity ? velocity * 3.6 : 0;
      
      // Create our flight data object
      const flight: FlightData = {
        flight: {
          number: flightNumber,
          iata: flightNumber
        },
        departure: {
          airport: 'N/A', // OpenSky doesn't provide this information
          timezone: ''
        },
        arrival: {
          airport: 'N/A', // OpenSky doesn't provide this information  
          timezone: ''
        },
        airline: {
          name: callsignFromApi || flightNumber // Use callsign as airline+flight if available
        },
        live: {
          latitude: latitude,
          longitude: longitude,
          altitude: altitude || 0,
          direction: heading || 0,
          speed_horizontal: speedKmh,
          speed_vertical: verticalRate || 0,
          is_ground: Boolean(isOnGround),
          updated: new Date().toISOString()
        }
      };

      const apiTimestamp = Date.now();
      setLastApiCall(apiTimestamp);
      sessionStorage.setItem('lastApiCall', apiTimestamp.toString());
      
      // Only update state after we have all the data to prevent flashing
      setFlightData(flight);
      
      // Create position object
      const newPosition = {
        lat: flight.live.latitude,
        lng: flight.live.longitude,
        name: `${flight.airline.name} ${flight.flight.number}`,
        timestamp: apiTimestamp
      };
      
      // Set last known position for interpolation
      setLastKnownPosition(newPosition); 
      
      // Set aircraft position for display
      setAircraftPosition({
        lat: newPosition.lat,
        lng: newPosition.lng,
        name: newPosition.name
      });

      // Set up the NEXT auto-refresh interval
      console.log('Setting up next auto-refresh for flight data');
      autoRefreshIntervalRef.current = setInterval(() => {
        console.log(`Auto-refresh triggered for flight ${flightNumber} at ${new Date().toLocaleTimeString()}`);
        trackFlight(true); // Force refresh from API
      }, 60000); // Refresh every 60 seconds (1 minute)
      
    } catch (err) {
      console.error('Error during trackFlight:', err); // Log the actual error
      setError('Error tracking flight: ' + (err instanceof Error ? err.message : 'Unknown error'));
      // Stop refreshing on error by clearing the interval IF it exists
      clearAutoRefreshInterval(); 
      // Optionally reset state fully on error? Decided against for now to show last known good state.
      // resetAllTrackingState(); 
    } finally {
      setLoading(false);
    }
  }, [flightNumber, resetAllTrackingState, clearAutoRefreshInterval]);

  // Get all aircraft
  const getAllAircraft = useCallback(async (isAutoRefresh: boolean = false) => {
    // Reset state only when initiating, not on auto-refresh
    if (!isAutoRefresh) {
      resetAllTrackingState();
    } else {
      // On auto-refresh, just clear the previous interval timer
      clearAutoRefreshInterval();
    }
    
    setLoading(true);
    // Clear error only when initiating
    if (!isAutoRefresh) setError('');
  
    try {
      console.log(`Fetching all aircraft data (Refresh: ${isAutoRefresh})`);
      setTrackingAllAircraft(true);

      const response = await fetch(
        `https://opensky-network.org/api/states/all?time=0&callback=`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch aircraft data (${response.status})`);
      }

      const data = await response.json();
      
      if (!data.states || data.states.length === 0) {
        // Not necessarily an error, could be no aircraft transmitting
        console.log('No aircraft state data received from API.');
        setAllAircraft([]); 
      } else {
          // Process aircraft data
          const aircraftData: AllAircraftData[] = data.states
          .filter((state: any[]) => 
            state[5] && state[6] && 
            !isNaN(state[5]) && !isNaN(state[6]) &&
            !state[8] // Filter out on-ground
          )
          .map((state: any[]) => ({
            icao24: state[0],
            callsign: state[1]?.trim(),
            latitude: state[6],
            longitude: state[5],
            altitude: state[7] || 0,
            direction: state[10] || 0,
            speed: state[9] ? state[9] * 3.6 : 0,
            isOnGround: Boolean(state[8])
          }));
          setAllAircraft(aircraftData);
          // Center map if it's the initial load
          if (!isAutoRefresh && aircraftData.length > 0) {
            const centralAircraft = aircraftData[Math.floor(aircraftData.length / 2)];
            setLocation({
              lat: centralAircraft.latitude,
              lng: centralAircraft.longitude,
              name: 'Map Center'
            });
          }
      }
      
      const apiTimestamp = Date.now();
      setLastApiCall(apiTimestamp);
      sessionStorage.setItem('lastApiCall', apiTimestamp.toString());
      setError(''); // Clear error on successful fetch

      // Set up the NEXT auto-refresh interval
      console.log('Setting up next auto-refresh for all aircraft data');
      autoRefreshIntervalRef.current = setInterval(() => {
        console.log(`Auto-refresh triggered for all aircraft at ${new Date().toLocaleTimeString()}`);
        getAllAircraft(true); // Auto refresh
      }, 60000); // Refresh every 60 seconds (1 minute)
      
    } catch (err) {
      console.error('Error during getAllAircraft:', err); // Log the actual error
      setError('Error fetching aircraft: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setTrackingAllAircraft(false); // Stop tracking all mode on error
      // Stop refreshing on error by clearing the interval
      clearAutoRefreshInterval();
      // Optionally reset state fully on error?
      // resetAllTrackingState(); 
    } finally {
      setLoading(false);
    }
  }, [resetAllTrackingState, clearAutoRefreshInterval]);

  // Clear stored location and stop tracking
  const clearLocation = () => {
    // Reset map view
    setLocation(null);
    
    // Reset input fields
    setSearchQuery('');
    setError('');
    setFlightNumber('');
    
    // Reset all tracking state (this will also clear intervals)
    resetAllTrackingState();
    
    // Clear localStorage
    localStorage.removeItem('lastLocation');
    localStorage.removeItem('lastSearchQuery');
    localStorage.removeItem('lastFlightNumber');
  };

  // Force refresh flight data from API
  const handleRefreshClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (trackingAllAircraft) {
      getAllAircraft(false);
    } else {
      trackFlight(true);
    }
  };

  const interpolatePosition = (startPos: InterpolatedPosition, endPos: InterpolatedPosition, progress: number): InterpolatedPosition => {
    const startTime = startPos.timestamp || 0;
    const endTime = endPos.timestamp || 1;
    const currentTime = startTime + (endTime - startTime) * progress;
    
    return {
      lat: startPos.lat + (endPos.lat - startPos.lat) * progress,
      lng: startPos.lng + (endPos.lng - startPos.lng) * progress,
      name: `${startPos.name} → ${endPos.name}`,
      timestamp: currentTime
    };
  };

  const updateAircraftPosition = (progress: number) => {
    if (lastKnownPosition && aircraftPosition) {
      const interpolated = interpolatePosition(
        {
          ...lastKnownPosition,
          name: lastKnownPosition.name || 'Unknown Location'
        },
        {
          ...aircraftPosition,
          name: aircraftPosition.name || 'Unknown Location'
        },
        progress
      );
      setAircraftPosition(interpolated);
    }
  };

  const handleLocationUpdate = (location: Location) => {
    const position: InterpolatedPosition = {
      lat: location.lat,
      lng: location.lng,
      name: location.name || 'Unknown Location',
      timestamp: Date.now()
    };
    setLastKnownPosition(position);
    setAircraftPosition(position);
  };

  // Initialize map interpolation if cached data is loaded
  useEffect(() => {
    // Clear any existing interval first
    if (interpolationInterval) {
      console.log('Clearing existing interpolation interval');
      clearInterval(interpolationInterval);
      setInterpolationInterval(null);
    }
    
    // Only set up new interpolation if we have valid flight data and not tracking all aircraft
    if (flightData && lastKnownPosition && !trackingAllAircraft) {
      console.log('Initializing interpolation from fresh data');
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
  }, [flightData, lastKnownPosition, trackingAllAircraft, updateInterpolatedPosition]);

  // Update visible aircraft when all aircraft or map bounds change
  useEffect(() => {
    if (trackingAllAircraft && mapBounds && allAircraft.length > 0) {
      // Filter aircraft to only those within the current map bounds
      const inBoundsAircraft = allAircraft.filter(aircraft => 
        mapBounds.contains(L.latLng(aircraft.latitude, aircraft.longitude))
      );
      setVisibleAircraft(inBoundsAircraft);
      console.log(`Filtered aircraft from ${allAircraft.length} to ${inBoundsAircraft.length} visible`);
    } else {
      setVisibleAircraft(allAircraft);
    }
  }, [allAircraft, mapBounds, trackingAllAircraft]);
  
  return (
    <div className={`${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} p-2 sm:p-4`}>
      <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-3 sm:p-6 max-w-7xl mx-auto`}>
        <div className="mb-2 sm:mb-4 space-y-2 sm:space-y-4">
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-4">
            <div className="w-full sm:flex-1 sm:min-w-[200px] flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchLocation()}
                hidden={location !== null}
                placeholder="Enter location (e.g., London, UK)"
                className={`flex-1 p-2 text-sm sm:text-base border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'
                }`}
              />
              <button
                onClick={searchLocation}
                disabled={loading || !searchQuery.trim()}
                hidden={location !== null}
                className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 whitespace-nowrap"
              >
                Search
              </button>
              <button
                onClick={getCurrentLocation}
                disabled={loading}
                hidden={location !== null}
                className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300 whitespace-nowrap"
              >
                <span role="img" aria-label="GPS" className="text-lg">
                  📍
                </span>
              </button>
            </div>
            <div className="w-full sm:flex-1 sm:min-w-[200px] flex gap-2">
              <input
                type="text"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && trackFlight()}
                placeholder="Enter flight number (e.g., BA123)"
                disabled={trackingAllAircraft}
                className={`flex-1 p-2 text-sm sm:text-base border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'
                } ${trackingAllAircraft ? 'opacity-50' : ''}`}
              />
              <button
                onClick={(e) => trackFlight()}
                disabled={loading || !flightNumber.trim() || trackingAllAircraft}
                className={`px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-300 whitespace-nowrap ${
                  trackingAllAircraft ? 'opacity-50' : ''
                }`}
              >
                Track
              </button>
              <button
                onClick={(e) => getAllAircraft(false)}
                disabled={loading || trackingAllAircraft}
                className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-green-300 whitespace-nowrap"
              >
                All Aircraft
              </button>
            </div>
            <div className="flex gap-2">
              {(location || trackingAllAircraft) && (
                <button
                  onClick={clearLocation}
                  disabled={loading}
                  className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-red-300 whitespace-nowrap"
                >
                  Clear
                </button>
              )}
              {(flightData || trackingAllAircraft) && (
                <button
                  onClick={handleRefreshClick}
                  className="px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap"
                >
                  Refresh
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className={`p-2 sm:p-3 rounded text-xs sm:text-sm ${
              isDarkMode ? 'bg-red-900 text-red-100' : 'bg-red-100 text-red-700'
            }`}>
              {error}
            </div>
          )}
          
          {flightData && (
            <div className={`p-2 sm:p-4 rounded ${
              isDarkMode ? 'bg-blue-900 text-blue-100' : 'bg-blue-100 text-blue-700'
            }`}>
              <div className="flex justify-between items-center mb-2 sm:mb-3">
                <div className="font-medium text-base sm:text-lg">
                 {flightData.flight.number}
                </div>
              </div>
              {displayedDistance !== null && (
                <div className="text-center">
                  <div className={`text-xs sm:text-sm font-medium mb-1 ${
                    isDarkMode ? 'text-blue-200' : 'text-blue-800'
                  }`}>
                    Distance to Aircraft
                  </div>
                  <div className="font-mono text-lg sm:text-2xl font-bold">
                    {Math.round(displayedDistance).toLocaleString()}m
                  </div>
                </div>
              )}

              <div className="space-y-2 sm:space-y-3">
                {flightData.live && (
                  <div className="grid grid-cols-2 gap-2 sm:gap-4 mt-1 sm:mt-2">
                    <div>
                      <div className={`text-xs sm:text-sm font-medium text-center ${
                        isDarkMode ? 'text-blue-200' : 'text-blue-800'
                      }`}>
                        Altitude
                      </div>
                      <div className="text-sm sm:text-base text-center">{metersToFeet(flightData.live.altitude)}ft</div>
                    </div>
                    <div>
                      <div className={`text-xs sm:text-sm font-medium text-center ${
                        isDarkMode ? 'text-blue-200' : 'text-blue-800'
                      }`}>
                        Speed
                      </div>
                      <div className="text-sm sm:text-base text-center">{kmhToKnots(flightData.live.speed_horizontal)}kts</div>
                    </div>
                    <div>
                      <div className={`text-xs sm:text-sm font-medium text-center ${
                        isDarkMode ? 'text-blue-200' : 'text-blue-800'
                      }`}>
                        Direction
                      </div>
                      <div className="text-sm sm:text-base text-center">{flightData.live.direction}°</div>
                    </div>
                    <div>
                      <div className={`text-xs sm:text-sm font-medium text-center ${
                        isDarkMode ? 'text-blue-200' : 'text-blue-800'
                      }`}>
                        Status
                      </div>
                      <div className="text-sm sm:text-base text-center">{flightData.live.is_ground ? 'On Ground' : 'In Air'}</div>
                    </div>
                  </div>
                )}

                {lastApiCall && (
                  <div className={`text-[10px] sm:text-xs mt-1 sm:mt-2 text-center ${
                    isDarkMode ? 'text-blue-300' : 'text-blue-600'
                  }`}>
                    Using API data from {new Date(lastApiCall).toLocaleString()}
                    <br />
                    <span className="italic">Auto-refreshes every minute, this use a lot of data so recommend using this feature with wifi only</span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {trackingAllAircraft && (
            <div className={`p-2 sm:p-4 rounded ${
              isDarkMode ? 'bg-green-900 text-green-100' : 'bg-green-100 text-green-700'
            }`}>
              <div className="flex justify-between items-center mb-1 sm:mb-3">
                <div className="font-medium text-base sm:text-lg">
                  All Aircraft
                </div>
                <div className="text-xs sm:text-sm font-mono">
                  {visibleAircraft.length} visible / {allAircraft.length} total
                </div>
              </div>
              <div className={`text-[10px] sm:text-xs mt-1 sm:mt-2 text-center ${
                isDarkMode ? 'text-green-300' : 'text-green-600'
              }`}>
                Using API data from {lastApiCall ? new Date(lastApiCall).toLocaleString() : "N/A"}
                <br />
                <span className="italic">Auto-refreshes every minute, this use a lot of data so recommend using this feature with wifi only</span>
              </div>
            </div>
          )}
        </div>

        <div className={`h-[50vh] sm:h-[60vh] md:h-[600px] rounded border ${
          isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
        }`}>
          <MapContainer
            style={{ height: '100%', width: '100%' }}
            center={location ? [location.lat, location.lng] : aircraftPosition ? [aircraftPosition.lat, aircraftPosition.lng] : [51.505, -0.09]}
            zoom={location && !trackingAllAircraft ? 13 : aircraftPosition ? 10 : 6}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={isDarkMode 
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              }
            />
            <BoundsTracker setBounds={setMapBounds} />
            {location && (
              <Marker 
                position={[location.lat, location.lng]} 
              />
            )}
            {aircraftPosition && flightData && !trackingAllAircraft && (
              <>
                <Marker 
                  key={`${flightData.flight.number}-${aircraftPosition.lat.toFixed(6)}-${aircraftPosition.lng.toFixed(6)}-${flightData.live.direction || 0}-${Date.now()}`}
                  position={[aircraftPosition.lat, aircraftPosition.lng]} 
                  icon={L.divIcon({
                    html: `<div style="transform: rotate(${flightData.live.direction || 0}deg)">
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
            {trackingAllAircraft && visibleAircraft.length > 0 && visibleAircraft.map(aircraft => (
              <Marker 
                key={`${aircraft.icao24}-${aircraft.latitude.toFixed(6)}-${aircraft.longitude.toFixed(6)}`}
                position={[aircraft.latitude, aircraft.longitude]} 
                icon={L.divIcon({
                  html: `<div style="transform: rotate(${aircraft.direction}deg)">
                    <img src="${planeIcon}" alt="plane" style="width: 16px; height: 16px;" />
                  </div>`,
                  className: '',
                  iconSize: [16, 16],
                  iconAnchor: [8, 8]
                })}
              >
                <Tooltip direction="top" offset={[0, -5]} opacity={0.9} className={`${
                  isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
                }`}>
                  <div className="text-xs font-medium min-w-[150px] text-center mb-1">
                    {aircraft.callsign || 'N/A'}
                  </div>
                  <div className="text-[10px] grid grid-cols-2 gap-x-3 gap-y-1 min-w-[150px]">
                    <span>Altitude:</span>
                    <span className="font-mono text-right">{metersToFeet(aircraft.altitude)}ft</span>
                    <span>Speed:</span>
                    <span className="font-mono text-right">{kmhToKnots(aircraft.speed)}kts</span>
                    <span>Direction:</span>
                    <span className="font-mono text-right">{Math.round(aircraft.direction)}°</span>
                  </div>
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  );
};

export default FlightTracker; 