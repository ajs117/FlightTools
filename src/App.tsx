import React, { useState } from 'react';
import FlightCalculator from './components/FlightCalculator';
import { FlightTracker } from './components/FlightTracker';
import { ThemeProvider, useTheme } from './context/ThemeContext';

const AppContent: React.FC = () => {
  const [currentView, setCurrentView] = useState<'calculator' | 'tracker'>('tracker');
  const { isDarkMode, toggleTheme } = useTheme();

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
                onClick={() => setCurrentView('tracker')}
                className={`px-4 py-2 rounded-md ${
                  currentView === 'tracker'
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
                onClick={() => setCurrentView('calculator')}
                className={`px-4 py-2 rounded-md ${
                  currentView === 'calculator'
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
        {currentView === 'tracker' && <FlightTracker />}
        {currentView === 'calculator' && <FlightCalculator />}
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