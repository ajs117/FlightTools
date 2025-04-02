import React, { useState, Suspense, lazy } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';

// Lazy load components with key-based remounting
const FlightCalculator = lazy(() => import('./components/FlightCalculator'));
const FlightTracker = lazy(() => import('./components/FlightTracker'));
const FlightPlanDrawer = lazy(() => import('./components/FlightPlanDrawer'));
const InFlightTracker = lazy(() => import('./components/InFlightTracker'));

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const { isDarkMode, toggleTheme } = useTheme();

  const navigateToHome = () => {
    setActiveTab(null);
  };

  // If no tool is selected, show the homepage with grid of tools
  if (activeTab === null) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
        <nav className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                Flight Tools
              </h1>
              <div>
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
        </nav>
        
        <div className="max-w-6xl mx-auto p-6">
          <div className="text-center mb-8">
            <h2 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              Welcome to Flight Tools
            </h2>
            <p className={`text-lg ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Select a tool to get started
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div 
              onClick={() => setActiveTab('calculator')}
              className={`cursor-pointer aspect-square rounded-xl shadow-lg p-6 transform transition-all hover:scale-105 ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-blue-50'
              } flex flex-col items-center justify-center`}
            >
              <div className={`text-5xl mb-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                ✈️
              </div>
              <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                Flight Calculator
              </h3>
              <p className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Calculate flight metrics and distances
              </p>
            </div>
            
            <div 
              onClick={() => setActiveTab('tracker')}
              className={`cursor-pointer aspect-square rounded-xl shadow-lg p-6 transform transition-all hover:scale-105 ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-green-50'
              } flex flex-col items-center justify-center`}
            >
              <div className={`text-5xl mb-4 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                🛫
              </div>
              <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                Flight Tracker
              </h3>
              <p className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Track real-time flights around the world
              </p>
            </div>
            
            <div 
              onClick={() => setActiveTab('drawer')}
              className={`cursor-pointer aspect-square rounded-xl shadow-lg p-6 transform transition-all hover:scale-105 ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-purple-50'
              } flex flex-col items-center justify-center`}
            >
              <div className={`text-5xl mb-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                🗺️
              </div>
              <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                Flight Plan Drawer
              </h3>
              <p className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Create and export custom flight plans
              </p>
            </div>
            
            <div 
              onClick={() => setActiveTab('inflight')}
              className={`cursor-pointer aspect-square rounded-xl shadow-lg p-6 transform transition-all hover:scale-105 ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-red-50'
              } flex flex-col items-center justify-center`}
            >
              <div className={`text-5xl mb-4 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                🧭
              </div>
              <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                In-Flight Tracker
              </h3>
              <p className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Monitor flight progress and details
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show the selected tool with a back button
  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <nav className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button 
                onClick={navigateToHome}
                className={`mr-3 px-3 py-1 rounded ${isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'} hover:opacity-80`}
              >
                ← Back
              </button>
              <h1 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                {activeTab === 'calculator' && 'Flight Calculator'}
                {activeTab === 'tracker' && 'Flight Tracker'}
                {activeTab === 'drawer' && 'Flight Plan Drawer'}
                {activeTab === 'inflight' && 'In-Flight Tracker'}
              </h1>
            </div>
            <div>
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