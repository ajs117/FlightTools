import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

export interface GlobeMarker {
  id: string;
  lat: number;
  lng: number;
  image: string;
  size?: number;
  rotationDeg?: number;
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
}

export interface CesiumGlobeRef {
  setView: (opts: { lat: number; lng: number; height: number; headingDeg?: number; pitchDeg?: number }) => void;
  upsertMarker: (marker: GlobeMarker) => void;
  removeMarker: (id: string) => void;
  upsertPolyline: (poly: CesiumPolyline) => void;
  removePolyline: (id: string) => void;
  upsertEllipse: (ellipse: CesiumEllipse) => void;
  removeEllipse: (id: string) => void;
  getViewRectangle: () => { west: number; south: number; east: number; north: number } | null;
  getCameraHeight: () => number | null;
}

const TOP_DOWN_PITCH = Cesium.Math.toRadians(-85);

const CesiumGlobe = forwardRef<CesiumGlobeRef, CesiumGlobeProps>(function CesiumGlobe(
  { isDarkMode, initialCenter = { lat: 0, lng: 0, height: 300000 }, minZoom = 10000, maxZoom = 20000000, onClick, onViewChange },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const imageryProvider = new Cesium.UrlTemplateImageryProvider({
      url: isDarkMode
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c', 'd'],
      credit: '© OpenStreetMap contributors, © CARTO',
    });

    const viewer = new Cesium.Viewer(containerRef.current, {
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

    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(imageryProvider);
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = minZoom;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = maxZoom;

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(initialCenter.lng, initialCenter.lat, initialCenter.height ?? 300000),
      orientation: { heading: 0, pitch: TOP_DOWN_PITCH, roll: 0 },
    });

    // Click handler
    if (onClick) {
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((movement: any) => {
        const cartesian = viewer.camera.pickEllipsoid(movement.position, Cesium.Ellipsoid.WGS84);
        if (cartesian) {
          const cartographic = Cesium.Ellipsoid.WGS84.cartesianToCartographic(cartesian);
          const lat = Cesium.Math.toDegrees(cartographic.latitude);
          const lng = Cesium.Math.toDegrees(cartographic.longitude);
          onClick(lat, lng);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    if (onViewChange) {
      viewer.camera.changed.addEventListener(() => {
        onViewChange();
      });
    }

    viewerRef.current = viewer;
    return () => {
      viewer.entities.removeAll();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const newProvider = new Cesium.UrlTemplateImageryProvider({
      url: isDarkMode
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c', 'd'],
      credit: '© OpenStreetMap contributors, © CARTO',
    });
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(newProvider);
  }, [isDarkMode]);

  useImperativeHandle(ref, () => ({
    setView: ({ lat, lng, height, headingDeg, pitchDeg = -85 }) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const destination = Cesium.Cartesian3.fromDegrees(lng, lat, height);
      viewer.camera.setView({
        destination,
        orientation: {
          // Keep current camera heading unless an explicit heading is provided
          heading: headingDeg === undefined ? viewer.camera.heading : Cesium.Math.toRadians(headingDeg),
          pitch: Cesium.Math.toRadians(pitchDeg),
          roll: 0,
        },
      });
    },
    upsertMarker: (marker) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const existing = viewer.entities.getById(marker.id);
      const position = Cesium.Cartesian3.fromDegrees(marker.lng, marker.lat, 0);
      if (existing) {
        existing.position = new Cesium.ConstantPositionProperty(position);
        if (existing.billboard) {
          // Heading is clockwise degrees from North; Cesium billboard rotation is counter-clockwise in radians → invert sign
          existing.billboard.rotation = new Cesium.ConstantProperty(Cesium.Math.toRadians(-(marker.rotationDeg ?? 0)));
          const baseScale = marker.size ? marker.size / 24 : 1;
          existing.billboard.scale = new Cesium.ConstantProperty(baseScale);
          existing.billboard.scaleByDistance = new Cesium.ConstantProperty(
            new Cesium.NearFarScalar(
              8.0e4, Math.max(baseScale * 0.8, 0.3),
              3.0e6, Math.max(baseScale * 0.2, 0.18)
            )
          );
        }
      } else {
        viewer.entities.add({
          id: marker.id,
          position: new Cesium.ConstantPositionProperty(position),
          billboard: new Cesium.BillboardGraphics({
            image: marker.image,
            // Base scale derived from provided size; further adjusted by scaleByDistance
            scale: new Cesium.ConstantProperty(marker.size ? marker.size / 24 : 1),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            rotation: new Cesium.ConstantProperty(Cesium.Math.toRadians(-(marker.rotationDeg ?? 0))),
            alignedAxis: new Cesium.ConstantProperty(Cesium.Cartesian3.ZERO),
            // Scale with camera distance so it looks appropriate at different zoom levels
            scaleByDistance: new Cesium.ConstantProperty(
              new Cesium.NearFarScalar(
                8.0e4, Math.max((marker.size ? marker.size / 24 : 1) * 0.8, 0.3),
                3.0e6, Math.max((marker.size ? marker.size / 24 : 1) * 0.2, 0.18)
              )
            ),
          }),
        });
      }
    },
    removeMarker: (id) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const entity = viewer.entities.getById(id);
      if (entity) viewer.entities.remove(entity);
    },
    upsertPolyline: (poly) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const existing = viewer.entities.getById(poly.id);
      const positions = poly.positions.map(p => Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.height ?? 0));
      const color = poly.colorCss ? Cesium.Color.fromCssColorString(poly.colorCss) : Cesium.Color.fromCssColorString('#2563EB');
      const material = new Cesium.ColorMaterialProperty(color);
      if (existing) {
        if (existing.polyline) {
          existing.polyline.positions = new Cesium.ConstantProperty(positions);
          existing.polyline.width = new Cesium.ConstantProperty(poly.width ?? 3);
          existing.polyline.material = material;
        }
      } else {
        viewer.entities.add({
          id: poly.id,
          polyline: new Cesium.PolylineGraphics({
            positions,
            width: new Cesium.ConstantProperty(poly.width ?? 3),
            material,
          }),
        });
      }
    },
    removePolyline: (id) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const entity = viewer.entities.getById(id);
      if (entity) viewer.entities.remove(entity);
    },
    upsertEllipse: (ellipse) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const existing = viewer.entities.getById(ellipse.id);
      const position = Cesium.Cartesian3.fromDegrees(ellipse.lng, ellipse.lat);
      const color = Cesium.Color.fromCssColorString(ellipse.colorCss ?? '#3b82f6').withAlpha(ellipse.fillAlpha ?? 0.2);
      const material = new Cesium.ColorMaterialProperty(color);
      if (existing) {
        if (existing.ellipse) {
          existing.position = new Cesium.ConstantPositionProperty(position);
          existing.ellipse.semiMajorAxis = new Cesium.ConstantProperty(ellipse.radiusMeters);
          existing.ellipse.semiMinorAxis = new Cesium.ConstantProperty(ellipse.radiusMeters);
          existing.ellipse.material = material;
          existing.ellipse.outline = new Cesium.ConstantProperty(ellipse.outline ?? true);
          existing.ellipse.outlineColor = new Cesium.ConstantProperty(Cesium.Color.fromCssColorString(ellipse.colorCss ?? '#3b82f6'));
          existing.ellipse.outlineWidth = new Cesium.ConstantProperty(1);
        }
      } else {
        viewer.entities.add({
          id: ellipse.id,
          position: new Cesium.ConstantPositionProperty(position),
          ellipse: new Cesium.EllipseGraphics({
            semiMajorAxis: new Cesium.ConstantProperty(ellipse.radiusMeters),
            semiMinorAxis: new Cesium.ConstantProperty(ellipse.radiusMeters),
            height: new Cesium.ConstantProperty(0),
            material,
            outline: new Cesium.ConstantProperty(ellipse.outline ?? true),
            outlineColor: new Cesium.ConstantProperty(Cesium.Color.fromCssColorString(ellipse.colorCss ?? '#3b82f6')),
            outlineWidth: new Cesium.ConstantProperty(1),
          }),
        });
      }
    },
    removeEllipse: (id) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      const entity = viewer.entities.getById(id);
      if (entity) viewer.entities.remove(entity);
    },
    getViewRectangle: () => {
      const viewer = viewerRef.current;
      if (!viewer) return null;
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
      if (!viewer) return null;
      const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(viewer.camera.position);
      return carto?.height ?? null;
    }
  }));

  return <div ref={containerRef} className="w-full h-full" />;
});

export default CesiumGlobe; 