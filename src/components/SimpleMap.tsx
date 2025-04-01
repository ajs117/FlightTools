import React from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export const SimpleMap: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">Simple Map</h1>
      
      <div className="bg-white rounded-lg shadow p-4 max-w-6xl mx-auto">
        <div className="h-[500px] bg-gray-50 rounded border">
          <MapContainer
            style={{ height: '100%', width: '100%' }}
            center={[51.505, -0.09]}
            zoom={2}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}; 