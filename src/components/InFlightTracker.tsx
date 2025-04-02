import React, { useEffect, useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { metersToFeet, kmhToKnots, mpsToKmh } from '../utils/conversions';
import { initializeLeaflet, getTileLayerUrl, createPlaneIcon } from '../utils/leafletHelpers';

// Initialize Leaflet once on import
initializeLeaflet();

interface FlightData {
  latitude: number | null;
  lnggitude: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  lastUpdate: Date;
  gpsAccuracy: number | null;
}

const InFlightTracker: React.FC = () => {
  const { isDarkMode } = useTheme();
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const [flightData, setFlightData] = useState<FlightData>({
    latitude: null,
    lnggitude: null,
    altitude: null,
    speed: null,
    heading: null,
    lastUpdate: new Date(),
    gpsAccuracy: null,
  });
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastKnownPosition = useRef<GeolocationPosition | null>(null);

  // Initialize map effect
  useEffect(() => {
    if (!mapRef.current) {
      mapRef.current = L.map('map').setView([0, 0], 2);
      L.tileLayer(getTileLayerUrl(isDarkMode), {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Initialize only once

  // Update map theme
  useEffect(() => {
    if (mapRef.current) {
      // Find the tile layer and update its URL
      mapRef.current.eachLayer(layer => {
        if (layer instanceof L.TileLayer) {
          layer.setUrl(getTileLayerUrl(isDarkMode));
        }
      });
    }
  }, [isDarkMode]);

  // Geolocation tracking effect
  useEffect(() => {
    const startTracking = () => {
      try {
        watchId.current = navigator.geolocation.watchPosition(
          (position) => {
            lastKnownPosition.current = position;
            const newData = {
              latitude: position.coords.latitude,
              lnggitude: position.coords.longitude,
              altitude: position.coords.altitude,
              // Ensure speed is in km/h (watchPosition provides m/s)
              speed: position.coords.speed !== null ? mpsToKmh(position.coords.speed) : null,
              heading: position.coords.heading,
              lastUpdate: new Date(),
              gpsAccuracy: position.coords.accuracy,
            };
            setFlightData(newData);

            // Update map
            if (mapRef.current && newData.latitude && newData.lnggitude) {
              const latLng = L.latLng(newData.latitude, newData.lnggitude);

              // Update or create marker with plane icon
              if (markerRef.current) {
                markerRef.current.setLatLng(latLng);
                markerRef.current.setIcon(createPlaneIcon(newData.heading));
              } else {
                markerRef.current = L.marker(latLng, { icon: createPlaneIcon(newData.heading) }).addTo(mapRef.current);
              }

              // Update or create accuracy circle
              const accuracy = newData.gpsAccuracy || 0;
              if (accuracyCircleRef.current) {
                accuracyCircleRef.current.setLatLng(latLng);
                accuracyCircleRef.current.setRadius(accuracy);
              } else if (accuracy > 0) {
                accuracyCircleRef.current = L.circle(latLng, {
                  radius: accuracy,
                  color: 'blue',
                  fillColor: '#30f',
                  fillOpacity: 0.15
                }).addTo(mapRef.current);
              }

              // Center map on position
              mapRef.current.setView(latLng, mapRef.current.getZoom());
            }
          },
          (geoError) => {
            console.warn('GPS Error:', geoError);
            setError(`GPS Error: ${geoError.message}. Trying last known position.`);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000, // Increased timeout
            maximumAge: 0, // Force fresh data
          }
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start tracking');
      }
    };

    startTracking();

    // Cleanup function
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []); // Run only once on mount

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'} p-4`}>
      <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6 max-w-[1920px] mx-auto h-[calc(100vh-2rem)]`}>
        <div className="flex flex-col h-full">
          <div className="flex-none mb-4">
            <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              In-Flight Tracker
            </h2>
          </div>

          {error && (
            <div className={`flex-none p-3 rounded mb-4 ${isDarkMode ? 'bg-red-900 text-red-100' : 'bg-red-100 text-red-700'}`}>
              {error}
            </div>
          )}

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
            {/* Map Section - Takes up most of the space */}
            <div className="lg:col-span-9 rounded-lg overflow-hidden bg-gray-500"> {/* Added bg color */}
              <div id="map" className="w-full h-full"></div>
            </div>

            {/* Info Panels Section */}
            <div className="lg:col-span-3 space-y-4 overflow-y-auto">
              {/* Flight Data Panel */}
              <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-blue-900 text-blue-100' : 'bg-blue-100 text-blue-700'}`}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className={`text-sm font-medium text-center ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                      Altitude
                    </div>
                    <div className="text-xl font-bold text-center">
                      {flightData.altitude !== null ? `${metersToFeet(flightData.altitude)}ft` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className={`text-sm font-medium text-center ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                      Speed
                    </div>
                    <div className="text-xl font-bold text-center">
                      {flightData.speed !== null ? `${kmhToKnots(flightData.speed)}kts` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className={`text-sm font-medium text-center ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                      Heading
                    </div>
                    <div className="text-xl font-bold text-center">
                      {flightData.heading !== null ? `${flightData.heading.toFixed(1)}°` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className={`text-sm font-medium text-center ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                      GPS Accuracy
                    </div>
                    <div className="text-xl font-bold text-center">
                      {flightData.gpsAccuracy !== null ? `${flightData.gpsAccuracy.toFixed(1)}m` : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Position Panel */}
              <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <h3 className={`text-lg font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                  Position
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Latitude:</span>
                    <span className="font-mono">
                      {flightData.latitude !== null ? `${flightData.latitude.toFixed(6)}°` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Lnggitude:</span>
                    <span className="font-mono">
                      {flightData.lnggitude !== null ? `${flightData.lnggitude.toFixed(6)}°` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Last Update Panel */}
              <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <h3 className={`text-lg font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                  Last Update
                </h3>
                <div className={`text-center font-mono ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  {flightData.lastUpdate.toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InFlightTracker; 