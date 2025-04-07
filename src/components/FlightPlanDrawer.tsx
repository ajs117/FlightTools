import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useTheme } from '../context/ThemeContext';

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

interface Waypoint {
  lat: number;
  lng: number;
  name?: string;
  type?: 'airport' | 'waypoint';
}

// Component to handle map click events
const MapClickHandler: React.FC<{
  onMapClick: (lat: number, lng: number) => void;
  isDrawingEnabled: boolean;
}> = ({ onMapClick, isDrawingEnabled }) => {
  useMapEvents({
    click: (e) => {
      if (isDrawingEnabled) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
};

const FlightPlanDrawer: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [isDrawingEnabled, setIsDrawingEnabled] = useState(true);
  const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null);
  const [waypointName, setWaypointName] = useState('');
  const [waypointType, setWaypointType] = useState<'airport' | 'waypoint'>('waypoint');

  // Generate MSFS .pln file content
  const generatePlnContent = () => {
    const header = `<?xml version="1.0" encoding="UTF-8"?>
<SimBase.Document Type="AceXML" version="1,0" id="flight-plan">
  <Descr>AceXML FlightPlan</Descr>
  <FlightPlan.FlightPlan>
    <Title>Custom Flight Plan</Title>
    <FPType>VFR</FPType>
    <RouteType>Direct</RouteType>
    <CruisingAlt>10000</CruisingAlt>
    <DepartureID>${waypoints[0]?.name || 'START'}</DepartureID>
    <DepartureLLA>${waypoints[0]?.lat},${waypoints[0]?.lng},0</DepartureLLA>
    <DestinationID>${waypoints[waypoints.length - 1]?.name || 'END'}</DestinationID>
    <DestinationLLA>${waypoints[waypoints.length - 1]?.lat},${waypoints[waypoints.length - 1]?.lng},0</DestinationLLA>
    <AppVersion>
      <AppVersionMajor>11</AppVersionMajor>
      <AppVersionBuild>282174</AppVersionBuild>
    </AppVersion>
    <Waypoints>`;

    const waypointElements = waypoints.map((wp, index) => `
      <Waypoint>
        <WorldPosition>${wp.lat},${wp.lng},0</WorldPosition>
        <Ident>${wp.name || `WP${index + 1}`}</Ident>
        <ATCWaypointType>${wp.type === 'airport' ? 'Airport' : 'User'}</ATCWaypointType>
      </Waypoint>`).join('');

    const footer = `
    </Waypoints>
  </FlightPlan.FlightPlan>
</SimBase.Document>`;

    return header + waypointElements + footer;
  };

  // Handle map click
  const handleMapClick = (lat: number, lng: number) => {
    if (!isDrawingEnabled) return;

    const newWaypoint: Waypoint = {
      lat,
      lng,
      name: `WP${waypoints.length + 1}`,
      type: waypointType
    };

    setWaypoints([...waypoints, newWaypoint]);
  };

  // Export to .pln file
  const exportToPln = () => {
    const content = generatePlnContent();
    const blob = new Blob([content], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flight_plan.pln';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Remove waypoint
  const removeWaypoint = (index: number) => {
    setWaypoints(waypoints.filter((_, i) => i !== index));
  };

  // Update waypoint name
  const updateWaypointName = (index: number, name: string) => {
    setWaypoints(waypoints.map((wp, i) => 
      i === index ? { ...wp, name } : wp
    ));
  };

  return (
      <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-3 sm:p-6 max-w-7xl mx-auto`}>
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-wrap gap-2 sm:gap-4">
            <button
              onClick={() => setIsDrawingEnabled(!isDrawingEnabled)}
              className={`px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm rounded ${
                isDrawingEnabled
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gray-600 hover:bg-gray-700'
              } text-white`}
            >
              {isDrawingEnabled ? 'Drawing Enabled' : 'Drawing Disabled'}
            </button>
            <button
              onClick={() => setWaypointType(waypointType === 'airport' ? 'waypoint' : 'airport')}
              className="px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {waypointType === 'airport' ? 'Airport Mode' : 'Waypoint Mode'}
            </button>
            <button
              onClick={exportToPln}
              disabled={waypoints.length < 2}
              className="px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-300"
            >
              Export to MSFS
            </button>
            <button
              onClick={() => setWaypoints([])}
              className="px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm bg-red-600 text-white rounded hover:bg-red-700"
            >
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div className={`h-[300px] sm:h-[400px] rounded border ${
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
                  url={isDarkMode 
                    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  }
                />
                <MapClickHandler onMapClick={handleMapClick} isDrawingEnabled={isDrawingEnabled} />
                {waypoints.map((wp, index) => (
                  <Marker
                    key={index}
                    position={[wp.lat, wp.lng]}
                    eventHandlers={{
                      click: () => setSelectedWaypoint(wp)
                    }}
                  />
                ))}
                {waypoints.length > 1 && (
                  <Polyline
                    positions={waypoints.map(wp => [wp.lat, wp.lng])}
                    color={isDarkMode ? '#60A5FA' : '#2563EB'}
                    weight={3}
                  />
                )}
              </MapContainer>
            </div>

            <div className={`p-3 sm:p-4 rounded ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-50'
            }`}>
              <h3 className={`text-base sm:text-lg font-semibold mb-2 sm:mb-4 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Waypoints
              </h3>
              <div className="space-y-1 sm:space-y-2 max-h-[250px] sm:max-h-[300px] overflow-y-auto text-sm">
                {waypoints.map((wp, index) => (
                  <div
                    key={index}
                    className={`p-1 sm:p-2 rounded flex items-center gap-2 ${
                      isDarkMode ? 'bg-gray-600' : 'bg-white'
                    }`}
                  >
                    <span className={`font-mono text-xs sm:text-sm ${
                      isDarkMode ? 'text-blue-300' : 'text-blue-600'
                    }`}>
                      {wp.name}
                    </span>
                    <span className={`text-xs sm:text-sm ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                      ({wp.lat.toFixed(4)}, {wp.lng.toFixed(4)})
                    </span>
                    <button
                      onClick={() => removeWaypoint(index)}
                      className="ml-auto text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {selectedWaypoint && (
                <div className={`mt-3 sm:mt-4 p-2 sm:p-4 rounded ${
                  isDarkMode ? 'bg-gray-600' : 'bg-white'
                }`}>
                  <h4 className={`text-sm sm:text-base font-semibold mb-1 sm:mb-2 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Edit Waypoint
                  </h4>
                  <input
                    type="text"
                    value={waypointName}
                    onChange={(e) => setWaypointName(e.target.value)}
                    placeholder="Waypoint name"
                    className={`w-full p-1 sm:p-2 mb-1 sm:mb-2 rounded text-sm ${
                      isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'
                    }`}
                  />
                  <button
                    onClick={() => {
                      updateWaypointName(waypoints.indexOf(selectedWaypoint), waypointName);
                      setSelectedWaypoint(null);
                    }}
                    className="w-full px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Update Name
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  );
};

export default FlightPlanDrawer; 