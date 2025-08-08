import React, { useEffect, useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import planeIcon from '../plane-icon.svg';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

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

  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const planeEntityRef = useRef<Cesium.Entity | null>(null);
  const accuracyEntityRef = useRef<Cesium.Entity | null>(null);
  const watchId = useRef<number | null>(null);
  const lastKnownPosition = useRef<GeolocationPosition | null>(null);

  // Simple tile prefetch for offline use via SW caching
  const precacheTiles = async () => {
    const subdomains = ['a', 'b', 'c', 'd'];
    const template = isDarkMode
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';

    const maxZoom = 4; // keep small for offline footprint
    const zooms = Array.from({ length: maxZoom + 1 }, (_, z) => z);

    const fetches: Promise<any>[] = [];
    for (const z of zooms) {
      const num = 1 << z;
      // Sample a coarse grid to limit requests
      const step = Math.max(1, Math.floor(num / 4));
      for (let x = 0; x < num; x += step) {
        for (let y = 0; y < num; y += step) {
          const s = subdomains[(x + y) % subdomains.length];
          const url = template
            .replace('{s}', s)
            .replace('{z}', String(z))
            .replace('{x}', String(x))
            .replace('{y}', String(y));
          try {
            fetches.push(fetch(url, { mode: 'no-cors', cache: 'reload' }).catch(() => {}));
          } catch (_) {}
        }
      }
    }

    await Promise.all(fetches);
  };

  useEffect(() => {
    if (!viewerRef.current) {
      // Imagery provider depending on theme
      const imageryProvider = new Cesium.UrlTemplateImageryProvider({
        url: isDarkMode
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: '© OpenStreetMap contributors, © CARTO'
      });

      const viewer = new Cesium.Viewer('globe', {
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        navigationHelpButton: false,
        timeline: false,
        animation: false,
        fullscreenButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        infoBox: false,
        shouldAnimate: false,
      });

      // Replace base layer with our provider
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(imageryProvider);

      // Use terrain off for simpler offline support
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();

      viewerRef.current = viewer;
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000)
      });

      // Begin prefetch of some tiles for offline
      precacheTiles();
    } else {
      // Update base layer when theme changes
      const viewer = viewerRef.current;
      if (viewer) {
        const newProvider = new Cesium.UrlTemplateImageryProvider({
          url: isDarkMode
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          subdomains: ['a', 'b', 'c', 'd'],
          credit: '© OpenStreetMap contributors, © CARTO'
        });
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(newProvider);
      }
    }

    // Geolocation checks
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

            // Update globe
            const viewer = viewerRef.current;
            if (viewer && newData.latitude !== null && newData.longitude !== null) {
              const height = (newData.altitude ?? 0);
              const cart = Cesium.Cartesian3.fromDegrees(newData.longitude, newData.latitude, Math.max(10, height));

              if (!planeEntityRef.current) {
                planeEntityRef.current = viewer.entities.add({
                  position: new Cesium.ConstantPositionProperty(cart),
                  billboard: new Cesium.BillboardGraphics({
                    image: planeIcon,
                    scale: new Cesium.ConstantProperty(0.6),
                    verticalOrigin: Cesium.VerticalOrigin.CENTER,
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    rotation: new Cesium.ConstantProperty(((newData.heading ?? 0) * Math.PI) / 180),
                    alignedAxis: new Cesium.ConstantProperty(Cesium.Cartesian3.ZERO)
                  })
                });
              } else {
                planeEntityRef.current.position = new Cesium.ConstantPositionProperty(cart);
                if (planeEntityRef.current.billboard) {
                  planeEntityRef.current.billboard.rotation = new Cesium.ConstantProperty(((newData.heading ?? 0) * Math.PI) / 180);
                }
              }

              // Accuracy circle (ellipse)
              if (newData.gpsAccuracy) {
                if (!accuracyEntityRef.current) {
                  accuracyEntityRef.current = viewer.entities.add({
                    position: new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(newData.longitude, newData.latitude)),
                    ellipse: new Cesium.EllipseGraphics({
                      semiMajorAxis: new Cesium.ConstantProperty(newData.gpsAccuracy),
                      semiMinorAxis: new Cesium.ConstantProperty(newData.gpsAccuracy),
                      height: new Cesium.ConstantProperty(0),
                      material: Cesium.Color.fromCssColorString(isDarkMode ? '#60a5fa' : '#3b82f6').withAlpha(0.2),
                      outline: new Cesium.ConstantProperty(true),
                      outlineColor: new Cesium.ConstantProperty(Cesium.Color.fromCssColorString(isDarkMode ? '#60a5fa' : '#3b82f6')),
                      outlineWidth: new Cesium.ConstantProperty(1)
                    })
                  });
                } else {
                  accuracyEntityRef.current.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(newData.longitude, newData.latitude));
                  if (accuracyEntityRef.current.ellipse) {
                    accuracyEntityRef.current.ellipse.semiMajorAxis = new Cesium.ConstantProperty(newData.gpsAccuracy);
                    accuracyEntityRef.current.ellipse.semiMinorAxis = new Cesium.ConstantProperty(newData.gpsAccuracy);
                  }
                }
              }

              // Keep camera centered
              viewer.camera.setView({ destination: cart, orientation: undefined });
            }
          },
          (error) => {
            console.warn('GPS Error:', error);
            setError(`GPS Error: ${error.message}`);

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

              const viewer = viewerRef.current;
              if (viewer && newData.latitude !== null && newData.longitude !== null) {
                const height = (newData.altitude ?? 0);
                const cart = Cesium.Cartesian3.fromDegrees(newData.longitude, newData.latitude, Math.max(10, height));
                if (planeEntityRef.current) {
                  planeEntityRef.current.position = new Cesium.ConstantPositionProperty(cart);
                  if (planeEntityRef.current.billboard) {
                    planeEntityRef.current.billboard.rotation = new Cesium.ConstantProperty(((newData.heading ?? 0) * Math.PI) / 180);
                  }
                }
                if (accuracyEntityRef.current && newData.gpsAccuracy) {
                  accuracyEntityRef.current.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(newData.longitude, newData.latitude));
                  if (accuracyEntityRef.current.ellipse) {
                    accuracyEntityRef.current.ellipse.semiMajorAxis = new Cesium.ConstantProperty(newData.gpsAccuracy);
                    accuracyEntityRef.current.ellipse.semiMinorAxis = new Cesium.ConstantProperty(newData.gpsAccuracy);
                  }
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
      if (viewerRef.current) {
        viewerRef.current.entities.removeAll();
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      planeEntityRef.current = null;
      accuracyEntityRef.current = null;
    };
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
          <h3 className="text-lg font-semibold mb-2">Globe View</h3>
          <div id="globe" className="w-full h-64 rounded-lg" />
        </div>
      </div>
    </div>
  );
};

export default InFlightTracker; 