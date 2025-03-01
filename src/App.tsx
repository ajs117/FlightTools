import React, { useState } from 'react';
import { Search, Loader } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">Flight Tools</h1>
      
      <div className="bg-white rounded-lg shadow p-4 max-w-2xl mx-auto">
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

        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        {flightPlans.length > 0 && (
          <div className="mt-6">
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
  );
};

export default App;