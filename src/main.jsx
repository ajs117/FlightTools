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

// Service worker:
// - Register only in production builds
// - Unregister in dev to prevent stubborn caching during development
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const isProd = Boolean(import.meta?.env?.PROD);
    const publicUrl = (import.meta && import.meta.env && import.meta.env.BASE_URL) || '';
    const swUrl = `${publicUrl}service-worker.js`;

    if (!isProd) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(() => {});
      return;
    }

    try {
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
