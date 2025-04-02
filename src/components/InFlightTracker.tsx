import React, { useEffect, useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import planeIcon from '../plane-icon.svg';

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

interface FlightData {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  lastUpdate: Date;
  gpsAccuracy: number | null;
}

// Conversion functions
const metersToFeet = (meters: number): number => {
  return Math.round(meters * 3.28084);
};

const kmhToKnots = (kmh: number): number => {
  return Math.round(kmh * 0.539957);
};

const InFlightTracker: React.FC = () => {
  const { isDarkMode } = useTheme();
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const [flightData, setFlightData] = useState<FlightData>({
    latitude: null,
    longitude: null,
    altitude: null,
    speed: null,
    heading: null,
    lastUpdate: new Date(),
    gpsAccuracy: null,
  });
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastKnownPosition = useRef<GeolocationPosition | null>(null);

  useEffect(() => {
    // Initialize map
    if (!mapRef.current) {
      mapRef.current = L.map('map').setView([0, 0], 2);
      L.tileLayer(isDarkMode 
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isDarkMode]);

  useEffect(() => {
    const startTracking = async () => {
      try {
        // Start watching position with high accuracy
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

            // Update map
            if (mapRef.current && newData.latitude && newData.longitude) {
              const latLng = L.latLng(newData.latitude, newData.longitude);
              
              // Update or create marker with plane icon
              if (markerRef.current) {
                markerRef.current.setLatLng(latLng);
                markerRef.current.setIcon(L.divIcon({
                  html: `<div style="transform: rotate(${newData.heading || 0}deg)">
                    <img src="${planeIcon}" alt="plane" style="width: 24px; height: 24px;" />
                  </div>`,
                  className: '',
                  iconSize: [24, 24],
                  iconAnchor: [12, 12]
                }));
              } else {
                markerRef.current = L.marker(latLng, {
                  icon: L.divIcon({
                    html: `<div style="transform: rotate(${newData.heading || 0}deg)">
                      <img src="${planeIcon}" alt="plane" style="width: 24px; height: 24px;" />
                    </div>`,
                    className: '',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                  })
                }).addTo(mapRef.current);
              }

              // Update or create accuracy circle
              if (accuracyCircleRef.current) {
                accuracyCircleRef.current.setLatLng(latLng);
                accuracyCircleRef.current.setRadius(newData.gpsAccuracy || 0);
              } else if (newData.gpsAccuracy) {
                accuracyCircleRef.current = L.circle(latLng, {
                  radius: newData.gpsAccuracy,
                  color: 'blue',
                  fillColor: '#30f',
                  fillOpacity: 0.15
                }).addTo(mapRef.current);
              }

              // Center map on position
              mapRef.current.setView(latLng, mapRef.current.getZoom());
            }
          },
          (error) => {
            console.warn('GPS Error:', error);
            // Keep using last known position if available
            if (lastKnownPosition.current) {
              const newData = {
                latitude: lastKnownPosition.current.coords.latitude,
                longitude: lastKnownPosition.current.coords.longitude,
                altitude: lastKnownPosition.current.coords.altitude,
                speed: lastKnownPosition.current.coords.speed,
                heading: lastKnownPosition.current.coords.heading,
                lastUpdate: new Date(),
                gpsAccuracy: lastKnownPosition.current.coords.accuracy,
              };
              setFlightData(newData);

              // Update map with last known position
              if (mapRef.current && newData.latitude && newData.longitude) {
                const latLng = L.latLng(newData.latitude, newData.longitude);
                if (markerRef.current) {
                  markerRef.current.setLatLng(latLng);
                  markerRef.current.setIcon(L.divIcon({
                    html: `<div style="transform: rotate(${newData.heading || 0}deg)">
                      <img src="${planeIcon}" alt="plane" style="width: 24px; height: 24px;" />
                    </div>`,
                    className: '',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                  }));
                }
                if (accuracyCircleRef.current) {
                  accuracyCircleRef.current.setLatLng(latLng);
                  accuracyCircleRef.current.setRadius(newData.gpsAccuracy || 0);
                }
              }
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          }
        );

        return () => {
          if (watchId.current !== null) {
            navigator.geolocation.clearWatch(watchId.current);
          }
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start tracking');
      }
    };

    startTracking();
  }, []);

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
            <div className={`flex-none p-3 rounded mb-4 ${
              isDarkMode ? 'bg-red-900 text-red-100' : 'bg-red-100 text-red-700'
            }`}>
              {error}
            </div>
          )}

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
            {/* Map Section - Takes up most of the space */}
            <div className="lg:col-span-9 rounded-lg overflow-hidden">
              <div id="map" className="w-full h-full"></div>
            </div>

            {/* Info Panels Section */}
            <div className="lg:col-span-3 space-y-4 overflow-y-auto">
              {/* Flight Data Panel */}
              <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-blue-900 text-blue-100' : 'bg-blue-100 text-blue-700'}`}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className={`text-sm font-medium text-center ${
                      isDarkMode ? 'text-blue-200' : 'text-blue-800'
                    }`}>
                      Altitude
                    </div>
                    <div className="text-xl font-bold text-center">
                      {flightData.altitude ? metersToFeet(flightData.altitude) : 'N/A'}ft
                    </div>
                  </div>
                  <div>
                    <div className={`text-sm font-medium text-center ${
                      isDarkMode ? 'text-blue-200' : 'text-blue-800'
                    }`}>
                      Speed
                    </div>
                    <div className="text-xl font-bold text-center">
                      {flightData.speed ? kmhToKnots(flightData.speed * 3.6) : 'N/A'}kts
                    </div>
                  </div>
                  <div>
                    <div className={`text-sm font-medium text-center ${
                      isDarkMode ? 'text-blue-200' : 'text-blue-800'
                    }`}>
                      Heading
                    </div>
                    <div className="text-xl font-bold text-center">
                      {flightData.heading?.toFixed(1) ?? 'N/A'}°
                    </div>
                  </div>
                  <div>
                    <div className={`text-sm font-medium text-center ${
                      isDarkMode ? 'text-blue-200' : 'text-blue-800'
                    }`}>
                      GPS Accuracy
                    </div>
                    <div className="text-xl font-bold text-center">
                      {flightData.gpsAccuracy?.toFixed(1) ?? 'N/A'}m
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
                    <span className="font-mono">{flightData.latitude?.toFixed(6) ?? 'N/A'}°</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Longitude:</span>
                    <span className="font-mono">{flightData.longitude?.toFixed(6) ?? 'N/A'}°</span>
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