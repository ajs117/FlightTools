import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

type CesiumNs = typeof import('cesium');

export interface GlobeMarker {
  id: string;
  lat: number;
  lng: number;
  image: string;
  size?: number;
  rotationDeg?: number;
  scaleWithDistance?: boolean;
}

export interface CesiumPolyline {
  id: string;
  positions: Array<{ lat: number; lng: number; height?: number }>;
  colorCss?: string;
  width?: number;
}

export interface CesiumEllipse {
  id: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  colorCss?: string;
  fillAlpha?: number;
  outline?: boolean;
}

export interface CesiumGlobeProps {
  isDarkMode: boolean;
  initialCenter?: { lat: number; lng: number; height?: number };
  minZoom?: number;
  maxZoom?: number;
  onClick?: (lat: number, lng: number) => void;
  onViewChange?: () => void;
  basemap?: 'imagery' | 'streets' | 'hybrid';
}

export interface CesiumGlobeRef {
  setView: (opts: { lat: number; lng: number; height?: number; headingDeg?: number; pitchDeg?: number }) => void;
  setTime: (time: Date | null) => void;
  upsertMarker: (marker: GlobeMarker) => void;
  removeMarker: (id: string) => void;
  upsertPolyline: (poly: CesiumPolyline) => void;
  removePolyline: (id: string) => void;
  upsertEllipse: (ellipse: CesiumEllipse) => void;
  removeEllipse: (id: string) => void;
  getViewRectangle: () => { west: number; south: number; east: number; north: number } | null;
  getCameraHeight: () => number | null;
}

const DEFAULT_CENTER = { lat: 0, lng: 0, height: 300000 };
const DEFAULT_MIN_ZOOM = 10000;
const DEFAULT_MAX_ZOOM = 20000000;

const clampNumber = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function createImageryProvider(Cesium: CesiumNs, isDarkMode: boolean, basemap: 'imagery' | 'streets' | 'hybrid' = 'imagery') {
  // Use USGS Imagery Topo tiles as the single, default basemap (no API key required).
  return new Cesium.UrlTemplateImageryProvider({
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
    credit: '© USGS',
  });
}

