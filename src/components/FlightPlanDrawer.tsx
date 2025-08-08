import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import CesiumGlobe, { CesiumGlobeRef } from './common/CesiumGlobe';
import { Waypoint } from '../models';

const FlightPlanDrawer: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [isDrawingEnabled, setIsDrawingEnabled] = useState(true);
  const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null);
  const [waypointName, setWaypointName] = useState('');
  const [waypointType, setWaypointType] = useState<'airport' | 'waypoint'>('waypoint');
  const globeRef = useRef<CesiumGlobeRef | null>(null);

  const regenerateGraphics = () => {
    if (!globeRef.current) return;
    // Clear existing
    // Recreate polyline
    if (waypoints.length > 1) {
      globeRef.current.upsertPolyline({
        id: 'route',
        positions: waypoints.map(w => ({ lat: w.lat, lng: w.lng })),
        colorCss: isDarkMode ? '#60A5FA' : '#2563EB',
        width: 3,
      });
    } else {
      globeRef.current.removePolyline('route');
    }
    // Recreate markers
    waypoints.forEach((wp, idx) => {
      globeRef.current!.upsertMarker({
        id: `wp-${idx}`,
        lat: wp.lat,
        lng: wp.lng,
        image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="%23ef4444"/></svg>',
        size: 16,
      });
    });
  };

  useEffect(() => {
    regenerateGraphics();
  }, [waypoints, isDarkMode]);

  const handleMapClick = (lat: number, lng: number) => {
    if (!isDrawingEnabled) return;
    const newWaypoint: Waypoint = {
      lat,
      lng,
      name: `WP${waypoints.length + 1}`,
      type: waypointType,
    };
    setWaypoints(prev => [...prev, newWaypoint]);
  };

  const exportToPln = () => {
    const header = `<?xml version="1.0" encoding="UTF-8"?>\n<SimBase.Document Type="AceXML" version="1,0" id="flight-plan">\n  <Descr>AceXML FlightPlan</Descr>\n  <FlightPlan.FlightPlan>\n    <Title>Custom Flight Plan</Title>\n    <FPType>VFR</FPType>\n    <RouteType>Direct</RouteType>\n    <CruisingAlt>10000</CruisingAlt>\n    <DepartureID>${waypoints[0]?.name || 'START'}</DepartureID>\n    <DepartureLLA>${waypoints[0]?.lat},${waypoints[0]?.lng},0</DepartureLLA>\n    <DestinationID>${waypoints[waypoints.length - 1]?.name || 'END'}</DestinationID>\n    <DestinationLLA>${waypoints[waypoints.length - 1]?.lat},${waypoints[waypoints.length - 1]?.lng},0</DestinationLLA>\n    <AppVersion>\n      <AppVersionMajor>11</AppVersionMajor>\n      <AppVersionBuild>282174</AppVersionBuild>\n    </AppVersion>\n    <Waypoints>`;
    const waypointElements = waypoints.map((wp, index) => `\n      <Waypoint>\n        <WorldPosition>${wp.lat},${wp.lng},0</WorldPosition>\n        <Ident>${wp.name || `WP${index + 1}`}</Ident>\n        <ATCWaypointType>${wp.type === 'airport' ? 'Airport' : 'User'}</ATCWaypointType>\n      </Waypoint>`).join('');
    const footer = `\n    </Waypoints>\n  </FlightPlan.FlightPlan>\n</SimBase.Document>`;
    const content = header + waypointElements + footer;
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

  const removeWaypoint = (index: number) => {
    setWaypoints(waypoints.filter((_, i) => i !== index));
  };

  const updateWaypointName = (index: number, name: string) => {
    setWaypoints(waypoints.map((wp, i) => (i === index ? { ...wp, name } : wp)));
  };

  return (
    <div className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-3 sm:p-6 max-w-7xl mx-auto`}>
      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-wrap gap-2 sm:gap-4">
          <button onClick={() => setIsDrawingEnabled(!isDrawingEnabled)} className={`px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm rounded ${isDrawingEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'} text-white`}>
            {isDrawingEnabled ? 'Drawing Enabled' : 'Drawing Disabled'}
          </button>
          <button onClick={() => setWaypointType(waypointType === 'airport' ? 'waypoint' : 'airport')} className="px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            {waypointType === 'airport' ? 'Airport Mode' : 'Waypoint Mode'}
          </button>
          <button onClick={exportToPln} disabled={waypoints.length < 2} className="px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-purple-300">
            Export to MSFS
          </button>
          <button onClick={() => setWaypoints([])} className="px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm bg-red-600 text-white rounded hover:bg-red-700">
            Clear All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          <div className={`h-[300px] sm:h-[400px] rounded border ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
            <CesiumGlobe
              ref={globeRef as any}
              isDarkMode={isDarkMode}
              initialCenter={{ lat: 51.505, lng: -0.09, height: 2_000_000 }}
              onClick={handleMapClick}
            />
          </div>

          <div className={`p-3 sm:p-4 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <h3 className={`text-base sm:text-lg font-semibold mb-2 sm:mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Waypoints
            </h3>
            <div className="space-y-1 sm:space-y-2 max-h-[250px] sm:max-h-[300px] overflow-y-auto text-sm">
              {waypoints.map((wp, index) => (
                <div key={index} className={`p-1 sm:p-2 rounded flex items-center gap-2 ${isDarkMode ? 'bg-gray-600' : 'bg-white'}`}>
                  <span className={`font-mono text-xs sm:text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>{wp.name}</span>
                  <span className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} text-xs sm:text-sm`}>
                    ({wp.lat.toFixed(4)}, {wp.lng.toFixed(4)})
                  </span>
                  <button onClick={() => removeWaypoint(index)} className="ml-auto text-red-500 hover:text-red-700">
                    ×
                  </button>
                </div>
              ))}
            </div>

            {selectedWaypoint && (
              <div className={`mt-3 sm:mt-4 p-2 sm:p-4 rounded ${isDarkMode ? 'bg-gray-600' : 'bg-white'}`}>
                <h4 className={`text-sm sm:text-base font-semibold mb-1 sm:mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Edit Waypoint</h4>
                <input type="text" value={waypointName} onChange={(e) => setWaypointName(e.target.value)} placeholder="Waypoint name" className={`w-full p-1 sm:p-2 mb-1 sm:mb-2 rounded text-sm ${isDarkMode ? 'bg-gray-700 text-white border-gray-600' : 'bg-white text-gray-900'}`} />
                <button
                  onClick={() => { updateWaypointName(waypoints.indexOf(selectedWaypoint), waypointName); setSelectedWaypoint(null); }}
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