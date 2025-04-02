import React, { useState } from 'react';
import FlightCalculator from './components/FlightCalculator';
import { FlightTracker } from './components/FlightTracker';
import { FlightPlanDrawer } from './components/FlightPlanDrawer';
import InFlightTracker from './components/InFlightTracker';
import { ThemeProvider, useTheme } from './context/ThemeContext';

interface NavTabProps {
  id: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const NavTab: React.FC<NavTabProps> = ({ id, label, isActive, onClick }) => {
  const { isDarkMode } = useTheme();
  
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-md ${
        isActive
          ? isDarkMode 
            ? 'bg-blue-500 text-white' 
            : 'bg-blue-600 text-white'
          : isDarkMode
            ? 'text-gray-300 hover:bg-gray-700'
            : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
};

interface ThemeToggleProps {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ isDarkMode, toggleTheme }) => (
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
);

// Define available tabs and their labels
const TABS = [
  { id: 'calculator', label: 'Flight Calculator' },
  { id: 'tracker', label: 'Flight Tracker' },
  { id: 'drawer', label: 'Flight Plan Drawer' },
  { id: 'inflight', label: 'In-Flight Tracker' }
];

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tracker');
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
              {TABS.map(tab => (
                <NavTab 
                  key={tab.id}
                  id={tab.id}
                  label={tab.label}
                  isActive={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                />
              ))}
              <div className="ml-auto">
                <ThemeToggle isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
              </div>
            </div>
          </div>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-4 py-3">
        {activeTab === 'calculator' && <FlightCalculator />}
        {activeTab === 'tracker' && <FlightTracker />}
        {activeTab === 'drawer' && <FlightPlanDrawer />}
        {activeTab === 'inflight' && <InFlightTracker />}
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