const CesiumGlobe = forwardRef<CesiumGlobeRef, CesiumGlobeProps>(function CesiumGlobe(
  { isDarkMode, initialCenter = DEFAULT_CENTER, minZoom = DEFAULT_MIN_ZOOM, maxZoom = DEFAULT_MAX_ZOOM, onClick, onViewChange, basemap = 'imagery' },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cesiumRef = useRef<CesiumNs | null>(null);
  const viewerRef = useRef<any | null>(null);
  const handlerRef = useRef<any | null>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const viewChangedListenerRef = useRef<(() => void) | null>(null);

  const pendingActionsRef = useRef<Array<() => void>>([]);

  const isDarkModeRef = useRef(isDarkMode);
  const minZoomRef = useRef(minZoom);
  const maxZoomRef = useRef(maxZoom);
  const onClickRef = useRef<CesiumGlobeProps['onClick']>(onClick);
  const onViewChangeRef = useRef<CesiumGlobeProps['onViewChange']>(onViewChange);
  const initialCenterRef = useRef(initialCenter);
  const basemapRef = useRef<CesiumGlobeProps['basemap']>(undefined);

  useEffect(() => { isDarkModeRef.current = isDarkMode; }, [isDarkMode]);
  useEffect(() => { minZoomRef.current = minZoom; }, [minZoom]);
  useEffect(() => { maxZoomRef.current = maxZoom; }, [maxZoom]);
  useEffect(() => { onClickRef.current = onClick; }, [onClick]);
  useEffect(() => { onViewChangeRef.current = onViewChange; }, [onViewChange]);
  useEffect(() => { initialCenterRef.current = initialCenter; }, [initialCenter]);
  useEffect(() => { basemapRef.current = basemap; }, [basemap]);

  const requestRender = () => {
    try { viewerRef.current?.scene.requestRender(); } catch (_) {}
  };

  const applyCameraView = (opts: { lat: number; lng: number; height?: number; headingDeg?: number; pitchDeg?: number }) => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;
    const lat = clampNumber(opts.lat, 0);
    const lng = clampNumber(opts.lng, 0);
    // If height is omitted, preserve current camera height if possible.
    let height: number;
    if (typeof opts.height === 'number') {
      height = clampNumber(opts.height, DEFAULT_CENTER.height);
    } else {
      try {
        const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(viewer.camera.position);
        height = carto?.height ?? DEFAULT_CENTER.height;
      } catch (_) {
        height = DEFAULT_CENTER.height;
      }
    }
    const pitchDeg = clampNumber(opts.pitchDeg, -85);

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, height),
      orientation: {
        heading: opts.headingDeg === undefined ? viewer.camera.heading : Cesium.Math.toRadians(opts.headingDeg),
        pitch: Cesium.Math.toRadians(pitchDeg),
        roll: 0,
      },
    });
    requestRender();
  };

  // Create the Cesium Viewer ONCE, after dynamically loading Cesium.
  useEffect(() => {
    if (!containerRef.current) return;
    if (viewerRef.current) return;

    let destroyed = false;

    const init = async () => {
      try {
        const [Cesium] = await Promise.all([
          import('cesium'),
          import('cesium/Build/Cesium/Widgets/widgets.css'),
        ]);
        // Prevent Cesium from attempting to call Ion APIs without a token.
        // If you use Cesium Ion assets, set a valid token instead of ''.
        try { if (Cesium && Cesium.Ion) Cesium.Ion.defaultAccessToken = ''; } catch (e) {}
        if (destroyed) return;
        cesiumRef.current = Cesium;

        const viewer = new Cesium.Viewer(containerRef.current!, {
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          navigationHelpButton: false,
          timeline: false,
          animation: false,
          fullscreenButton: false,
          sceneModePicker: false,
          selectionIndicator: false,
          infoBox: false,
          shouldAnimate: false,
        });


        // Render only when needed (better for battery/CPU)
        viewer.scene.requestRenderMode = true;
        viewer.scene.maximumRenderTimeChange = Infinity;

        // Set chosen imagery and terrain providers
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(createImageryProvider(Cesium, isDarkModeRef.current, basemapRef.current));
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        // Enable dynamic lighting and atmosphere so the day/night terminator is visible
        try {
          if (viewer.scene && viewer.scene.globe) {
            viewer.scene.globe.enableLighting = true;
            viewer.scene.globe.dynamicAtmosphereLighting = true;
            viewer.scene.globe.dynamicAtmosphereLightingFromSun = true;
            viewer.scene.globe.showGroundAtmosphere = true;
            // tuning: make atmosphere lighting visible at common zooms
            viewer.scene.globe.atmosphereLightIntensity = 10;
          }
        } catch (e) {
          // ignore if running in environments without globe
        }

        // Reduce Cesium credit/logo sizes so they don't dominate the UI on mobile
        try {
          const style = document.createElement('style');
          style.innerHTML = `
            .cesium-credit { font-size: 10px !important; opacity: 0.85 !important; }
            .cesium-credit img { height: 14px !important; width: auto !important; vertical-align: middle !important; }
            .cesium-viewer-bottom { padding: 4px !important; }
            .cesium-credit-container { max-height: 28px !important; overflow: hidden !important; }
          `;
          // attach to the viewer container so rules are scoped
          containerRef.current?.appendChild(style);
        } catch (e) {
          // ignore DOM insertion issues
        }

        viewer.scene.screenSpaceCameraController.minimumZoomDistance = clampNumber(minZoomRef.current, DEFAULT_MIN_ZOOM);
        viewer.scene.screenSpaceCameraController.maximumZoomDistance = clampNumber(maxZoomRef.current, DEFAULT_MAX_ZOOM);

        // Touch friendliness: allow pan and pinch-zoom, but disable rotation
        // 'manipulation' enables pan and pinch-zoom on most browsers
        containerRef.current!.style.touchAction = 'manipulation';
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        containerRef.current!.style.webkitTapHighlightColor = 'transparent';

        // Configure camera controller: allow translate (pan) and zoom (pinch),
        // but prevent rotation/tilt via touch gestures.
        const ssc = viewer.scene.screenSpaceCameraController;
        ssc.enableTranslate = true;
        ssc.enableZoom = true;
        ssc.enableRotate = false;
        ssc.enableTilt = false;
        ssc.enableLook = false;

        // Click handler (always installed; callback can be undefined)
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement: any) => {
          const cb = onClickRef.current;
          if (!cb) return;
          const cartesian = viewer.camera.pickEllipsoid(movement.position, Cesium.Ellipsoid.WGS84);
          if (!cartesian) return;
          const cartographic = Cesium.Ellipsoid.WGS84.cartesianToCartographic(cartesian);
          cb(Cesium.Math.toDegrees(cartographic.latitude), Cesium.Math.toDegrees(cartographic.longitude));
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        handlerRef.current = handler;

        // View change handler (always installed; callback can be undefined)
        const viewChangedListener = () => {
          try { onViewChangeRef.current?.(); } catch (_) {}
        };
        viewer.camera.changed.addEventListener(viewChangedListener);
        viewChangedListenerRef.current = viewChangedListener;

        // Resize handling
        const resizeHandler = () => {
          try {
            viewer.resize();
            viewer.scene.requestRender();
          } catch (_) {}
        };
        resizeHandlerRef.current = resizeHandler;
        window.addEventListener('resize', resizeHandler);
        window.addEventListener('orientationchange', resizeHandler);

        viewerRef.current = viewer;

        // Apply initial view
        const center = initialCenterRef.current ?? DEFAULT_CENTER;
        applyCameraView({
          lat: clampNumber(center.lat, DEFAULT_CENTER.lat),
          lng: clampNumber(center.lng, DEFAULT_CENTER.lng),
          height: clampNumber(center.height, DEFAULT_CENTER.height),
          pitchDeg: -85,
          headingDeg: 0,
        });

        // Flush any queued calls made before Cesium was ready
        const pending = pendingActionsRef.current.splice(0, pendingActionsRef.current.length);
        pending.forEach(fn => {
          try { fn(); } catch (_) {}
        });

        requestRender();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to initialize Cesium', e);
      }
    };

    init();

    return () => {
      destroyed = true;
      try {
        if (resizeHandlerRef.current) {
          window.removeEventListener('resize', resizeHandlerRef.current);
          window.removeEventListener('orientationchange', resizeHandlerRef.current);
        }
      } catch (_) {}

      try {
        const viewer = viewerRef.current;
        if (viewer && viewChangedListenerRef.current) viewer.camera.changed.removeEventListener(viewChangedListenerRef.current);
      } catch (_) {}

      try {
        handlerRef.current?.destroy();
      } catch (_) {}
      handlerRef.current = null;

      try {
        const viewer = viewerRef.current;
        if (viewer) {
          viewer.entities.removeAll();
          viewer.destroy();
        }
      } catch (_) {}
      viewerRef.current = null;
      cesiumRef.current = null;
    };
    // Intentionally empty deps: create/destroy viewer exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update imagery without recreating the viewer.
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;
    viewer.imageryLayers.removeAll();

    // Support a hybrid (satellite + labels) mode using ArcGIS public tile services
    // so users can get a hybrid basemap without an API key.
    try {
      if (basemapRef.current === 'hybrid') {
        // Base satellite imagery
        viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          credit: '© Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        }));
        // Overlay reference labels / boundaries (transparent PNGs)
        const labelLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          credit: '© Esri, OpenStreetMap contributors',
        }));
        // Ensure labels render above base imagery
        labelLayer.alpha = 1.0;
        requestRender();
        return;
      }
    } catch (e) {
      // fall back to single-provider behavior on any error
    }

    viewer.imageryLayers.addImageryProvider(createImageryProvider(Cesium, isDarkMode, basemapRef.current));
    requestRender();
  }, [isDarkMode]);

  // Update zoom constraints without recreating the viewer.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = clampNumber(minZoom, DEFAULT_MIN_ZOOM);
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = clampNumber(maxZoom, DEFAULT_MAX_ZOOM);
    requestRender();
  }, [minZoom, maxZoom]);

  useImperativeHandle(ref, () => ({
    setView: (opts) => {
      if (!viewerRef.current || !cesiumRef.current) {
        pendingActionsRef.current.push(() => applyCameraView(opts));
        return;
      }
      applyCameraView(opts);
    },

    upsertMarker: (marker) => {
      const doIt = () => {
        const viewer = viewerRef.current;
        const Cesium = cesiumRef.current;
        if (!viewer || !Cesium) return;

        const existing = viewer.entities.getById(marker.id);
        const position = Cesium.Cartesian3.fromDegrees(marker.lng, marker.lat, 0);
        // Prefer rem-based sizing for responsiveness on mobile. If callers pass a
        // small numeric value (<= 8) we interpret it as `rem` units; if they pass
        // a larger value it's treated as legacy pixels to preserve backwards compat.
        const rootRemPx = (typeof window !== 'undefined') ? (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) : 16;
        let desiredPx: number;
        if (marker.size === undefined || marker.size === null) {
          desiredPx = 2 * rootRemPx; // default 2rem
        } else if (marker.size > 8) {
          // legacy: treat as pixels
          desiredPx = marker.size as number;
        } else {
          // treat as rem units
          desiredPx = (marker.size as number) * rootRemPx;
        }
        const clampedPx = Math.max(8, Math.min(192, Math.round(desiredPx)));
        // Prefer explicit pixel sizing so SVGs (which may not have intrinsic px dimensions)
        // render consistently across pages.
        const widthPx = clampedPx;
        const heightPx = clampedPx;
        const rotation = Cesium.Math.toRadians(-(marker.rotationDeg ?? 0));

        if (existing) {
          existing.position = new Cesium.ConstantPositionProperty(position);
          if (existing.billboard) {
            existing.billboard.image = new Cesium.ConstantProperty(marker.image);
            existing.billboard.rotation = new Cesium.ConstantProperty(rotation);
            existing.billboard.width = new Cesium.ConstantProperty(widthPx);
            existing.billboard.height = new Cesium.ConstantProperty(heightPx);
            existing.billboard.scale = new Cesium.ConstantProperty(1);
            existing.billboard.scaleByDistance = marker.scaleWithDistance === false
              ? undefined
              : new Cesium.ConstantProperty(
                  new Cesium.NearFarScalar(
                    1.0e3, 1.4,
                    6.0e6, 0.25
                  )
                );
          }
        } else {
          const billboardOpts: any = {
            image: new Cesium.ConstantProperty(marker.image),
            width: new Cesium.ConstantProperty(widthPx),
            height: new Cesium.ConstantProperty(heightPx),
            scale: new Cesium.ConstantProperty(1),
            rotation: new Cesium.ConstantProperty(rotation),
            verticalOrigin: new Cesium.ConstantProperty(Cesium.VerticalOrigin.CENTER),
            horizontalOrigin: new Cesium.ConstantProperty(Cesium.HorizontalOrigin.CENTER),
            heightReference: new Cesium.ConstantProperty(Cesium.HeightReference.CLAMP_TO_GROUND),
            disableDepthTestDistance: new Cesium.ConstantProperty(Number.POSITIVE_INFINITY),
          };

          if (marker.scaleWithDistance !== false) {
            billboardOpts.scaleByDistance = new Cesium.ConstantProperty(
              new Cesium.NearFarScalar(
                1.0e3, 1.4,
                6.0e6, 0.25
              )
            );
          }

          viewer.entities.add({
            id: marker.id,
            position: new Cesium.ConstantPositionProperty(position),
            billboard: new Cesium.BillboardGraphics(billboardOpts),
          });
        }

        requestRender();
      };

      if (!viewerRef.current || !cesiumRef.current) {
        pendingActionsRef.current.push(doIt);
        return;
      }
      doIt();
    },

    setTime: (time) => {
      const doIt = () => {
        const viewer = viewerRef.current;
        const Cesium = cesiumRef.current;
        if (!viewer || !Cesium) return;
        try {
          const t = time ? Cesium.JulianDate.fromDate(time) : Cesium.JulianDate.fromDate(new Date());
          viewer.clock.shouldAnimate = false;
          viewer.clock.currentTime = t;
          // ensure lighting updates
          if (viewer.scene && viewer.scene.globe) viewer.scene.requestRender();
        } catch (e) { /* ignore */ }
      };
      if (!viewerRef.current || !cesiumRef.current) {
        pendingActionsRef.current.push(doIt);
        return;
      }
      doIt();
    },

    removeMarker: (id) => {
      const doIt = () => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const entity = viewer.entities.getById(id);
        if (entity) viewer.entities.remove(entity);
        requestRender();
      };
      if (!viewerRef.current) {
        pendingActionsRef.current.push(doIt);
        return;
      }
      doIt();
    },

    upsertPolyline: (poly) => {
      const doIt = () => {
        const viewer = viewerRef.current;
        const Cesium = cesiumRef.current;
        if (!viewer || !Cesium) return;

        const existing = viewer.entities.getById(poly.id);
        const positions = poly.positions.map(p => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.height ?? 0));
        const defaultPolylineColor = isDarkModeRef.current ? '#60A5FA' : '#2563EB';
        const color = Cesium.Color.fromCssColorString(poly.colorCss ?? defaultPolylineColor);
        const material = new Cesium.ColorMaterialProperty(color);

        if (existing?.polyline) {
          existing.polyline.positions = new Cesium.ConstantProperty(positions);
          existing.polyline.width = new Cesium.ConstantProperty(poly.width ?? 3);
          existing.polyline.material = material;
        } else {
          viewer.entities.add({
            id: poly.id,
            polyline: new Cesium.PolylineGraphics({
              positions: new Cesium.ConstantProperty(positions),
              width: new Cesium.ConstantProperty(poly.width ?? 3),
              material,
            }),
          });
        }
        requestRender();
      };

      if (!viewerRef.current || !cesiumRef.current) {
        pendingActionsRef.current.push(doIt);
        return;
      }
      doIt();
    },

    removePolyline: (id) => {
      const doIt = () => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const entity = viewer.entities.getById(id);
        if (entity) viewer.entities.remove(entity);
        requestRender();
      };
      if (!viewerRef.current) {
        pendingActionsRef.current.push(doIt);
        return;
      }
      doIt();
    },

    upsertEllipse: (ellipse) => {
      const doIt = () => {
        const viewer = viewerRef.current;
        const Cesium = cesiumRef.current;
        if (!viewer || !Cesium) return;

        const existing = viewer.entities.getById(ellipse.id);
        const position = Cesium.Cartesian3.fromDegrees(ellipse.lng, ellipse.lat, 0);
        const defaultEllipseColor = isDarkModeRef.current ? '#60A5FA' : '#3b82f6';
        const fillAlpha = clampNumber(ellipse.fillAlpha, 0.2);
        const outline = ellipse.outline ?? true;
        const outlineColorCss = ellipse.colorCss ?? defaultEllipseColor;
        const fillColor = Cesium.Color.fromCssColorString(outlineColorCss).withAlpha(fillAlpha);
        const material = new Cesium.ColorMaterialProperty(fillColor);

        if (existing?.ellipse) {
          existing.position = new Cesium.ConstantPositionProperty(position);
          existing.ellipse.semiMajorAxis = new Cesium.ConstantProperty(ellipse.radiusMeters);
          existing.ellipse.semiMinorAxis = new Cesium.ConstantProperty(ellipse.radiusMeters);
          existing.ellipse.material = material;
          existing.ellipse.outline = new Cesium.ConstantProperty(outline);
          existing.ellipse.outlineColor = new Cesium.ConstantProperty(Cesium.Color.fromCssColorString(outlineColorCss));
          existing.ellipse.outlineWidth = new Cesium.ConstantProperty(1);
        } else {
          viewer.entities.add({
            id: ellipse.id,
            position: new Cesium.ConstantPositionProperty(position),
            ellipse: new Cesium.EllipseGraphics({
              semiMajorAxis: new Cesium.ConstantProperty(ellipse.radiusMeters),
              semiMinorAxis: new Cesium.ConstantProperty(ellipse.radiusMeters),
              height: new Cesium.ConstantProperty(0),
              material,
              outline: new Cesium.ConstantProperty(outline),
              outlineColor: new Cesium.ConstantProperty(Cesium.Color.fromCssColorString(outlineColorCss)),
              outlineWidth: new Cesium.ConstantProperty(1),
            }),
          });
        }
        requestRender();
      };

      if (!viewerRef.current || !cesiumRef.current) {
        pendingActionsRef.current.push(doIt);
        return;
      }
      doIt();
    },

    removeEllipse: (id) => {
      const doIt = () => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const entity = viewer.entities.getById(id);
        if (entity) viewer.entities.remove(entity);
        requestRender();
      };
      if (!viewerRef.current) {
        pendingActionsRef.current.push(doIt);
        return;
      }
      doIt();
    },

    getViewRectangle: () => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || !Cesium) return null;
      const rect = viewer.camera.computeViewRectangle(Cesium.Ellipsoid.WGS84);
      if (!rect) return null;
      return {
        west: Cesium.Math.toDegrees(rect.west),
        south: Cesium.Math.toDegrees(rect.south),
        east: Cesium.Math.toDegrees(rect.east),
        north: Cesium.Math.toDegrees(rect.north),
      };
    },

    getCameraHeight: () => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || !Cesium) return null;
      const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(viewer.camera.position);
      return carto?.height ?? null;
    },
  }));

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ width: '100%', height: '100%', minHeight: 300, touchAction: 'none' }}
    />
  );
});

export default CesiumGlobe;