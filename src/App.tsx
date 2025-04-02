import React, { useState, Suspense, lazy } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';

// Lazy load components with key-based remounting
const FlightCalculator = lazy(() => import('./components/FlightCalculator'));
const FlightTracker = lazy(() => import('./components/FlightTracker'));
const FlightPlanDrawer = lazy(() => import('./components/FlightPlanDrawer'));
const InFlightTracker = lazy(() => import('./components/InFlightTracker'));

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tracker');
  const { isDarkMode, toggleTheme } = useTheme();

  // Adding keys to components ensures they're completely remounted when switched
  // Only the active component will be in the DOM
  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <nav className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              Flight Tools
            </h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setActiveTab('calculator')}
                className={`px-4 py-2 rounded-md ${
                  activeTab === 'calculator'
                    ? isDarkMode 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-blue-600 text-white'
                    : isDarkMode
                      ? 'text-gray-300 hover:bg-gray-700'
                      : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Flight Calculator
              </button>
              <button
                onClick={() => setActiveTab('tracker')}
                className={`px-4 py-2 rounded-md ${
                  activeTab === 'tracker'
                    ? isDarkMode 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-blue-600 text-white'
                    : isDarkMode
                      ? 'text-gray-300 hover:bg-gray-700'
                      : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Flight Tracker
              </button>
              <button
                onClick={() => setActiveTab('drawer')}
                className={`px-4 py-2 rounded-md ${
                  activeTab === 'drawer'
                    ? isDarkMode 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-blue-600 text-white'
                    : isDarkMode
                      ? 'text-gray-300 hover:bg-gray-700'
                      : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Flight Plan Drawer
              </button>
              <button
                onClick={() => setActiveTab('inflight')}
                className={`px-4 py-2 rounded-md ${
                  activeTab === 'inflight'
                    ? isDarkMode 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-blue-600 text-white'
                    : isDarkMode
                      ? 'text-gray-300 hover:bg-gray-700'
                      : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                In-Flight Tracker
              </button>
              <div className="ml-auto">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={isDarkMode}
                    onChange={toggleTheme}
                  />
                  <div className={`w-11 h-6 rounded-full peer ${
                    isDarkMode 
                      ? 'bg-yellow-500 peer-checked:bg-yellow-600' 
                      : 'bg-gray-700 peer-checked:bg-gray-800'
                  }`}>
                    <div className={`absolute left-1 top-1 w-4 h-4 rounded-full transition-all ${
                      isDarkMode 
                        ? 'translate-x-full bg-gray-900' 
                        : 'bg-white'
                    }`} />
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-4 py-3">
        <Suspense fallback={<div className={`text-center py-10 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Loading...</div>}>
          {activeTab === 'calculator' && <FlightCalculator key="calculator" />}
          {activeTab === 'tracker' && <FlightTracker key="tracker" />}
          {activeTab === 'drawer' && <FlightPlanDrawer key="drawer" />}
          {activeTab === 'inflight' && <InFlightTracker key="inflight" />}
        </Suspense>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;