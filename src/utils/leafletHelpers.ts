import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import planeIcon from '../plane-icon.svg';

// Track if leaflet has been initialized
let leafletInitialized = false;

/**
 * Initialize Leaflet
 * This ensures we only initialize once and fixes issues with default icons
 */
export const initializeLeaflet = (): void => {
  if (leafletInitialized) return;
  
  // Fix for default markers
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
  });
  
  leafletInitialized = true;
};

/**
 * Get the appropriate tile layer URL based on dark mode
 */
export const getTileLayerUrl = (isDarkMode: boolean): string => {
  return isDarkMode 
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
};

/**
 * Create a plane icon with the specified heading
 */
export const createPlaneIcon = (heading: number | null): L.DivIcon => {
  return L.divIcon({
    html: `<div style="transform: rotate(${heading || 0}deg)">
      <img src="${planeIcon}" alt="plane" style="width: 24px; height: 24px;" />
    </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
}; 