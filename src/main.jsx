import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Set Cesium base URL to CDN so Workers and Assets can load (cached by SW for offline after first use)
window.CESIUM_BASE_URL = 'https://cdn.jsdelivr.net/npm/cesium@1.117.0/Build/Cesium';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// In your index.js or App.js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      const publicUrl = (import.meta && import.meta.env && import.meta.env.BASE_URL) || '';
      const swUrl = `${publicUrl}service-worker.js`;
      navigator.serviceWorker.register(swUrl)
        .then(registration => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch(error => {
          console.error('Service Worker registration failed:', error);
        });
    } catch (e) {
      console.error('Service Worker registration error', e);
    }
  });
}

reportWebVitals();
