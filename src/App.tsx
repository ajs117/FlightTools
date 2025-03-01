import React, { useState } from 'react';
import { Search, Loader } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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

interface FlightPlan {
  id: string;
  fromICAO: string;
  toICAO: string;
  fromName: string;
  toName: string;
  distance: number;
  route: {
    nodes: Waypoint[];
  } 
}

const App = () => {
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flightPlans, setFlightPlans] = useState<FlightPlan[]>([]);

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

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">Flight Tools</h1>
      
      <div className="bg-white rounded-lg shadow p-4 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1">
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
          
          <div className="flex-1">
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
                  {plan.route.nodes.map((waypoint, index) => (
                    <Marker
                      key={`${waypoint.ident}-${index}`}
                      position={[waypoint.lat, waypoint.lon]}
                      title={waypoint.ident}
                    />
                  ))}
                  <Polyline
                    positions={plan.route.nodes.map(w => [w.lat, w.lon])}
                    color="blue"
                  />
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
                      <div className="flex justify-between mb-2">
                        <div>
                          <span className="font-medium">{plan.fromICAO}</span> → 
                          <span className="font-medium">{plan.toICAO}</span>
                        </div>
                        <div className="text-gray-600">
                          {Math.round(plan.distance)} nm
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 mb-4">
                        {plan.fromName} → {plan.toName}
                      </div>
                      
                      <h3 className="font-medium mb-2">Waypoints:</h3>
                      <div className="space-y-1 text-sm">
                        {Array.isArray(plan.route.nodes) && plan.route.nodes.length > 0 ? (
                          plan.route.nodes.map((waypoint, index) => (
                            <div key={index} className="grid grid-cols-4 gap-2">
                              <div>{waypoint.ident || 'Unknown'}</div>
                              <div>{waypoint.lat.toFixed(4)}°</div>
                              <div>{waypoint.lon.toFixed(4)}°</div>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-500">No waypoints available</div>
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