import 'leaflet';

declare module 'leaflet' {
  namespace TileLayer {
    interface OfflineOptions extends TileLayerOptions {
      subdomains?: string;
    }

    class Offline extends TileLayer {
      constructor(urlTemplate: string, options?: OfflineOptions);
      getTileUrls(bounds: LatLngBounds, zoom: number): string[];
      preCache(urls: string[]): Promise<void>;
    }
  }

  namespace tileLayer {
    function offline(urlTemplate: string, options?: TileLayer.OfflineOptions): TileLayer.Offline;
  }
} 