import React, { useState, Suspense, lazy, useEffect } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import InFlightTracker from './components/InFlightTracker';

// Lazy load components with key-based remounting
const FlightCalculator = lazy(() => import('./components/FlightCalculator'));
const FlightTracker = lazy(() => import('./components/FlightTracker'));
const FlightPlanDrawer = lazy(() => import('./components/FlightPlanDrawer'));

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const { isDarkMode, toggleTheme, theme } = useTheme();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const checkConnection = async () => {
    try {
      // First check if we have any network connection type
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (connection && connection.type === 'none') {
        return false;
      }

      // Then verify with a network request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return true;
    } catch (error) {
      return false;
    }
  };

  useEffect(() => {
    const handleOnline = async () => {
      const isActuallyOnline = await checkConnection();
      setIsOnline(isActuallyOnline);
    };

    const handleOffline = async () => {
      const isActuallyOffline = !(await checkConnection());
      if (isActuallyOffline) {
        setIsOnline(false);
        // Force a re-render of the homepage cards
        if (activeTab === null) {
          setActiveTab('temp');
          setTimeout(() => setActiveTab(null), 0);
        }
      }
    };

    // Check for network type changes
    const handleNetworkChange = async () => {
      const isActuallyOnline = await checkConnection();
      if (isActuallyOnline !== isOnline) {
        setIsOnline(isActuallyOnline);
        if (!isActuallyOnline && activeTab === null) {
          setActiveTab('temp');
          setTimeout(() => setActiveTab(null), 0);
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Add network type change listener if available
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      connection.addEventListener('change', handleNetworkChange);
    }

    // Add polling mechanism
    const checkOnlineStatus = async () => {
      const newOnlineStatus = await checkConnection();
      if (newOnlineStatus !== isOnline) {
        setIsOnline(newOnlineStatus);
        if (!newOnlineStatus && activeTab === null) {
          setActiveTab('temp');
          setTimeout(() => setActiveTab(null), 0);
        }
      }
    };
    
    // Initial check
    checkOnlineStatus();
    
    // Use more frequent polling for mobile devices
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const intervalId = setInterval(checkOnlineStatus, isMobile ? 2000 : 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', handleNetworkChange);
      }
      clearInterval(intervalId);
    };
  }, [activeTab, isOnline]);

  const navigateToHome = () => {
    setActiveTab(null);
  };

  // If no tool is selected, show the homepage with grid of tools
  if (activeTab === null) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'}`} style={{ backgroundColor: theme.background.main }}>
        <nav className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`} style={{ backgroundColor: theme.background.card }}>
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
            <div className="flex items-center justify-between">
              <h1 className={`text-lg sm:text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`} style={{ color: theme.text.primary }}>
                Flight Tools
              </h1>
              <div className="flex items-center gap-4">
                {!isOnline && (
                  <div className={`text-sm ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`} style={{ color: theme.accent.warning }}>
                    Offline Mode
                  </div>
                )}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={isDarkMode}
                    onChange={toggleTheme}
                  />
                  <div className={`w-16 h-8 rounded-full peer ${
                    isDarkMode 
                      ? 'bg-gray-700 peer-checked:bg-gray-800' 
                      : 'bg-blue-200 peer-checked:bg-blue-300'
                  }`} style={{ backgroundColor: isDarkMode ? theme.primary.dark : theme.primary.light }}>
                    <div className={`absolute left-1 top-1 w-6 h-6 rounded-full transition-all flex items-center justify-center ${
                      isDarkMode 
                        ? 'translate-x-8 bg-gray-900' 
                        : 'bg-white'
                    }`} style={{ backgroundColor: isDarkMode ? theme.background.main : theme.background.card }}>
                      {isDarkMode ? (
                        <svg className="w-4 h-4 text-yellow-300" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </nav>
        
        <div className="max-w-6xl mx-auto p-3 sm:p-6">
          <div className="text-center mb-6 sm:mb-8">
            <h2 className={`text-2xl sm:text-3xl font-bold mb-1 sm:mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`} style={{ color: theme.text.primary }}>
              Welcome to Flight Tools
            </h2>
            <p className={`text-base sm:text-lg ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`} style={{ color: theme.text.secondary }}>
              Select a tool to get started
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div 
              onClick={() => setActiveTab('inflight')}
              className={`cursor-pointer rounded-xl shadow-lg p-4 sm:p-6 transform transition-all hover:scale-105 ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-red-50'
              } flex flex-col items-center justify-center aspect-square`}
              style={{ 
                backgroundColor: theme.background.card
              }}
            >
              <div className={`text-4xl sm:text-5xl mb-3 sm:mb-4 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} style={{ color: theme.primary.main }}>
                🧭
              </div>
              <h3 className={`text-lg sm:text-xl font-bold mb-1 sm:mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`} style={{ color: theme.text.primary }}>
                In-Flight Tracker
              </h3>
              <p className={`text-center text-sm sm:text-base ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} style={{ color: theme.text.secondary }}>
                Monitor flight progress and details
              </p>
            </div>
            
            <div 
              onClick={() => {
                if (isOnline) {
                  setActiveTab('calculator');
                }
              }}
              className={`cursor-pointer rounded-xl shadow-lg p-4 sm:p-6 transform transition-all ${
                isOnline ? 'hover:scale-105' : 'cursor-not-allowed'
              } ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-blue-50'
              } flex flex-col items-center justify-center aspect-square ${!isOnline ? 'opacity-50' : ''}`}
              style={{ 
                backgroundColor: theme.background.card
              }}
            >
              <div className={`text-4xl sm:text-5xl mb-3 sm:mb-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} style={{ color: theme.primary.main }}>
                ✈️
              </div>
              <h3 className={`text-lg sm:text-xl font-bold mb-1 sm:mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`} style={{ color: theme.text.primary }}>
                Flight Calculator
              </h3>
              <p className={`text-center text-sm sm:text-base ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} style={{ color: theme.text.secondary }}>
                Calculate flight metrics and distances
              </p>
              {!isOnline && (
                <p className={`text-center text-xs mt-2 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`} style={{ color: theme.accent.warning }}>
                  Requires internet connection
                </p>
              )}
            </div>
            
            <div 
              onClick={() => {
                if (isOnline) {
                  setActiveTab('tracker');
                }
              }}
              className={`cursor-pointer rounded-xl shadow-lg p-4 sm:p-6 transform transition-all ${
                isOnline ? 'hover:scale-105' : 'cursor-not-allowed'
              } ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-green-50'
              } flex flex-col items-center justify-center aspect-square ${!isOnline ? 'opacity-50' : ''}`}
              style={{ 
                backgroundColor: theme.background.card
              }}
            >
              <div className={`text-4xl sm:text-5xl mb-3 sm:mb-4 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} style={{ color: theme.primary.main }}>
                🛫
              </div>
              <h3 className={`text-lg sm:text-xl font-bold mb-1 sm:mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`} style={{ color: theme.text.primary }}>
                Flight Tracker
              </h3>
              <p className={`text-center text-sm sm:text-base ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} style={{ color: theme.text.secondary }}>
                Track real-time flights around the world
              </p>
              {!isOnline && (
                <p className={`text-center text-xs mt-2 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`} style={{ color: theme.accent.warning }}>
                  Requires internet connection
                </p>
              )}
            </div>
            
            <div 
              onClick={() => {
                if (isOnline) {
                  setActiveTab('drawer');
                }
              }}
              className={`cursor-pointer rounded-xl shadow-lg p-4 sm:p-6 transform transition-all ${
                isOnline ? 'hover:scale-105' : 'cursor-not-allowed'
              } ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-purple-50'
              } flex flex-col items-center justify-center aspect-square ${!isOnline ? 'opacity-50' : ''}`}
              style={{ 
                backgroundColor: theme.background.card
              }}
            >
              <div className={`text-4xl sm:text-5xl mb-3 sm:mb-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} style={{ color: theme.primary.main }}>
                🗺️
              </div>
              <h3 className={`text-lg sm:text-xl font-bold mb-1 sm:mb-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`} style={{ color: theme.text.primary }}>
                Flight Plan Drawer
              </h3>
              <p className={`text-center text-sm sm:text-base ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} style={{ color: theme.text.secondary }}>
                Create and export custom flight plans
              </p>
              {!isOnline && (
                <p className={`text-center text-xs mt-2 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`} style={{ color: theme.accent.warning }}>
                  Requires internet connection
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show the selected tool with a back button
  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'}`} style={{ backgroundColor: theme.background.main }}>
      <nav className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`} style={{ backgroundColor: theme.background.card }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button 
                onClick={navigateToHome}
                className={`mr-2 sm:mr-3 px-2 sm:px-3 py-1 rounded text-sm hover:opacity-80`}
                style={{ 
                  backgroundColor: theme.primary.main,
                  color: theme.text.primary,
                  border: `1px solid ${theme.border.main}`
                }}
              >
                ← Back
              </button>
              <h1 className={`text-lg sm:text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`} style={{ color: theme.text.primary }}>
                {activeTab === 'calculator' && 'Flight Calculator'}
                {activeTab === 'tracker' && 'Flight Tracker'}
                {activeTab === 'drawer' && 'Flight Plan Drawer'}
                {activeTab === 'inflight' && 'In-Flight Tracker'}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {!isOnline && (
                <div className={`text-sm ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`} style={{ color: theme.accent.warning }}>
                  Offline Mode
                </div>
              )}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isDarkMode}
                  onChange={toggleTheme}
                />
                <div className={`w-16 h-8 rounded-full peer ${
                  isDarkMode 
                    ? 'bg-gray-700 peer-checked:bg-gray-800' 
                    : 'bg-blue-200 peer-checked:bg-blue-300'
                }`} style={{ backgroundColor: isDarkMode ? theme.primary.dark : theme.primary.light }}>
                  <div className={`absolute left-1 top-1 w-6 h-6 rounded-full transition-all flex items-center justify-center ${
                    isDarkMode 
                      ? 'translate-x-8 bg-gray-900' 
                      : 'bg-white'
                  }`} style={{ backgroundColor: isDarkMode ? theme.background.main : theme.background.card }}>
                    {isDarkMode ? (
                      <svg className="w-4 h-4 text-yellow-300" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>
      </nav>
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-3">
        {!isOnline && activeTab !== 'inflight' && (
          <div className={`mb-4 p-4 rounded-lg ${isDarkMode ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800'}`} 
            style={{ 
              backgroundColor: isDarkMode ? theme.accent.warning + '20' : theme.accent.warning + '10',
              color: theme.accent.warning
            }}>
            This feature requires an internet connection. Please connect to the internet to use this tool.
          </div>
        )}
        <Suspense fallback={<div className={`text-center py-6 sm:py-10 ${isDarkMode ? 'text-white' : 'text-gray-800'}`} style={{ color: theme.text.primary }}>Loading...</div>}>
          {activeTab === 'calculator' && !isOnline && (
            <div className={`p-6 rounded-lg text-center ${isDarkMode ? 'bg-gray-800 text-yellow-400' : 'bg-white text-yellow-600'}`}>
              <div className="text-5xl mb-4">📡</div>
              <h3 className="text-xl font-bold mb-2">Internet Connection Required</h3>
              <p>The Flight Calculator requires an internet connection to function. Please connect to the internet and try again.</p>
            </div>
          )}
          {activeTab === 'tracker' && !isOnline && (
            <div className={`p-6 rounded-lg text-center ${isDarkMode ? 'bg-gray-800 text-yellow-400' : 'bg-white text-yellow-600'}`}>
              <div className="text-5xl mb-4">📡</div>
              <h3 className="text-xl font-bold mb-2">Internet Connection Required</h3>
              <p>The Flight Tracker requires an internet connection to function. Please connect to the internet and try again.</p>
            </div>
          )}
          {activeTab === 'drawer' && !isOnline && (
            <div className={`p-6 rounded-lg text-center ${isDarkMode ? 'bg-gray-800 text-yellow-400' : 'bg-white text-yellow-600'}`}>
              <div className="text-5xl mb-4">📡</div>
              <h3 className="text-xl font-bold mb-2">Internet Connection Required</h3>
              <p>The Flight Plan Drawer requires an internet connection to function. Please connect to the internet and try again.</p>
            </div>
          )}
          {activeTab === 'calculator' && isOnline && <FlightCalculator key={`calculator-${isOnline}`} />}
          {activeTab === 'tracker' && isOnline && <FlightTracker key={`tracker-${isOnline}`} />}
          {activeTab === 'drawer' && isOnline && <FlightPlanDrawer key={`drawer-${isOnline}`} />}
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