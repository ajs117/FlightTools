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