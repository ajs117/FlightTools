import React, { useState } from 'react';
import FlightCalculator from './components/FlightCalculator';
import { SimpleMap } from './components/SimpleMap';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'calculator' | 'map'>('calculator');

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">Flight Tools</h1>
            <div className="flex space-x-4">
              <button
                onClick={() => setCurrentView('calculator')}
                className={`px-4 py-2 rounded-md ${
                  currentView === 'calculator'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Flight Calculator
              </button>
              <button
                onClick={() => setCurrentView('map')}
                className={`px-4 py-2 rounded-md ${
                  currentView === 'map'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Simple Map
              </button>
            </div>
          </div>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-4 py-3">
        {currentView === 'calculator' && <FlightCalculator />}
        {currentView === 'map' && <SimpleMap />}
      </div>
    </div>
  );
};

export default App;