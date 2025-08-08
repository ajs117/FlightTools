export interface Location {
  lat: number;
  lng: number;
  name?: string;
}

export interface FlightData {
  flight: {
    number: string;
    iata: string;
  };
  departure: {
    airport: string;
    timezone: string;
  };
  arrival: {
    airport: string;
    timezone: string;
  };
  airline: {
    name: string;
  };
  live: {
    latitude: number;
    longitude: number;
    altitude: number;
    direction: number;
    speed_horizontal: number;
    speed_vertical: number;
    is_ground: boolean;
    updated: string;
  };
}

export interface AllAircraftData {
  icao24: string;
  callsign?: string;
  latitude: number;
  longitude: number;
  altitude: number;
  direction: number;
  speed: number;
  isOnGround: boolean;
}

export interface InterpolatedPosition {
  lat: number;
  lng: number;
  name: string;
  timestamp?: number;
}

export interface Waypoint {
  lat: number;
  lng: number;
  name?: string;
  type?: 'airport' | 'waypoint';
} 