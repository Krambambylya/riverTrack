import type { RoutePoint } from '@/entities/route';
import { DEFAULT_MAP_REGION_CENTER } from '@/shared/config/map-defaults';

export type AppleMapsCameraPosition = {
  coordinates: { latitude: number; longitude: number };
  zoom: number;
};

export function zoomLevelFromGeoSpan(maxSpan: number): number {
  if (maxSpan < 0.01) return 14;
  if (maxSpan < 0.03) return 13;
  if (maxSpan < 0.08) return 12;
  if (maxSpan < 0.16) return 11;
  return 10;
}

export function appleMapsCameraFromRoutePoints(
  points: RoutePoint[]
): AppleMapsCameraPosition | null {
  if (points.length < 2) return null;
  const latitudes = points.map((p) => p.latitude);
  const longitudes = points.map((p) => p.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const latSpan = Math.max(0.0001, maxLat - minLat);
  const lonSpan = Math.max(0.0001, maxLon - minLon);
  const maxSpan = Math.max(latSpan, lonSpan);
  return {
    coordinates: {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
    },
    zoom: zoomLevelFromGeoSpan(maxSpan),
  };
}

export function fallbackAppleMapsCamera(
  zoom: number,
  coordinates: AppleMapsCameraPosition['coordinates'] = DEFAULT_MAP_REGION_CENTER
): AppleMapsCameraPosition {
  return { coordinates, zoom };
}
