import { AllAircraftData } from '../models';

export interface OpenSkyStateResponse {
  time: number;
  states: any[] | null;
}

const BASE = 'https://opensky-network.org/api';

export async function fetchStatesAll(): Promise<OpenSkyStateResponse> {
  const response = await fetch(`${BASE}/states/all?time=0&callback=`);
  if (!response.ok) throw new Error(`OpenSky error: ${response.status}`);
  return response.json();
}

export async function getAllAircraftData(): Promise<AllAircraftData[]> {
  const data = await fetchStatesAll();
  if (!data.states || data.states.length === 0) return [];
  return data.states
    .filter((state: any[]) => state[5] && state[6] && !isNaN(state[5]) && !isNaN(state[6]) && !state[8])
    .map((state: any[]) => ({
      icao24: state[0],
      callsign: state[1]?.trim(),
      latitude: state[6],
      longitude: state[5],
      altitude: state[7] || 0,
      direction: state[10] || 0,
      speed: state[9] ? state[9] * 3.6 : 0,
      isOnGround: Boolean(state[8]),
    }));
}

export async function findStateByFlightNumber(flightNumber: string): Promise<any[] | null> {
  const data = await fetchStatesAll();
  if (!data.states || data.states.length === 0) return null;
  const state = data.states.find((s: any[]) => s[1] && s[1].trim().includes(flightNumber.toUpperCase()));
  return state || null;
}