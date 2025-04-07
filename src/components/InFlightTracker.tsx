import React, { useEffect, useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.offline';
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
  const [isGpsAvailable, setIsGpsAvailable] = useState<boolean>(true);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const watchId = useRef<number | null>(null);
  const lastKnownPosition = useRef<GeolocationPosition | null>(null);
  const tileLayerRef = useRef<L.TileLayer.Offline | null>(null);

  // Function to pre-cache tiles
  const precacheTiles = async () => {
    if (!mapRef.current) return;

    const tileLayer = tileLayerRef.current;
    if (!tileLayer) return;

    const tileLayerOffline = L.tileLayer.offline(
      isDarkMode
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      {
        attribution: '© OpenStreetMap contributors, © CARTO',
        subdomains: 'abcd',
        minZoom: 0,
        maxZoom: 5,
      }
    );

    // Replace the existing tile layer with the offline version
    tileLayerOffline.addTo(mapRef.current);
    if (tileLayer) {
      mapRef.current.removeLayer(tileLayer);
    }
    tileLayerRef.current = tileLayerOffline;

    // Start pre-caching tiles
    const bounds = mapRef.current.getBounds();
    const zoom = 5; // Maximum zoom level to cache
    const tileUrls = tileLayerOffline.getTileUrls(bounds, zoom);
    
    try {
      await tileLayerOffline.preCache(tileUrls);
      console.log('Tiles pre-cached successfully');
    } catch (err) {
      console.error('Error pre-caching tiles:', err);
    }
  };

  useEffect(() => {
    // Initialize map
    if (!mapRef.current) {
      mapRef.current = L.map('map').setView([0, 0], 2);
      const tileLayer = L.tileLayer.offline(
        isDarkMode
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        {
          attribution: '© OpenStreetMap contributors, © CARTO',
          subdomains: 'abcd',
          minZoom: 0,
          maxZoom: 5,
        }
      ).addTo(mapRef.current);
      tileLayerRef.current = tileLayer;

      // Start pre-caching tiles
      precacheTiles();
    }

    // Check if GPS is available
    if (!navigator.geolocation) {
      setIsGpsAvailable(false);
      setError('GPS is not available on this device');
      return;
    }

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

            // Update map with new position
            if (mapRef.current && newData.latitude && newData.longitude) {
              const latLng = L.latLng(newData.latitude, newData.longitude);
              
              // Update or create marker
              if (!markerRef.current) {
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
              } else {
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

              // Update or create accuracy circle
              if (!accuracyCircleRef.current) {
                accuracyCircleRef.current = L.circle(latLng, {
                  radius: newData.gpsAccuracy || 0,
                  color: isDarkMode ? '#60a5fa' : '#3b82f6',
                  fillColor: isDarkMode ? '#60a5fa' : '#3b82f6',
                  fillOpacity: 0.2,
                  weight: 1
                }).addTo(mapRef.current);
              } else {
                accuracyCircleRef.current.setLatLng(latLng);
                accuracyCircleRef.current.setRadius(newData.gpsAccuracy || 0);
              }

              // Center map on position
              mapRef.current.setView(latLng, mapRef.current.getZoom());
            }
          },
          (error) => {
            console.warn('GPS Error:', error);
            setError(`GPS Error: ${error.message}`);
            
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
      } catch (err) {
        setError('Failed to start GPS tracking');
        console.error('GPS Error:', err);
      }
    };

    startTracking();

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isDarkMode]);

  useEffect(() => {
    // Update tile layer when dark mode changes
    if (mapRef.current && tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
      const newTileLayer = L.tileLayer.offline(
        isDarkMode
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        {
          attribution: '© OpenStreetMap contributors, © CARTO',
          subdomains: 'abcd',
          minZoom: 0,
          maxZoom: 5,
        }
      ).addTo(mapRef.current);
      tileLayerRef.current = newTileLayer;
    }
  }, [isDarkMode]);

  return (
    <div className={`p-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
      <h2 className="text-2xl font-bold mb-4">In-Flight Tracker</h2>
      
      {!isGpsAvailable && (
        <div className={`p-4 rounded-lg mb-4 ${isDarkMode ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-800'}`}>
          GPS is not available on this device. This tool requires GPS functionality to work.
        </div>
      )}

      {error && (
        <div className={`p-4 rounded-lg mb-4 ${isDarkMode ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800'}`}>
          {error}
        </div>
      )}

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
          <h3 className="text-lg font-semibold mb-2">Map View</h3>
          <div id="map" className="w-full h-64 rounded-lg"></div>
        </div>
      </div>
    </div>
  );
};

export default InFlightTracker; 